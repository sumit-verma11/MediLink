import { describe, it, expect } from 'vitest';
import { RegisterInput, LoginInput } from './user';
import { VerificationDecisionInput } from './admin';
import { LabTestPatchInput } from './lab';
import {
  AvailabilityRuleInput,
  BlockedDateInput,
  CreateAppointmentInput,
  RejectAppointmentInput,
} from './appointment';
import { SendTriageMessageInput } from './triage';
import { CreatePrescriptionInput, AmendPrescriptionInput } from './prescription';

describe('RegisterInput', () => {
  it('rejects a password shorter than 8 chars', () => {
    const result = RegisterInput.safeParse({
      email: 'a@b.com', password: 'short', name: 'A', phone: '9999999999', role: 'patient',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid patient registration', () => {
    const result = RegisterInput.safeParse({
      email: 'a@b.com', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    expect(result.success).toBe(true);
  });
});

describe('LoginInput', () => {
  it('rejects an invalid email', () => {
    expect(LoginInput.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('VerificationDecisionInput', () => {
  it('requires a reason when rejecting', () => {
    const result = VerificationDecisionInput.safeParse({ decision: 'rejected' });
    expect(result.success).toBe(false);
  });

  it('allows approval with no reason', () => {
    const result = VerificationDecisionInput.safeParse({ decision: 'approved' });
    expect(result.success).toBe(true);
  });
});

describe('LabTestPatchInput', () => {
  it('rejects an empty object', () => {
    expect(LabTestPatchInput.safeParse({}).success).toBe(false);
  });
  it('accepts a partial update', () => {
    expect(LabTestPatchInput.safeParse({ price: 275 }).success).toBe(true);
  });
  it('rejects a negative price', () => {
    expect(LabTestPatchInput.safeParse({ price: -10 }).success).toBe(false);
  });
});

describe('AvailabilityRuleInput', () => {
  it('rejects dayOfWeek out of range', () => {
    expect(
      AvailabilityRuleInput.safeParse({
        dayOfWeek: 7, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
        validFrom: '2026-01-01', validTo: '2026-12-31',
      }).success
    ).toBe(false);
  });
  it('accepts a valid rule', () => {
    expect(
      AvailabilityRuleInput.safeParse({
        dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15,
        validFrom: '2026-01-01', validTo: '2026-12-31',
      }).success
    ).toBe(true);
  });
});

describe('BlockedDateInput', () => {
  it('requires a date', () => {
    expect(BlockedDateInput.safeParse({ reason: 'leave' }).success).toBe(false);
  });
});

describe('CreateAppointmentInput', () => {
  it('requires doctorId, slotStart, slotEnd', () => {
    expect(CreateAppointmentInput.safeParse({}).success).toBe(false);
  });
  it('accepts a minimal valid booking', () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    expect(
      CreateAppointmentInput.safeParse({
        doctorId: '507f1f77bcf86cd799439011',
        slotStart: start.toISOString(),
        slotEnd: end.toISOString(),
      }).success
    ).toBe(true);
  });

  it('rejects a slotEnd that is not after slotStart', () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = CreateAppointmentInput.safeParse({
      doctorId: '507f1f77bcf86cd799439011',
      slotStart: start.toISOString(),
      slotEnd: start.toISOString(),
    });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['slotEnd']);
  });

  it('rejects a slotStart in the past', () => {
    const start = new Date(Date.now() - 60 * 60 * 1000);
    const result = CreateAppointmentInput.safeParse({
      doctorId: '507f1f77bcf86cd799439011',
      slotStart: start.toISOString(),
      slotEnd: new Date(start.getTime() + 15 * 60 * 1000).toISOString(),
    });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['slotStart']);
  });
});

describe('RejectAppointmentInput', () => {
  it('requires a reason', () => {
    expect(RejectAppointmentInput.safeParse({}).success).toBe(false);
  });
});

describe('SendTriageMessageInput', () => {
  it('requires non-empty text', () => {
    expect(SendTriageMessageInput.safeParse({ text: '' }).success).toBe(false);
  });
  it('accepts text with an optional sessionId', () => {
    expect(SendTriageMessageInput.safeParse({ text: 'itchy patches' }).success).toBe(true);
    expect(SendTriageMessageInput.safeParse({ text: 'itchy patches', sessionId: 'abc' }).success).toBe(true);
  });
});

describe('CreatePrescriptionInput', () => {
  it('requires at least one medicine and a diagnosis note', () => {
    expect(
      CreatePrescriptionInput.safeParse({ appointmentId: 'a', diagnosisNote: '', medicines: [], advice: 'Rest' }).success
    ).toBe(false);
  });
  it('accepts a valid payload', () => {
    const result = CreatePrescriptionInput.safeParse({
      appointmentId: 'a1',
      diagnosisNote: 'Viral fever',
      medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });
    expect(result.success).toBe(true);
  });
});

describe('AmendPrescriptionInput', () => {
  it('requires the same shape as create, minus appointmentId', () => {
    const result = AmendPrescriptionInput.safeParse({
      diagnosisNote: 'Viral fever, revised',
      medicines: [{ name: 'Paracetamol', dosage: '650mg', frequency: 'BD', durationDays: 5 }],
      advice: 'Rest and fluids',
    });
    expect(result.success).toBe(true);
  });
});
