import path from 'node:path';
import { LabBooking, ILabBooking, LabBookingStatus } from '../../models/LabBooking';
import { LabReferral } from '../../models/LabReferral';
import { LabProfile } from '../../models/LabProfile';
import { DoctorProfile } from '../../models/DoctorProfile';
import { AppError } from '../../lib/errors';
import { logAudit } from '../audit/audit.service';
import { createNotification } from '../../lib/notifications';
import type { CreateLabBookingInput } from '@medlink/shared';

export async function createBooking(
  patientUserId: string,
  labId: string,
  input: CreateLabBookingInput,
  referralToken?: string
): Promise<ILabBooking> {
  const lab = await LabProfile.findOne({ _id: labId, verificationStatus: 'approved' });
  if (!lab) throw new AppError(404, 'Lab not found', 'LAB_NOT_FOUND');

  if (input.homeCollection && !lab.homeCollection) {
    throw new AppError(400, 'This lab does not offer home collection', 'HOME_COLLECTION_NOT_OFFERED');
  }

  const labTestsByCode = new Map(lab.tests.map((t) => [t.code, t]));
  const unavailable = input.testCodes.filter((code) => !labTestsByCode.has(code));
  if (unavailable.length > 0) {
    throw new AppError(400, `This lab does not offer: ${unavailable.join(', ')}`, 'TEST_NOT_OFFERED');
  }
  const totalPrice = input.testCodes.reduce((sum, code) => sum + labTestsByCode.get(code)!.price, 0);

  let referralId: string | undefined;
  if (referralToken) {
    // Scope the lookup to the patient making the booking so a referral token
    // can never be used to book on behalf of someone else.
    const referral = await LabReferral.findOne({ token: referralToken, patientId: patientUserId });
    if (!referral) throw new AppError(404, 'Referral not found', 'REFERRAL_NOT_FOUND');
    referralId = referral._id.toString();
  }

  const booking = await LabBooking.create({
    referralId,
    patientId: patientUserId,
    labId: lab._id,
    testCodes: input.testCodes,
    totalPrice,
    scheduledAt: input.scheduledAt,
    homeCollection: input.homeCollection,
    status: 'booked',
  });

  if (referralId) {
    await LabReferral.findByIdAndUpdate(referralId, {
      $set: { status: 'booked' },
      $push: { timeline: { status: 'booked', at: new Date() } },
    });
  }

  await logAudit({
    actorId: patientUserId,
    actorRole: 'patient',
    action: 'lab_booking.created',
    entityType: 'LabBooking',
    entityId: booking._id.toString(),
    meta: { labId: lab._id.toString(), referralId },
  });

  return booking;
}

export async function updateBookingStatus(
  labUserId: string,
  bookingId: string,
  status: Extract<LabBookingStatus, 'sample_collected' | 'report_ready'>,
  reportPath?: string
): Promise<ILabBooking> {
  const lab = await LabProfile.findOne({ userId: labUserId });
  if (!lab) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');

  const booking = await LabBooking.findOne({ _id: bookingId, labId: lab._id });
  if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

  booking.status = status;
  if (status === 'report_ready' && reportPath) {
    booking.reportUrl = reportPath;
  }
  await booking.save();

  if (booking.referralId) {
    const update: Record<string, unknown> = { $set: { status }, $push: { timeline: { status, at: new Date() } } };
    if (status === 'report_ready' && reportPath) {
      (update.$set as Record<string, unknown>).reportUrl = reportPath;
    }
    await LabReferral.findByIdAndUpdate(booking.referralId, update);
  }

  // The patient is notified on every report_ready transition, referral or
  // not (a walk-in booking has no referral but still has a patient waiting
  // on their report). The referring doctor is only notified when a referral
  // actually links this booking back to them.
  if (status === 'report_ready') {
    await createNotification({
      userId: booking.patientId.toString(),
      type: 'lab_report_ready',
      title: 'Your lab report is ready',
      body: `${lab.labName} has uploaded your report.`,
      link: `/dashboard/patient/timeline`,
    });

    if (booking.referralId) {
      const referral = await LabReferral.findById(booking.referralId);
      if (referral) {
        const doctorProfile = await DoctorProfile.findById(referral.doctorId);
        if (doctorProfile) {
          await createNotification({
            userId: doctorProfile.userId.toString(),
            type: 'lab_report_ready',
            title: "A patient's lab report is ready",
            body: `${lab.labName} uploaded a report for a referral you sent.`,
            link: `/prescriptions/${referral.prescriptionId.toString()}`,
          });
        }
      }
    }
  }

  await logAudit({
    actorId: labUserId,
    actorRole: 'lab',
    action: 'lab_booking.status_updated',
    entityType: 'LabBooking',
    entityId: booking._id.toString(),
    meta: { status },
  });

  return booking;
}

export async function getReportPath(
  bookingId: string,
  requestingUserId: string,
  requestingRole: string
): Promise<string> {
  const booking = await LabBooking.findById(bookingId);
  if (!booking) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');

  let authorized = false;
  if (requestingRole === 'patient' && booking.patientId.toString() === requestingUserId) {
    authorized = true;
  } else if (requestingRole === 'lab') {
    const lab = await LabProfile.findOne({ userId: requestingUserId });
    if (lab && booking.labId.toString() === lab._id.toString()) authorized = true;
  }
  if (!authorized) throw new AppError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  if (!booking.reportUrl) throw new AppError(404, 'Report not available', 'REPORT_NOT_AVAILABLE');

  return path.join(process.cwd(), booking.reportUrl.replace(/^\//, ''));
}

export async function listBookingsForLab(
  labUserId: string,
  page: number,
  limit: number
): Promise<{ items: ILabBooking[]; total: number; page: number; limit: number }> {
  const lab = await LabProfile.findOne({ userId: labUserId });
  if (!lab) throw new AppError(404, 'Lab profile not found', 'PROFILE_NOT_FOUND');

  const cappedLimit = Math.min(50, limit);
  const [items, total] = await Promise.all([
    LabBooking.find({ labId: lab._id })
      .sort({ scheduledAt: 1 })
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit),
    LabBooking.countDocuments({ labId: lab._id }),
  ]);
  return { items, total, page, limit: cappedLimit };
}
