import { Types, HydratedDocument } from 'mongoose';
import { TriageSession, ITriageSession } from '../../models/TriageSession';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { callTriageAI, AIServiceUnavailableError } from './aiClient';
import { checkRedFlagLocally } from './redFlags';

const DISCLAIMER = 'This is guidance, not medical advice.';
const EMERGENCY_MESSAGE = 'This may be a medical emergency. Seek emergency care immediately or call 112.';

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
  const finalText = includeDisclaimer ? `${text} ${DISCLAIMER}` : text;
  session.messages.push({ role: 'assistant', text: finalText, at: new Date() });
}

export async function sendTriageMessage(
  patientId: string,
  sessionId: string | undefined,
  text: string
): Promise<ITriageSession> {
  let session: HydratedDocument<ITriageSession> | null;

  if (sessionId) {
    session = await TriageSession.findOne({ _id: sessionId, patientId });
    if (!session) throw new AppError(404, 'Triage session not found', 'TRIAGE_SESSION_NOT_FOUND');
  } else {
    session = await TriageSession.create({
      patientId: new Types.ObjectId(patientId),
      disclaimerShownAt: new Date(),
    });
  }

  // A session that already ended (emergency, or already completed its 3-turn
  // flow) is terminal -- it does not accept further messages. This closes two
  // gaps at once: an emergency session silently resuming ordinary triage, and
  // an already-resolved session being re-queried (and re-billed against the
  // AI service) indefinitely.
  const priorUserTurns = session.messages.filter((m) => m.role === 'user').length;
  if (session.isRedFlag || priorUserTurns >= 3) {
    throw new AppError(409, 'This triage session has already ended. Start a new session for a new symptom.', 'TRIAGE_SESSION_CLOSED');
  }

  session.messages.push({ role: 'user', text, at: new Date() });

  // Red-flag detection is a pure keyword check and must never depend on the
  // AI service being reachable. It runs locally, on every turn's own new
  // text, before anything else -- this protects against the AI service being
  // down (no remote dependency at all) and catches a red flag that only
  // appears partway through the conversation, not just on the first message.
  const matchedKeyword = checkRedFlagLocally(text);
  if (matchedKeyword) {
    session.isRedFlag = true;
    pushAssistantMessage(session, EMERGENCY_MESSAGE, { includeDisclaimer: false });
    await session.save();
    return session;
  }

  const turnCount = session.messages.filter((m) => m.role === 'user').length;

  if (turnCount === 1) {
    pushAssistantMessage(session, 'How long have you had these symptoms?');
    await session.save();
    return session;
  }

  if (turnCount === 2) {
    pushAssistantMessage(session, 'How severe is it — mild, moderate, or severe?');
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
    const aiResult = await callTriageAI(combinedText);
    session.extractedSymptoms = aiResult.extractedSymptoms;
    session.suggestedSpecialties = aiResult.suggestedSpecialties;
    session.recommendedDoctorIds = await findRecommendedDoctors(aiResult.suggestedSpecialties);
    pushAssistantMessage(
      session,
      `Based on what you've described, you may want to see: ${aiResult.suggestedSpecialties.map((s) => s.name).join(', ')}.`
    );
  } catch (err) {
    if (!(err instanceof AIServiceUnavailableError)) throw err;
    pushAssistantMessage(session, "We're having trouble matching your symptoms automatically right now — please try again in a few minutes.");
  }

  await session.save();
  return session;
}
