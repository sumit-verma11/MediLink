import { nanoid } from 'nanoid';
import { LabReferral, ILabReferral } from '../../models/LabReferral';
import { Prescription } from '../../models/Prescription';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile, ILabTest } from '../../models/LabProfile';
import { User } from '../../models/User';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { createNotification } from '../../lib/notifications';

export async function createReferral(
  doctorUserId: string,
  prescriptionId: string,
  labId: string,
  testCodes: string[]
): Promise<ILabReferral> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const prescription = await Prescription.findOne({ _id: prescriptionId, doctorId: doctorProfile._id });
  if (!prescription) throw new AppError(404, 'Prescription not found', 'PRESCRIPTION_NOT_FOUND');

  const lab = await LabProfile.findOne({ _id: labId, verificationStatus: 'approved' });
  if (!lab) throw new AppError(404, 'Lab not found', 'LAB_NOT_FOUND');

  const labTestCodes = new Set(lab.tests.map((t) => t.code));
  const unavailable = testCodes.filter((code) => !labTestCodes.has(code));
  if (unavailable.length > 0) {
    throw new AppError(400, `This lab does not offer: ${unavailable.join(', ')}`, 'TEST_NOT_OFFERED');
  }

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const referral = await LabReferral.create({
    prescriptionId: prescription._id,
    doctorId: doctorProfile._id,
    patientId: prescription.patientId,
    labId: lab._id,
    suggestedTestCodes: testCodes,
    token: nanoid(),
    status: 'sent',
    timeline: [{ status: 'sent', at: new Date() }],
    expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
  });

  // Link the referral back onto the prescription's recommendedTests entries
  // whose testName matches one of the referred lab tests, so the patient's
  // prescription view can show "referred" status per test.
  const referredTestNames = new Set(
    lab.tests.filter((t) => testCodes.includes(t.code)).map((t) => t.name)
  );
  prescription.recommendedTests = prescription.recommendedTests.map((rt) =>
    referredTestNames.has(rt.testName) ? { ...rt, labReferralId: referral._id } : rt
  );
  await prescription.save();

  await logAudit({
    actorId: doctorUserId,
    actorRole: 'doctor',
    action: 'lab_referral.created',
    entityType: 'LabReferral',
    entityId: referral._id.toString(),
    meta: { prescriptionId: prescription._id.toString(), labId: lab._id.toString() },
  });

  await createNotification({
    userId: prescription.patientId.toString(),
    type: 'lab_referral_sent',
    title: 'Your doctor has recommended a lab test',
    body: `${lab.labName} offers the recommended test(s). Tap to book.`,
    link: `/r/${referral.token}`,
  });

  await createNotification({
    userId: lab.userId.toString(),
    type: 'lab_referral_received',
    title: 'New lab referral',
    body: `A doctor referred a patient to you for: ${testCodes.join(', ')}.`,
  });

  return referral;
}

export async function getReferralByToken(token: string): Promise<{
  referral: ILabReferral;
  lab: { labName: string; city: string; homeCollection: boolean };
  tests: ILabTest[];
  totalPrice: number;
} | null> {
  const referral = await LabReferral.findOne({ token });
  if (!referral) return null;

  // Existence-blind, consistent with the project's pattern for sensitive
  // lookups: an expired referral returns the same null an unknown token would,
  // rather than distinguishing "expired" from "doesn't exist" in the response.
  if (referral.expiresAt < new Date()) return null;

  const lab = await LabProfile.findById(referral.labId);
  if (!lab) return null;

  // Only advance status to 'opened' the first time -- a referral that's
  // already progressed further in the pipeline (booked, sample_collected,
  // etc.) must never regress on a later re-view of the same link.
  if (referral.status === 'sent') {
    referral.status = 'opened';
    referral.timeline.push({ status: 'opened', at: new Date() });
    await referral.save();
  }

  const tests = lab.tests.filter((t) => referral.suggestedTestCodes.includes(t.code));
  const totalPrice = tests.reduce((sum, t) => sum + t.price, 0);

  return {
    referral,
    lab: { labName: lab.labName, city: lab.city, homeCollection: lab.homeCollection },
    tests,
    totalPrice,
  };
}

export async function listReferralsForDoctor(
  doctorUserId: string,
  page: number,
  limit: number
): Promise<{ items: (ILabReferral & { labName?: string; labCity?: string })[]; total: number; page: number; limit: number }> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    LabReferral.find({ doctorId: doctorProfile._id })
      .sort({ _id: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit)
      .lean(),
    LabReferral.countDocuments({ doctorId: doctorProfile._id }),
  ]);

  const labs = await LabProfile.find({ _id: { $in: items.map((i) => i.labId) } }, 'labName city');
  const labById = new Map(labs.map((l) => [l._id.toString(), l]));
  const enrichedItems = items.map((item) => {
    const lab = labById.get(item.labId.toString());
    return { ...item, labName: lab?.labName, labCity: lab?.city };
  });

  return { items: enrichedItems, total, page, limit: cappedLimit };
}

export async function listReferralsForLab(
  labUserId: string,
  page: number,
  limit: number
): Promise<{ items: (ILabReferral & { patientName?: string; doctorName?: string })[]; total: number; page: number; limit: number }> {
  const lab = await LabProfile.findOne({ userId: labUserId });
  if (!lab) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');

  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    LabReferral.find({ labId: lab._id })
      .sort({ _id: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit)
      .lean(),
    LabReferral.countDocuments({ labId: lab._id }),
  ]);

  const [patients, doctorProfiles] = await Promise.all([
    User.find({ _id: { $in: items.map((i) => i.patientId) } }, 'name'),
    DoctorProfile.find({ _id: { $in: items.map((i) => i.doctorId) } }, 'userId'),
  ]);
  const patientById = new Map(patients.map((p) => [p._id.toString(), p]));
  const doctorUsers = await User.find({ _id: { $in: doctorProfiles.map((d) => d.userId) } }, 'name');
  const doctorUserById = new Map(doctorUsers.map((u) => [u._id.toString(), u]));
  const doctorNameByProfileId = new Map(
    doctorProfiles.map((d) => [d._id.toString(), doctorUserById.get(d.userId.toString())?.name])
  );

  const enrichedItems = items.map((item) => {
    const patientName = patientById.get(item.patientId.toString())?.name;
    const doctorName = doctorNameByProfileId.get(item.doctorId.toString());
    return { ...item, patientName, doctorName };
  });

  return { items: enrichedItems, total, page, limit: cappedLimit };
}
