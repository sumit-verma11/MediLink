import { Types, HydratedDocument } from 'mongoose';
import { TriageSession, ITriageSession } from '../../models/TriageSession';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { callTriageAI, AIServiceUnavailableError } from './aiClient';

const DISCLAIMER = 'This is guidance, not medical advice.';

async function findRecommendedDoctors(specialtyNames: string[]): Promise<Types.ObjectId[]> {
  const doctors = await DoctorProfile.find({
    specialties: { $in: specialtyNames },
    verificationStatus: 'approved',
  })
    .sort({ avgRating: -1 })
    .limit(3);
  return doctors.map((d) => d._id);
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

  session.messages.push({ role: 'user', text, at: new Date() });

  const turnCount = session.messages.filter((m) => m.role === 'user').length;

  if (turnCount === 1) {
    // First message: check for a red flag before anything else. A red flag
    // skips clarifying questions and specialty matching entirely.
    try {
      const aiResult = await callTriageAI(text);
      if (aiResult.emergency) {
        session.isRedFlag = true;
        session.messages.push({ role: 'assistant', text: aiResult.message ?? 'Seek emergency care immediately or call 112.', at: new Date() });
        await session.save();
        return session;
      }
    } catch (err) {
      if (!(err instanceof AIServiceUnavailableError)) throw err;
      // AI down on the very first message: fall through to the normal
      // clarifying-question flow. The manual-picker fallback happens at the
      // final turn (turnCount === 3) if the AI is still down by then.
    }

    session.messages.push({ role: 'assistant', text: 'How long have you had these symptoms?', at: new Date() });
    await session.save();
    return session;
  }

  if (turnCount === 2) {
    session.messages.push({ role: 'assistant', text: 'How severe is it — mild, moderate, or severe?', at: new Date() });
    await session.save();
    return session;
  }

  // turnCount === 3: combine the whole conversation into one description and
  // call the AI service for the real specialty match.
  const combinedText = session.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('. ');

  try {
    const aiResult = await callTriageAI(combinedText);
    session.extractedSymptoms = aiResult.extractedSymptoms;
    session.suggestedSpecialties = aiResult.suggestedSpecialties;
    session.recommendedDoctorIds = await findRecommendedDoctors(aiResult.suggestedSpecialties.map((s) => s.name));
    session.messages.push({
      role: 'assistant',
      text: `Based on what you've described, you may want to see: ${aiResult.suggestedSpecialties.map((s) => s.name).join(', ')}. ${DISCLAIMER}`,
      at: new Date(),
    });
  } catch (err) {
    if (!(err instanceof AIServiceUnavailableError)) throw err;
    // Graceful degradation: the AI service is down. Return an empty
    // specialty list so the frontend can fall back to a manual specialty
    // picker instead of showing an error.
    session.messages.push({
      role: 'assistant',
      text: `We're having trouble matching your symptoms automatically right now — please pick a specialty manually below. ${DISCLAIMER}`,
      at: new Date(),
    });
  }

  await session.save();
  return session;
}
