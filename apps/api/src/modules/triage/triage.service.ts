import { Types, HydratedDocument } from 'mongoose';
import { TriageSession, ITriageSession } from '../../models/TriageSession';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { callTriageAI, AIServiceUnavailableError } from './aiClient';
import { checkRedFlagLocally } from './redFlags';
import { localizeSpecialtyName } from '@medlink/shared';

const DISCLAIMER: Record<'en' | 'hi', string> = {
  en: 'This is guidance, not medical advice.',
  hi: 'यह मार्गदर्शन है, चिकित्सीय सलाह नहीं।',
};
const EMERGENCY_MESSAGE: Record<'en' | 'hi', string> = {
  en: 'This may be a medical emergency. Seek emergency care immediately or call 112.',
  hi: 'यह एक चिकित्सीय आपातकाल हो सकता है। तुरंत आपातकालीन देखभाल लें या 112 पर कॉल करें।',
};
const CLARIFYING_QUESTION_1: Record<'en' | 'hi', string> = {
  en: 'How long have you had these symptoms?',
  hi: 'आपको ये लक्षण कब से हैं?',
};
const CLARIFYING_QUESTION_2: Record<'en' | 'hi', string> = {
  en: 'How severe is it — mild, moderate, or severe?',
  hi: 'यह कितना गंभीर है — हल्का, मध्यम, या गंभीर?',
};
const AI_UNAVAILABLE_MESSAGE: Record<'en' | 'hi', string> = {
  en: "We're having trouble matching your symptoms automatically right now. Please start a new triage session in a few minutes to try again.",
  hi: 'अभी आपके लक्षणों का मिलान करने में समस्या आ रही है। कृपया कुछ मिनटों बाद एक नया सत्र शुरू करें।',
};

async function findRecommendedDoctors(
  suggestedSpecialties: { name: string; confidence: number }[]
): Promise<Types.ObjectId[]> {
  // Fill the 3 recommendation slots specialty-by-specialty in confidence
  // order: exhaust the AI's most-confident specialty's approved doctors
  // (sorted by rating) before considering the next specialty. This prevents
  // a highly-rated doctor in the AI's third-most-confident specialty from
  // outranking a lower-rated doctor in its top specialty, which is what a
  // flat pool-then-sort-by-rating query would do.
  const orderedByConfidence = [...suggestedSpecialties].sort((a, b) => b.confidence - a.confidence);
  const recommended: Types.ObjectId[] = [];
  const alreadyPicked = new Set<string>();

  for (const specialty of orderedByConfidence) {
    const remainingSlots = 3 - recommended.length;
    if (remainingSlots <= 0) break;

    const doctors = await DoctorProfile.find({
      specialties: specialty.name,
      verificationStatus: 'approved',
      _id: { $nin: [...alreadyPicked] },
    })
      .sort({ avgRating: -1 })
      .limit(remainingSlots);

    for (const doctor of doctors) {
      recommended.push(doctor._id);
      alreadyPicked.add(doctor._id.toString());
    }
  }

  return recommended;
}

function pushAssistantMessage(
  session: HydratedDocument<ITriageSession>,
  text: string,
  options: { includeDisclaimer?: boolean } = {}
): void {
  const includeDisclaimer = options.includeDisclaimer ?? true;
  const finalText = includeDisclaimer ? `${text} ${DISCLAIMER[session.language]}` : text;
  session.messages.push({ role: 'assistant', text: finalText, at: new Date() });
}

export async function sendTriageMessage(
  patientId: string,
  sessionId: string | undefined,
  text: string,
  language?: 'en' | 'hi'
): Promise<ITriageSession> {
  let session: HydratedDocument<ITriageSession> | null;

  if (sessionId) {
    session = await TriageSession.findOne({ _id: sessionId, patientId });
    if (!session) throw new AppError(404, 'Triage session not found', 'TRIAGE_SESSION_NOT_FOUND');
    // `language`, if sent on an existing session, is ignored -- the session's
    // stored language always wins. A session's fixed clarifying-question
    // script and its emergency copy must stay in one language throughout.
  } else {
    session = await TriageSession.create({
      patientId: new Types.ObjectId(patientId),
      language: language ?? 'en',
      disclaimerShownAt: new Date(),
    });
  }

  // Red-flag detection takes absolute priority over every other rule,
  // including the terminal-session guard below: a patient describing a new
  // emergency must always get the emergency response, even if their session
  // already ended (an earlier emergency, or a completed 3-turn flow). It
  // runs locally, on every turn's own new text, before anything else -- this
  // protects against the AI service being down (no remote dependency at all)
  // and catches a red flag that only appears partway through the
  // conversation, or after triage has already finished.
  const matchedKeyword = checkRedFlagLocally(text, session.language);
  if (matchedKeyword || session.isRedFlag) {
    session.isRedFlag = true;
    session.messages.push({ role: 'user', text, at: new Date() });
    pushAssistantMessage(session, EMERGENCY_MESSAGE[session.language], { includeDisclaimer: false });
    await session.save();
    return session;
  }

  // A non-emergency session that already completed its 3-turn flow is
  // terminal -- it does not accept further ordinary messages, bounding
  // unlimited re-querying of the AI-backed match. This check runs before the
  // new message is persisted, so a rejected call does not silently grow the
  // session.
  const priorUserTurns = session.messages.filter((m) => m.role === 'user').length;
  if (priorUserTurns >= 3) {
    throw new AppError(409, 'This triage session has already ended. Start a new session for a new symptom.', 'TRIAGE_SESSION_CLOSED');
  }

  session.messages.push({ role: 'user', text, at: new Date() });
  const turnCount = priorUserTurns + 1;

  if (turnCount === 1) {
    pushAssistantMessage(session, CLARIFYING_QUESTION_1[session.language]);
    await session.save();
    return session;
  }

  if (turnCount === 2) {
    pushAssistantMessage(session, CLARIFYING_QUESTION_2[session.language]);
    await session.save();
    return session;
  }

  // turnCount === 3: combine the whole conversation into one description and
  // call the AI service for the real specialty match. The red-flag check
  // above already covered this turn's own text locally; the AI is now only
  // ever consulted for specialty matching, never for emergency detection.
  const combinedText = session.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ');

  try {
    const aiResult = await callTriageAI(combinedText, session.language);
    session.extractedSymptoms = aiResult.extractedSymptoms;
    session.suggestedSpecialties = aiResult.suggestedSpecialties;
    session.recommendedDoctorIds = await findRecommendedDoctors(aiResult.suggestedSpecialties);
    session.aiUnavailable = false;
    const specialtyNames = aiResult.suggestedSpecialties
      .map((s) => localizeSpecialtyName(s.name, session.language))
      .join(session.language === 'hi' ? '، ' : ', ');
    const summarySentence =
      session.language === 'hi'
        ? `आपके बताए लक्षणों के आधार पर, आपको दिखाना चाहिए: ${specialtyNames}।`
        : `Based on what you've described, you may want to see: ${specialtyNames}.`;
    pushAssistantMessage(session, summarySentence);
  } catch (err) {
    if (!(err instanceof AIServiceUnavailableError)) throw err;
    session.aiUnavailable = true;
    pushAssistantMessage(session, AI_UNAVAILABLE_MESSAGE[session.language]);
  }

  await session.save();
  return session;
}
