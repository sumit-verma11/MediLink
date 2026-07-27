import nodemailer from 'nodemailer';
import { logger } from './logger';

type Template = 'requested' | 'confirmed' | 'rejected' | 'reminder';

function transporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function subjectFor(template: Template, data: Record<string, unknown>): string {
  const doctorName = String(data.doctorName ?? 'your doctor');
  switch (template) {
    case 'requested':
      return `Appointment request sent to ${doctorName}`;
    case 'confirmed':
      return `Appointment confirmed with ${doctorName}`;
    case 'rejected':
      return `Appointment request declined by ${doctorName}`;
    case 'reminder':
      return `Reminder: appointment with ${doctorName} tomorrow`;
  }
}

function bodyFor(template: Template, data: Record<string, unknown>): string {
  const doctorName = String(data.doctorName ?? 'your doctor');
  const slotStart = String(data.slotStart ?? '');
  switch (template) {
    case 'requested':
      return `Your appointment request with ${doctorName} for ${slotStart} has been sent and is awaiting confirmation.`;
    case 'confirmed':
      return `Your appointment with ${doctorName} for ${slotStart} is confirmed.`;
    case 'rejected':
      return `Your appointment request with ${doctorName} for ${slotStart} was declined. Reason: ${String(data.reason ?? 'not specified')}.`;
    case 'reminder':
      return `This is a reminder of your appointment with ${doctorName} tomorrow at ${slotStart}.`;
  }
}

export async function sendAppointmentEmail(to: string, template: Template, data: Record<string, unknown>): Promise<void> {
  try {
    await transporter().sendMail({
      from: process.env.SMTP_USER ?? 'no-reply@medlink.demo',
      to,
      subject: subjectFor(template, data),
      text: bodyFor(template, data),
    });
  } catch (err) {
    // Email is a best-effort side effect of a booking transition, not part of its
    // correctness — a down SMTP server must never fail an appointment state change.
    logger.error(err, 'failed to send appointment email');
  }
}
