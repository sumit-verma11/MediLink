import { nanoid } from 'nanoid';
import { LabReferral, ILabReferral } from '../../models/LabReferral';
import { Prescription } from '../../models/Prescription';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile, ILabTest } from '../../models/LabProfile';
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

  const referral = await LabReferral.create({
    prescriptionId: prescription._id,
    doctorId: doctorProfile._id,
    patientId: prescription.patientId,
    labId: lab._id,
    suggestedTestCodes: testCodes,
    token: nanoid(),
    status: 'sent',
    timeline: [{ status: 'sent', at: new Date() }],
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
): Promise<{ items: ILabReferral[]; total: number; page: number; limit: number }> {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorUserId });
  if (!doctorProfile) throw new AppError(404, 'Doctor profile not found', 'PROFILE_NOT_FOUND');

  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    LabReferral.find({ doctorId: doctorProfile._id })
      .sort({ _id: -1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit),
    LabReferral.countDocuments({ doctorId: doctorProfile._id }),
  ]);
  return { items, total, page, limit: cappedLimit };
}
