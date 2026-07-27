import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('nodemailer', async () => {
  // NOTE: the installed nodemailer-mock's `.default` export does not itself carry a
  // nested `default` key, so returning `mock.default` here leaves mailer.ts's
  // `import nodemailer from 'nodemailer'` (a default import) unable to resolve — Vitest
  // throws "No default export is defined on the nodemailer mock". Returning the whole
  // imported module namespace (which does have both a top-level `default` and the named
  // exports) fixes this, matching nodemailer-mock's own documented vi.mock() usage.
  const mock = await import('nodemailer-mock');
  return mock;
});

import nodemailer from 'nodemailer-mock';
import { sendAppointmentEmail } from './mailer';

beforeEach(() => {
  nodemailer.mock.reset();
});

describe('sendAppointmentEmail', () => {
  it('sends a "requested" email with the recipient and a non-empty subject/body', async () => {
    await sendAppointmentEmail('patient@medlink.demo', 'requested', { doctorName: 'Dr. Meera Sharma', slotStart: '2026-08-05T18:00:00.000Z' });

    const sent = nodemailer.mock.getSentMail();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('patient@medlink.demo');
    expect(sent[0]!.subject).toContain('Dr. Meera Sharma');
  });

  it('sends a distinct subject per template', async () => {
    await sendAppointmentEmail('a@medlink.demo', 'confirmed', { doctorName: 'Dr. X', slotStart: '2026-08-05T18:00:00.000Z' });
    await sendAppointmentEmail('a@medlink.demo', 'rejected', { doctorName: 'Dr. X', slotStart: '2026-08-05T18:00:00.000Z', reason: 'busy' });

    const sent = nodemailer.mock.getSentMail();
    expect(sent[0]!.subject).not.toBe(sent[1]!.subject);
  });

  it('sends a doctor-addressed "new_request" email naming the patient and slot', async () => {
    await sendAppointmentEmail('doctor@medlink.demo', 'new_request', {
      patientName: 'Rahul Prakash', slotStart: '2026-08-05T18:00:00.000Z',
    });

    const sent = nodemailer.mock.getSentMail();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('doctor@medlink.demo');
    expect(sent[0]!.subject).toBe('New appointment request from a patient');
    expect(sent[0]!.text).toContain('Rahul Prakash');
    expect(sent[0]!.text).toContain('2026-08-05T18:00:00.000Z');
  });
});
