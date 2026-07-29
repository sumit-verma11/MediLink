import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { IPrescription } from '../../models/Prescription';
import type { IDoctorProfile } from '../../models/DoctorProfile';
import type { IUser } from '../../models/User';

export async function generatePrescriptionPdf(params: {
  prescription: IPrescription;
  doctorProfile: IDoctorProfile;
  doctorUser: IUser;
  patientUser: IUser;
  verifyBaseUrl: string;
}): Promise<Buffer> {
  const { prescription, doctorProfile, doctorUser, patientUser, verifyBaseUrl } = params;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = 800;
  const left = 50;
  const lineHeight = 18;

  const drawText = (text: string, opts: { bold?: boolean; italic?: boolean; size?: number } = {}) => {
    page.drawText(text, {
      x: left,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? boldFont : opts.italic ? italicFont : font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  };

  // Letterhead
  drawText(doctorProfile.clinicName, { bold: true, size: 16 });
  drawText(doctorProfile.clinicAddress, { size: 10 });
  drawText(`Dr. ${doctorUser.name} — Reg. No: ${doctorProfile.regNo}`, { size: 10 });
  y -= 10;
  page.drawLine({ start: { x: left, y: y + 10 }, end: { x: 545, y: y + 10 }, thickness: 1, color: rgb(0, 0, 0) });
  y -= 10;

  drawText(`Patient: ${patientUser.name}`, { bold: true });
  drawText(`Date: ${prescription.createdAt.toDateString()}`);
  if (prescription.version > 1) {
    drawText(`Version ${prescription.version} (amended)`, { italic: true, size: 9 });
  }
  y -= 10;

  drawText('Diagnosis', { bold: true });
  drawText(prescription.diagnosisNote);
  y -= 5;

  drawText('Medicines', { bold: true });
  for (const med of prescription.medicines) {
    const instructions = med.instructions ? ` (${med.instructions})` : '';
    drawText(`- ${med.name} ${med.dosage}, ${med.frequency}, ${med.durationDays} days${instructions}`, { size: 10 });
  }
  y -= 5;

  drawText('Advice', { bold: true });
  drawText(prescription.advice);

  if (prescription.recommendedTests.length > 0) {
    y -= 5;
    drawText('Recommended Tests', { bold: true });
    for (const test of prescription.recommendedTests) {
      drawText(`- ${test.testName}`, { size: 10 });
    }
  }

  if (prescription.followUpDate) {
    y -= 5;
    drawText(`Follow-up: ${prescription.followUpDate.toDateString()}`);
  }

  // Signature (rendered as italic text -- no image-generation pipeline needed
  // for a demo-scale artifact; a real product would use an uploaded image).
  y -= 30;
  drawText(`Digitally signed by Dr. ${doctorUser.name}`, { italic: true, size: 10 });

  // QR code linking to the public, privacy-scoped verification page.
  const verifyUrl = `${verifyBaseUrl}/rx/verify/${prescription._id.toString()}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 120 });
  const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1] ?? '', 'base64');
  const qrImage = await pdfDoc.embedPng(qrImageBytes);
  page.drawImage(qrImage, { x: 445, y: 60, width: 100, height: 100 });
  page.drawText('Scan to verify', { x: 460, y: 48, size: 8, font, color: rgb(0.3, 0.3, 0.3) });
  page.drawText('DUMMY PRESCRIPTION — DEMO ONLY', { x: left, y: 30, size: 8, font, color: rgb(0.6, 0.6, 0.6) });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
