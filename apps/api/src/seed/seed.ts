import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { connectDB, disconnectDB } from '../lib/db';
import { User } from '../models/User';
import { PatientProfile } from '../models/PatientProfile';
import { DoctorProfile } from '../models/DoctorProfile';
import { LabProfile } from '../models/LabProfile';
import { Notification } from '../models/Notification';
import { AvailabilityRule } from '../models/AvailabilityRule';
import { Appointment } from '../models/Appointment';
import { TriageSession } from '../models/TriageSession';
import { Prescription } from '../models/Prescription';
import { LabReferral } from '../models/LabReferral';
import { LabBooking } from '../models/LabBooking';
import { Rating } from '../models/Rating';
import { createNotification } from '../lib/notifications';
import { createRating } from '../modules/ratings/ratings.service';
import { PATIENTS, DOCTORS, LABS, AVAILABILITY_RULES_BY_DOCTOR_EMAIL } from './data';

const DEMO_PASSWORD = 'Demo@123';

async function hashed(): Promise<string> {
  return bcrypt.hash(DEMO_PASSWORD, 10);
}

// A single templated sentence read as an obvious placeholder once there were
// 100+ doctors on the page. These pools combine (5 x 6 = 30 phrasings) so the
// generated bio still varies in wording, not just in the exp/city/specialty
// values it's filled with.
const BIO_OPENERS: ((d: { name: string; specialties: string[]; city: string; exp: number }) => string)[] = [
  (d) => `${d.name} has ${d.exp} years of experience in ${d.specialties[0]!}, practicing in ${d.city}.`,
  (d) => `With ${d.exp} years in ${d.specialties[0]!}, ${d.name} has built a steady practice in ${d.city} and the wider NCR region.`,
  (d) => `${d.name} brings ${d.exp} years of clinical experience in ${d.specialties[0]!} to every consultation.`,
  (d) => `A ${d.specialties[0]!.toLowerCase()} specialist based in ${d.city}, ${d.name} has ${d.exp} years of practice behind them.`,
  (d) => `${d.name} has spent ${d.exp} years treating patients in and around ${d.city}, with a focus on ${d.specialties[0]!.toLowerCase()}.`,
];
const BIO_CLOSERS = [
  'Known for a patient, detail-oriented approach to every consultation.',
  'Focuses on clear communication and practical, easy-to-follow care plans.',
  'Committed to explaining every diagnosis in plain language patients can act on.',
  'Believes in listening first and treating the whole patient, not just the symptom.',
  'Takes a calm, unhurried approach, especially with anxious or first-time patients.',
  'Known among patients for following up personally after a visit.',
];

function buildDoctorBio(d: { name: string; specialties: string[]; city: string; exp: number }, index: number): string {
  const opener = BIO_OPENERS[index % BIO_OPENERS.length]!(d);
  const closer = BIO_CLOSERS[(index * 3 + 1) % BIO_CLOSERS.length]!;
  return `${opener} ${closer}`;
}

export async function runSeed(): Promise<void> {
  await User.deleteMany({});
  await PatientProfile.deleteMany({});
  await DoctorProfile.deleteMany({});
  await LabProfile.deleteMany({});
  await Notification.deleteMany({});
  await AvailabilityRule.deleteMany({});
  await Appointment.deleteMany({});
  await TriageSession.deleteMany({});
  await Prescription.deleteMany({});
  await LabReferral.deleteMany({});
  await LabBooking.deleteMany({});
  await Rating.deleteMany({});

  const passwordHash = await hashed();

  const admin = await User.create({
    role: 'admin', email: 'admin@medlink.demo', phone: '9800000000', passwordHash, name: 'Admin',
    avatarUrl: 'https://i.pravatar.cc/150?u=admin@medlink.demo', isVerified: true,
  });

  for (const p of PATIENTS) {
    const user = await User.create({
      role: 'patient', email: p.email, phone: p.phone, passwordHash, name: p.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${p.email}`, isVerified: true,
    });
    await PatientProfile.create({ userId: user._id, age: p.age, gender: p.gender, city: p.city });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your account is ready.', createdAt: new Date(),
    });
  }

  for (const [i, d] of DOCTORS.entries()) {
    const user = await User.create({
      role: 'doctor', email: d.email, phone: '9800000001', passwordHash, name: d.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${d.email}`, isVerified: true,
    });
    await DoctorProfile.create({
      userId: user._id, specialties: d.specialties, qualifications: ['MBBS'],
      regNo: `DMC/R/${String(Math.floor(10000 + Math.random() * 89999))}`,
      experienceYears: d.exp, bio: buildDoctorBio(d, i),
      clinicName: `${d.name.replace('Dr. ', '')} Clinic`, clinicAddress: `${d.city} Main Road`,
      city: d.city, geo: { lat: 28.5, lng: 77.3 }, consultationFee: d.fee,
      languages: ['English', 'Hindi'], verificationStatus: d.status,
      // avgRating/ratingCount intentionally omitted here (schema defaults both to 0) --
      // the real values are populated later in this script by createRating, which
      // recomputes them from actual seeded Rating documents against completed
      // appointments. This guarantees the seeded numbers are consistent with the exact
      // aggregation logic production traffic uses, instead of independently faked ones.
    });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your profile is set up.', createdAt: new Date(),
    });
  }

  for (const l of LABS) {
    const user = await User.create({
      role: 'lab', email: l.email, phone: '9800000002', passwordHash, name: l.name,
      avatarUrl: `https://i.pravatar.cc/150?u=${l.email}`, isVerified: true,
    });
    await LabProfile.create({
      userId: user._id, labName: l.name, address: `${l.city} Diagnostic Rd`, city: l.city,
      geo: { lat: 28.5, lng: 77.3 }, timings: '07:00-21:00', homeCollection: l.homeCollection,
      verificationStatus: l.status, tests: l.tests,
    });
    await Notification.create({
      userId: user._id, type: 'welcome', title: 'Welcome to MedLink',
      body: 'Your lab profile is set up.', createdAt: new Date(),
    });
  }

  const doctorUsersByEmail = new Map<string, { userId: import('mongoose').Types.ObjectId; profileId: import('mongoose').Types.ObjectId }>();
  for (const d of DOCTORS) {
    const user = await User.findOne({ email: d.email });
    const profile = await DoctorProfile.findOne({ userId: user!._id });
    if (user && profile) doctorUsersByEmail.set(d.email, { userId: user._id, profileId: profile._id });

    const rules = AVAILABILITY_RULES_BY_DOCTOR_EMAIL[d.email];
    if (rules && profile) {
      for (const rule of rules) {
        await AvailabilityRule.create({
          doctorId: profile._id, ...rule,
          // Relative to seed time (±1 year) rather than a hardcoded calendar year, so
          // the demo's slot generation never silently goes dark on a fixed date.
          validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  const patientUsers = await Promise.all(PATIENTS.map((p) => User.findOne({ email: p.email })));
  const meera = doctorUsersByEmail.get('meera.d@medlink.demo')!;
  const kavita = doctorUsersByEmail.get('kavita.d@medlink.demo')!;
  const rohit = doctorUsersByEmail.get('rohit.d@medlink.demo')!;
  const anjali = doctorUsersByEmail.get('anjali.d@medlink.demo')!;
  const arjun = doctorUsersByEmail.get('arjun.d@medlink.demo')!;
  const neha = doctorUsersByEmail.get('neha.d@medlink.demo')!;
  const farhan = doctorUsersByEmail.get('farhan.d@medlink.demo')!;

  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  }
  function daysFromNow(n: number): Date {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  }
  function withTimeline(status: string, patientId: import('mongoose').Types.ObjectId) {
    return [{ status, at: new Date(), by: patientId }];
  }

  const appointmentSeeds = [
    // 7 completed, past 2 weeks (6 of these get a Prescription in Phase 4; the 7th,
    // last entry below, is CLAUDE.md §6.4's "1 completed-without-prescription" — a
    // genuinely separate appointment, not one of the 6, so Phase 4 has exactly one
    // completed appointment it should NOT attach a prescription to)
    { doctorId: meera.profileId, patientId: patientUsers[0]!._id, slotStart: daysAgo(2), status: 'completed' },
    { doctorId: kavita.profileId, patientId: patientUsers[1]!._id, slotStart: daysAgo(3), status: 'completed' },
    { doctorId: rohit.profileId, patientId: patientUsers[2]!._id, slotStart: daysAgo(5), status: 'completed' },
    { doctorId: anjali.profileId, patientId: patientUsers[3]!._id, slotStart: daysAgo(7), status: 'completed' },
    { doctorId: meera.profileId, patientId: patientUsers[4]!._id, slotStart: daysAgo(10), status: 'completed' },
    { doctorId: kavita.profileId, patientId: patientUsers[5]!._id, slotStart: daysAgo(12), status: 'completed' },
    { doctorId: rohit.profileId, patientId: patientUsers[4]!._id, slotStart: daysAgo(14), status: 'completed' }, // completed-without-prescription
    // 3 confirmed, next 3 days
    { doctorId: meera.profileId, patientId: patientUsers[0]!._id, slotStart: daysFromNow(1), status: 'confirmed' },
    { doctorId: rohit.profileId, patientId: patientUsers[1]!._id, slotStart: daysFromNow(2), status: 'confirmed' },
    { doctorId: anjali.profileId, patientId: patientUsers[2]!._id, slotStart: daysFromNow(3), status: 'confirmed' },
    // 2 requested, pending on Dr. Meera + Dr. Kavita
    // (offset by 6h from the Meera 'confirmed' slot above: both share doctorId + status in
    // the {requested, confirmed} set that Appointment's partial unique index guards, so an
    // identical slotStart would violate doctorId_1_slotStart_1 — same slot can't be both.)
    { doctorId: meera.profileId, patientId: patientUsers[3]!._id, slotStart: daysFromNow(1.25), status: 'requested' },
    { doctorId: kavita.profileId, patientId: patientUsers[4]!._id, slotStart: daysFromNow(2), status: 'requested' },
    // 1 rejected
    { doctorId: rohit.profileId, patientId: patientUsers[3]!._id, slotStart: daysAgo(1), status: 'rejected', rejectionReason: 'Please book with a pediatrician for a child patient' },
    // 1 cancelled, 1 no_show
    { doctorId: anjali.profileId, patientId: patientUsers[5]!._id, slotStart: daysFromNow(4), status: 'cancelled' },
    { doctorId: meera.profileId, patientId: patientUsers[2]!._id, slotStart: daysAgo(4), status: 'no_show' },
  ];

  for (const seed of appointmentSeeds) {
    await Appointment.create({
      doctorId: seed.doctorId,
      patientId: seed.patientId,
      slotStart: seed.slotStart,
      slotEnd: new Date(seed.slotStart.getTime() + 15 * 60 * 1000),
      status: seed.status,
      rejectionReason: (seed as { rejectionReason?: string }).rejectionReason,
      timeline: withTimeline(seed.status, seed.patientId),
    });
  }

  // CLAUDE.md §6.4: 6 Prescriptions, one per completed appointment (7 exist; the oldest —
  // Rohit/patientUsers[4], daysAgo(14) — is deliberately left prescription-less per the
  // appointmentSeeds comment above). No pdfUrl here: generating real PDFs (letterhead, QR,
  // pdf-lib/qrcode) on every `npm run seed` run is slow and isn't required by the seed spec,
  // which only describes prescription data — only the real createPrescription/amendPrescription
  // code paths (exercised by their own tests) produce actual PDF files.
  const completedAppointments = await Appointment.find({ status: 'completed' }).sort({ slotStart: -1 }).limit(6);

  const medicineSets = [
    [{ name: 'Cetirizine', dosage: '10mg', frequency: 'OD', durationDays: 5, instructions: 'At night' }],
    [{ name: 'Pantoprazole', dosage: '40mg', frequency: 'OD', durationDays: 14, instructions: 'Before breakfast' }],
    [{ name: 'Paracetamol', dosage: '500mg', frequency: 'SOS', durationDays: 3 }],
    [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 7, instructions: 'After food' }],
    [{ name: 'Ibuprofen', dosage: '400mg', frequency: 'BD', durationDays: 5 }],
    [{ name: 'Montelukast', dosage: '10mg', frequency: 'OD', durationDays: 30, instructions: 'At night' }],
  ];
  const diagnosisNotes = [
    'Allergic dermatitis',
    'Acid reflux (GERD)',
    'Viral fever',
    'Bacterial throat infection',
    'Mild sprain',
    'Seasonal allergic rhinitis',
  ];
  const adviceNotes = [
    'Avoid known allergens. Follow up if rash persists.',
    'Avoid spicy food, elevate head while sleeping.',
    'Rest, plenty of fluids.',
    'Complete the full course even if symptoms improve.',
    'Ice pack for 15 minutes, avoid strain.',
    'Avoid dust exposure, use a humidifier at night.',
  ];
  const recommendedTestSets: { testName: string }[][] = [
    [],
    [{ testName: 'Complete Blood Count' }],
    [],
    [{ testName: 'Complete Blood Count' }, { testName: 'Throat Swab Culture' }],
    [],
    [{ testName: 'Allergy Panel' }],
  ];

  for (let i = 0; i < completedAppointments.length; i++) {
    const appointment = completedAppointments[i]!;
    await Prescription.create({
      appointmentId: appointment._id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      diagnosisNote: diagnosisNotes[i % diagnosisNotes.length],
      medicines: medicineSets[i % medicineSets.length],
      advice: adviceNotes[i % adviceNotes.length],
      recommendedTests: recommendedTestSets[i % recommendedTestSets.length],
      createdAt: appointment.slotStart,
    });
  }

  // CLAUDE.md §6.4: 8 Ratings, spread across doctors, with realistic text. This calls
  // createRating (the real ratings.service function) rather than hand-rolling
  // Rating.create + a DoctorProfile update, so the seeded avgRating/ratingCount are
  // guaranteed consistent with the exact recompute logic production traffic uses.
  //
  // Only 7 completed appointments exist in this seed (asserted exactly in seed.test.ts's
  // Phase 2 slice), and Rating.appointmentId is unique -- one rating per completed
  // appointment, enforced by both the schema and createRating's own
  // `Appointment.findOne({ _id, patientId, status: 'completed' })` lookup. Rating all 7
  // completed appointments (including the "completed-without-prescription" one, which is
  // still eligible -- createRating only requires status 'completed', not a Prescription)
  // is therefore the maximum possible without inflating the appointment counts other
  // describe blocks in this file assert exactly; 7 is seeded here in place of CLAUDE.md's
  // 8, spread across the 4 doctors who have completed appointments (Meera, Kavita, Rohit,
  // Anjali).
  console.log('Seeding ratings...');
  const ratingTexts = [
    'Very patient, explained everything clearly',
    'Quick appointment, straight to the point',
    'Helped me understand my condition much better',
    'Would recommend to anyone in the area',
    'Waited a bit but the consultation was thorough',
    'Friendly staff and a clean clinic',
    'Diagnosis was spot on',
  ];
  const ratedAppointments = await Appointment.find({ status: 'completed' }).sort({ slotStart: -1 });
  for (const [index, appointment] of ratedAppointments.entries()) {
    await createRating(
      appointment.patientId.toString(),
      appointment._id.toString(),
      3 + (index % 3), // spreads scores across 3-5
      ratingTexts[index]
    );
  }

  // CLAUDE.md §6.4: 4 TriageSessions — rash→Dermatology, acidity→Gastro, knee pain→Ortho,
  // chest pain→red-flag emergency (no doctor matching, no booking). 2 of them get linked
  // to already-seeded completed appointments via triageSessionId below.
  const rashSession = await TriageSession.create({
    patientId: patientUsers[0]!._id,
    messages: [
      { role: 'user', text: 'itchy red patches on my elbow for 2 weeks', at: daysAgo(3) },
      { role: 'assistant', text: 'How long have you had these symptoms? This is guidance, not medical advice.', at: daysAgo(3) },
      { role: 'user', text: '2 weeks', at: daysAgo(3) },
      { role: 'assistant', text: 'How severe is it — mild, moderate, or severe? This is guidance, not medical advice.', at: daysAgo(3) },
      { role: 'user', text: 'mild', at: daysAgo(3) },
      {
        role: 'assistant',
        text: "Based on what you've described, you may want to see: Dermatology. This is guidance, not medical advice.",
        at: daysAgo(3),
      },
    ],
    extractedSymptoms: ['itchy red patches', 'elbow'],
    suggestedSpecialties: [{ name: 'Dermatology', confidence: 0.87 }],
    recommendedDoctorIds: [meera.profileId, arjun.profileId],
    isRedFlag: false,
    disclaimerShownAt: daysAgo(3),
  });

  const aciditySession = await TriageSession.create({
    patientId: patientUsers[1]!._id,
    messages: [
      { role: 'user', text: 'acidity and heartburn after meals', at: daysAgo(4) },
      { role: 'assistant', text: 'How long have you had these symptoms? This is guidance, not medical advice.', at: daysAgo(4) },
      { role: 'user', text: '1 week', at: daysAgo(4) },
      {
        role: 'assistant',
        text: "Based on what you've described, you may want to see: Gastroenterology. This is guidance, not medical advice.",
        at: daysAgo(4),
      },
    ],
    extractedSymptoms: ['acidity', 'heartburn'],
    suggestedSpecialties: [{ name: 'Gastroenterology', confidence: 0.81 }],
    recommendedDoctorIds: [neha.profileId],
    isRedFlag: false,
    disclaimerShownAt: daysAgo(4),
  });

  await TriageSession.create({
    patientId: patientUsers[2]!._id,
    messages: [
      { role: 'user', text: 'knee pain when walking up stairs', at: daysAgo(6) },
      { role: 'assistant', text: 'How severe is the pain — mild, moderate, or severe? This is guidance, not medical advice.', at: daysAgo(6) },
      { role: 'user', text: 'moderate', at: daysAgo(6) },
      {
        role: 'assistant',
        text: "Based on what you've described, you may want to see: Orthopedics. This is guidance, not medical advice.",
        at: daysAgo(6),
      },
    ],
    extractedSymptoms: ['knee pain'],
    suggestedSpecialties: [{ name: 'Orthopedics', confidence: 0.79 }],
    recommendedDoctorIds: [farhan.profileId],
    isRedFlag: false,
    disclaimerShownAt: daysAgo(6),
  });

  await TriageSession.create({
    patientId: patientUsers[3]!._id,
    messages: [
      { role: 'user', text: 'crushing chest pain radiating to my arm', at: daysAgo(1) },
      {
        role: 'assistant',
        text: 'This may be a medical emergency. Seek emergency care immediately or call 112.',
        at: daysAgo(1),
      },
    ],
    extractedSymptoms: [],
    suggestedSpecialties: [],
    recommendedDoctorIds: [],
    isRedFlag: true,
    disclaimerShownAt: daysAgo(1),
  });

  // Link 2 sessions to already-seeded completed appointments via triageSessionId.
  // Meera's completed appointment for patientUsers[0] is a genuine specialty match
  // (Dermatology). No completed appointment exists for a Gastroenterology or Orthopedics
  // doctor in appointmentSeeds above, so the second link uses the closest available
  // match instead: Kavita's completed appointment for the same patient as the acidity
  // session (patientUsers[1]) — patient-consistent even though the doctor's specialty
  // (General Physician) differs from the triaged specialty (Gastroenterology).
  const rashAppointment = await Appointment.findOne({
    doctorId: meera.profileId,
    patientId: patientUsers[0]!._id,
    status: 'completed',
  });
  if (rashAppointment) {
    rashAppointment.triageSessionId = rashSession._id;
    await rashAppointment.save();
  }

  const acidityAppointment = await Appointment.findOne({
    doctorId: kavita.profileId,
    patientId: patientUsers[1]!._id,
    status: 'completed',
  });
  if (acidityAppointment) {
    acidityAppointment.triageSessionId = aciditySession._id;
    await acidityAppointment.save();
  }

  // CLAUDE.md §6.4: 3 LabReferrals + their LabBookings, plus 1 walk-in booking.
  //
  // The real createReferral service (labReferrals.service.ts) enforces
  // `Prescription.findOne({ _id: prescriptionId, doctorId: doctorProfile._id })` —
  // i.e. a referral's doctorId must be the doctor who actually authored the linked
  // prescription. Of the 6 Phase 4 prescriptions above, only Meera (i=0, patientUsers[0]),
  // Kavita (i=1, patientUsers[1]) and Rohit (i=2, patientUsers[2]) have prescriptions
  // recorded against a completed appointment; Neha is never assigned a completed
  // appointment anywhere in appointmentSeeds (she only appears as a recommended
  // doctor on the acidity TriageSession), so no real Neha-authored prescription
  // exists to reference. Rather than fabricate a referral whose prescriptionId
  // belongs to a different doctor than its doctorId (breaking the same invariant the
  // real service enforces), or inflate the Phase 1-4 appointment/prescription counts
  // that other describe blocks in this file assert exactly (7 completed, 6 prescriptions),
  // Dr. Rohit Malhotra's real completed-appointment prescription stands in for the
  // "report_ready" HealthFirst referral that CLAUDE.md attributes to Dr. Neha.
  const meeraRx = await Prescription.findOne({ doctorId: meera.profileId, patientId: patientUsers[0]!._id });
  const kavitaRx = await Prescription.findOne({ doctorId: kavita.profileId, patientId: patientUsers[1]!._id });
  const rohitRx = await Prescription.findOne({ doctorId: rohit.profileId, patientId: patientUsers[2]!._id });

  const labUserEmails = ['healthfirst.l@medlink.demo', 'citypath.l@medlink.demo', 'ghaziabaddiag.l@medlink.demo'];
  const labProfilesByEmail = new Map<string, InstanceType<typeof LabProfile>>();
  for (const email of labUserEmails) {
    const labUser = await User.findOne({ email });
    const labProfile = await LabProfile.findOne({ userId: labUser!._id });
    labProfilesByEmail.set(email, labProfile!);
  }
  const healthfirstLab = labProfilesByEmail.get('healthfirst.l@medlink.demo')!;
  const cityPathLab = labProfilesByEmail.get('citypath.l@medlink.demo')!;
  const ghaziabadLab = labProfilesByEmail.get('ghaziabaddiag.l@medlink.demo')!;

  // Referral 1: HealthFirst (LFT ₹450 + CBC ₹250 = ₹700) → report_ready, dummy PDF uploaded.
  const reportReadyReferral = await LabReferral.create({
    prescriptionId: rohitRx!._id,
    doctorId: rohit.profileId,
    patientId: rohitRx!.patientId,
    labId: healthfirstLab._id,
    suggestedTestCodes: ['LFT', 'CBC'],
    token: nanoid(),
    status: 'report_ready',
    timeline: [
      { status: 'sent', at: daysAgo(5) },
      { status: 'opened', at: daysAgo(4) },
      { status: 'booked', at: daysAgo(4) },
      { status: 'sample_collected', at: daysAgo(3) },
      { status: 'report_ready', at: daysAgo(2) },
    ],
    expiresAt: daysFromNow(25), // 30 days from its 'sent' timestamp (daysAgo(5))
  });
  const reportReadyBooking = await LabBooking.create({
    referralId: reportReadyReferral._id,
    patientId: reportReadyReferral.patientId,
    labId: reportReadyReferral.labId,
    testCodes: ['LFT', 'CBC'],
    totalPrice: 700,
    scheduledAt: daysAgo(3),
    homeCollection: true,
    status: 'report_ready',
  });
  // Reports are stored keyed by the LabBooking's id, not the referral's id — this
  // mirrors the real upload path in labBookings.controller.ts/service.ts
  // (`/uploads/lab-reports/${bookingId}.pdf`), not the referral._id.
  const reportSamplePath = path.join(__dirname, 'assets', 'report_sample.pdf');
  const reportDestDir = path.join(process.cwd(), 'uploads', 'lab-reports');
  fs.mkdirSync(reportDestDir, { recursive: true });
  const reportDestPath = path.join(reportDestDir, `${reportReadyBooking._id.toString()}.pdf`);
  fs.copyFileSync(reportSamplePath, reportDestPath);
  const reportUrl = `/uploads/lab-reports/${reportReadyBooking._id.toString()}.pdf`;
  reportReadyBooking.reportUrl = reportUrl;
  await reportReadyBooking.save();
  reportReadyReferral.reportUrl = reportUrl;
  await reportReadyReferral.save();

  // Referral 2: Dr. Kavita → Ghaziabad Diagnostic Centre (HBA1C ₹300 + BLOODSUGAR ₹120 = ₹420) → booked.
  const bookedReferral = await LabReferral.create({
    prescriptionId: kavitaRx!._id,
    doctorId: kavita.profileId,
    patientId: kavitaRx!.patientId,
    labId: ghaziabadLab._id,
    suggestedTestCodes: ['HBA1C', 'BLOODSUGAR'],
    token: nanoid(),
    status: 'booked',
    timeline: [
      { status: 'sent', at: daysAgo(4) },
      { status: 'opened', at: daysAgo(3) },
      { status: 'booked', at: daysAgo(3) },
    ],
    expiresAt: daysFromNow(26), // 30 days from its 'sent' timestamp (daysAgo(4))
  });
  await LabBooking.create({
    referralId: bookedReferral._id,
    patientId: bookedReferral.patientId,
    labId: bookedReferral.labId,
    testCodes: ['HBA1C', 'BLOODSUGAR'],
    totalPrice: 420,
    scheduledAt: daysFromNow(1),
    homeCollection: false, // Ghaziabad Diagnostic Centre offers no home collection
    status: 'booked',
  });

  // Referral 3: Dr. Meera → City Path Labs (CBC ₹285) → sent (patient hasn't clicked yet —
  // demo the click live). No LabBooking exists for this one.
  const sentReferral = await LabReferral.create({
    prescriptionId: meeraRx!._id,
    doctorId: meera.profileId,
    patientId: meeraRx!.patientId,
    labId: cityPathLab._id,
    suggestedTestCodes: ['CBC'],
    token: nanoid(),
    status: 'sent',
    timeline: [{ status: 'sent', at: daysAgo(1) }],
    expiresAt: daysFromNow(29), // 30 days from its 'sent' timestamp (daysAgo(1))
  });
  // Mirrors the notification the real createReferral service sends on referral
  // creation, so this seeded 'sent' referral is actually discoverable from the
  // patient's notification bell -- otherwise there's no way to demo "the patient
  // hasn't clicked yet" live, since nothing points at /r/{token}.
  await createNotification({
    userId: sentReferral.patientId.toString(),
    type: 'lab_referral_sent',
    title: 'Your doctor has recommended a lab test',
    body: `${cityPathLab.labName} offers the recommended test(s). Tap to book.`,
    link: `/r/${sentReferral.token}`,
  });
  // Mirrors the lab-side notification createReferral's own production code path now
  // sends (labReferrals.service.ts, Task 11) alongside the patient notification above --
  // otherwise the lab dashboard's notification bell has nothing for this referral.
  await createNotification({
    userId: cityPathLab.userId.toString(),
    type: 'lab_referral_received',
    title: 'New lab referral',
    body: `A doctor referred a patient to you for: ${sentReferral.suggestedTestCodes.join(', ')}.`,
  });

  // Walk-in booking: a patient books a lab test directly, with no referral at all.
  await LabBooking.create({
    patientId: patientUsers[5]!._id,
    labId: healthfirstLab._id,
    testCodes: ['TSH'],
    totalPrice: 300,
    scheduledAt: daysFromNow(2),
    homeCollection: false,
    status: 'booked',
  });

  await Notification.create({
    userId: admin._id, type: 'admin', title: 'Pending verifications',
    body: '2 verification requests are awaiting your review.', createdAt: new Date(),
  });
}

if (require.main === module) {
  connectDB(process.env.MONGO_URI ?? 'mongodb://localhost:27017/medlink')
    .then(runSeed)
    .then(disconnectDB)
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
