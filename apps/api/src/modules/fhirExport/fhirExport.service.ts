import { User } from '../../models/User';
import { PatientProfile } from '../../models/PatientProfile';
import { DoctorProfile } from '../../models/DoctorProfile';
import { LabProfile } from '../../models/LabProfile';
import { Appointment } from '../../models/Appointment';
import { Prescription } from '../../models/Prescription';
import { LabReferral } from '../../models/LabReferral';
import { LabBooking } from '../../models/LabBooking';
import { AppError } from '../../lib/errors';
import {
  mapPatient,
  mapAppointment,
  mapMedicationRequests,
  mapServiceRequest,
  mapDiagnosticReport,
  type FhirPatient,
  type FhirAppointment,
  type FhirMedicationRequest,
  type FhirServiceRequest,
  type FhirDiagnosticReport,
} from './fhirExport.mapper';

export async function canExportPatient(
  requester: { id: string; role: string },
  patientId: string
): Promise<boolean> {
  if (requester.role === 'admin') return true;
  if (requester.role === 'patient') return requester.id === patientId;
  if (requester.role === 'doctor') {
    const doctorProfile = await DoctorProfile.findOne({ userId: requester.id });
    if (!doctorProfile) return false;
    return Appointment.exists({ doctorId: doctorProfile._id, patientId }).then(Boolean);
  }
  return false;
}

type FhirResource = FhirPatient | FhirAppointment | FhirMedicationRequest | FhirServiceRequest | FhirDiagnosticReport;
interface BundleEntry {
  resource: FhirResource;
}
interface Bundle {
  resourceType: 'Bundle';
  type: 'collection';
  timestamp: string;
  entry: BundleEntry[];
}

export async function buildFhirBundle(patientId: string, options: { encounterId?: string }): Promise<Bundle> {
  const user = await User.findOne({ _id: patientId, role: 'patient' });
  if (!user) throw new AppError(404, 'Patient not found', 'PATIENT_NOT_FOUND');
  const patientProfile = await PatientProfile.findOne({ userId: patientId });

  let appointmentFilter: Record<string, unknown> = { patientId };
  if (options.encounterId) {
    const encounter = await Appointment.findOne({ _id: options.encounterId, patientId });
    if (!encounter) throw new AppError(400, 'encounterId does not belong to this patient', 'ENCOUNTER_MISMATCH');
    appointmentFilter = { _id: encounter._id };
  }

  const appointments = await Appointment.find(appointmentFilter);
  const appointmentIds = appointments.map((a) => a._id);

  const prescriptions = await Prescription.find(
    options.encounterId ? { appointmentId: { $in: appointmentIds } } : { patientId }
  );
  const prescriptionIds = prescriptions.map((p) => p._id);

  const labReferrals = await LabReferral.find(
    options.encounterId ? { prescriptionId: { $in: prescriptionIds } } : { patientId }
  );
  const referralIds = labReferrals.map((r) => r._id);

  const labBookings = await LabBooking.find(
    options.encounterId ? { referralId: { $in: referralIds } } : { patientId }
  );

  // Batch-resolve every doctor/lab display string referenced by the above documents --
  // one lookup per collection rather than one per document. At this data volume a
  // strict N+1 wouldn't be noticeable, but there's no reason to write it that way.
  const doctorIds = [
    ...appointments.map((a) => a.doctorId),
    ...prescriptions.map((p) => p.doctorId),
    ...labReferrals.map((r) => r.doctorId),
  ];
  const doctorProfiles = doctorIds.length
    ? await DoctorProfile.find({ _id: { $in: doctorIds } }).populate<{ userId: { name: string } }>('userId', 'name')
    : [];
  const doctorDisplayById = new Map(doctorProfiles.map((d) => [d._id.toString(), d.userId.name]));

  const labIds = [...labReferrals.map((r) => r.labId), ...labBookings.map((b) => b.labId)];
  const labProfiles = labIds.length ? await LabProfile.find({ _id: { $in: labIds } }) : [];
  const labDisplayById = new Map(labProfiles.map((l) => [l._id.toString(), l.labName]));

  const entry: BundleEntry[] = [{ resource: mapPatient(user, patientProfile) }];

  for (const appointment of appointments) {
    entry.push({
      resource: mapAppointment(appointment, {
        doctorDisplay: doctorDisplayById.get(appointment.doctorId.toString()) ?? 'Unknown doctor',
        patientDisplay: user.name,
      }),
    });
  }

  for (const prescription of prescriptions) {
    const doctorDisplay = doctorDisplayById.get(prescription.doctorId.toString()) ?? 'Unknown doctor';
    for (const medicationRequest of mapMedicationRequests(prescription, { doctorDisplay })) {
      entry.push({ resource: medicationRequest });
    }
  }

  for (const referral of labReferrals) {
    entry.push({
      resource: mapServiceRequest(referral, {
        doctorDisplay: doctorDisplayById.get(referral.doctorId.toString()) ?? 'Unknown doctor',
        labDisplay: labDisplayById.get(referral.labId.toString()) ?? 'Unknown lab',
      }),
    });
  }

  for (const booking of labBookings) {
    if (!booking.reportUrl) continue;
    entry.push({ resource: mapDiagnosticReport(booking) });
  }

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry,
  };
}
