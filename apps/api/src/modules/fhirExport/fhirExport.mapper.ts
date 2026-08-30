import type { IUser } from '../../models/User';
import type { IPatientProfile } from '../../models/PatientProfile';
import type { IAppointment, AppointmentStatus } from '../../models/Appointment';
import type { IPrescription } from '../../models/Prescription';
import type { ILabReferral, LabReferralStatus } from '../../models/LabReferral';
import type { ILabBooking } from '../../models/LabBooking';

// This is a *lite* export -- shaped like FHIR R4 resources so someone who knows FHIR
// recognizes them immediately, not a conformant FHIR server. No Practitioner/
// Organization/Encounter resources: doctor/lab identity is flattened into display
// strings on the resources that reference them (see design spec).

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  name: { text: string }[];
  gender?: string;
  birthDate?: never;
  _ageYears?: number;
}

export function mapPatient(user: IUser, patientProfile: IPatientProfile | null): FhirPatient {
  const result: FhirPatient = {
    resourceType: 'Patient',
    id: user._id.toString(),
    name: [{ text: user.name }],
  };
  if (patientProfile?.gender) result.gender = patientProfile.gender;
  if (patientProfile?.age !== undefined) result._ageYears = patientProfile.age;
  return result;
}

const APPOINTMENT_STATUS_MAP: Record<AppointmentStatus, string> = {
  requested: 'pending',
  confirmed: 'booked',
  completed: 'fulfilled',
  cancelled: 'cancelled',
  rejected: 'cancelled',
  no_show: 'noshow',
};

export interface FhirAppointment {
  resourceType: 'Appointment';
  id: string;
  status: string;
  start: string;
  end: string;
  reasonCode?: { text: string }[];
  cancelationReason?: { text: string };
  participant: { display: string }[];
}

export function mapAppointment(
  appointment: IAppointment,
  display: { doctorDisplay: string; patientDisplay: string }
): FhirAppointment {
  const result: FhirAppointment = {
    resourceType: 'Appointment',
    id: appointment._id.toString(),
    status: APPOINTMENT_STATUS_MAP[appointment.status],
    start: appointment.slotStart.toISOString(),
    end: appointment.slotEnd.toISOString(),
    participant: [{ display: display.doctorDisplay }, { display: display.patientDisplay }],
  };
  if (appointment.symptomSummary) result.reasonCode = [{ text: appointment.symptomSummary }];
  if (appointment.rejectionReason) result.cancelationReason = { text: appointment.rejectionReason };
  return result;
}

export interface FhirMedicationRequest {
  resourceType: 'MedicationRequest';
  id: string;
  status: 'active' | 'stopped';
  medicationCodeableConcept: { text: string };
  dosageInstruction: { text: string }[];
  authoredOn: string;
  requester: { display: string };
  reasonCode: { text: string }[];
}

export function mapMedicationRequests(
  prescription: IPrescription,
  display: { doctorDisplay: string }
): FhirMedicationRequest[] {
  return prescription.medicines.map((medicine, i) => {
    const durationText = `for ${medicine.durationDays} days`;
    const instructionsSuffix = medicine.instructions ? `, ${medicine.instructions}` : '';
    return {
      resourceType: 'MedicationRequest',
      id: `${prescription._id.toString()}-${i}`,
      status: prescription.supersededBy ? 'stopped' : 'active',
      medicationCodeableConcept: { text: medicine.name },
      dosageInstruction: [{ text: `${medicine.dosage} ${medicine.frequency} ${durationText}${instructionsSuffix}` }],
      authoredOn: prescription.createdAt.toISOString(),
      requester: { display: display.doctorDisplay },
      reasonCode: [{ text: prescription.diagnosisNote }],
    };
  });
}

const SERVICE_REQUEST_STATUS_MAP: Record<LabReferralStatus, string> = {
  sent: 'active',
  opened: 'active',
  booked: 'active',
  sample_collected: 'active',
  report_ready: 'completed',
  closed: 'completed',
};

export interface FhirServiceRequest {
  resourceType: 'ServiceRequest';
  id: string;
  status: string;
  code: { text: string };
  authoredOn: string;
  requester: { display: string };
  performer: { display: string }[];
}

export function mapServiceRequest(
  labReferral: ILabReferral,
  display: { doctorDisplay: string; labDisplay: string }
): FhirServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    id: labReferral._id.toString(),
    status: SERVICE_REQUEST_STATUS_MAP[labReferral.status],
    code: { text: labReferral.suggestedTestCodes.join(', ') },
    authoredOn: labReferral.timeline[0]!.at.toISOString(),
    requester: { display: display.doctorDisplay },
    performer: [{ display: display.labDisplay }],
  };
}

export interface FhirDiagnosticReport {
  resourceType: 'DiagnosticReport';
  id: string;
  status: 'final';
  code: { text: string };
  effectiveDateTime: string;
  presentedForm: { url: string }[];
}

// Callers only invoke this for bookings that have a reportUrl (see fhirExport.service.ts).
export function mapDiagnosticReport(labBooking: ILabBooking): FhirDiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id: labBooking._id.toString(),
    status: 'final',
    code: { text: labBooking.testCodes.join(', ') },
    effectiveDateTime: labBooking.scheduledAt.toISOString(),
    presentedForm: [{ url: labBooking.reportUrl! }],
  };
}
