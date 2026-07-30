// One-off script: `npx tsx apps/api/src/seed/generateReportSample.ts` -- NOT run automatically
// by `npm run seed` (generating a PDF on every seed run is unnecessary; the file is committed
// once and reused).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  page.drawText('HealthFirst Diagnostics', { x: 50, y, size: 18, font: boldFont });
  y -= 30;
  page.drawText('Complete Blood Count (CBC) Report', { x: 50, y, size: 12, font });
  y -= 40;

  const rows = [
    ['Hemoglobin', '14.2 g/dL', '13.0 - 17.0'],
    ['WBC Count', '7,200 /uL', '4,000 - 11,000'],
    ['Platelet Count', '250,000 /uL', '150,000 - 450,000'],
    ['RBC Count', '5.1 M/uL', '4.5 - 5.9'],
  ];
  page.drawText('Test', { x: 50, y, size: 10, font: boldFont });
  page.drawText('Result', { x: 250, y, size: 10, font: boldFont });
  page.drawText('Normal Range', { x: 400, y, size: 10, font: boldFont });
  y -= 20;
  for (const [test, result, range] of rows) {
    page.drawText(test!, { x: 50, y, size: 10, font });
    page.drawText(result!, { x: 250, y, size: 10, font });
    page.drawText(range!, { x: 400, y, size: 10, font });
    y -= 20;
  }

  page.drawText('DUMMY REPORT -- DEMO ONLY', { x: 50, y: 30, size: 10, font, color: rgb(0.7, 0.1, 0.1) });

  const bytes = await pdfDoc.save();
  const outPath = path.join(__dirname, 'assets', 'report_sample.pdf');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(bytes));
  console.log(`Wrote ${outPath}`);
}

main();
