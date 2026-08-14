export const PATIENTS = [
  { email: 'rahul.p@medlink.demo', name: 'Rahul Sharma', phone: '9810000001', age: 34, gender: 'male' as const, city: 'Noida' },
  { email: 'priya.p@medlink.demo', name: 'Priya Singh', phone: '9810000002', age: 28, gender: 'female' as const, city: 'Delhi' },
  { email: 'amit.p@medlink.demo', name: 'Amit Kumar', phone: '9810000003', age: 45, gender: 'male' as const, city: 'Ghaziabad' },
  { email: 'sneha.p@medlink.demo', name: 'Sneha Gupta', phone: '9810000004', age: 8, gender: 'female' as const, city: 'Noida' },
  { email: 'vikram.p@medlink.demo', name: 'Vikram Rathore', phone: '9810000005', age: 62, gender: 'male' as const, city: 'Delhi' },
  { email: 'anita.p@medlink.demo', name: 'Anita Verma', phone: '9810000006', age: 51, gender: 'female' as const, city: 'Ghaziabad' },
];

const CURATED_DOCTORS = [
  { email: 'meera.d@medlink.demo', name: 'Dr. Meera Sharma', specialties: ['Dermatology'], city: 'Noida', fee: 600, exp: 9, status: 'approved' as const },
  { email: 'arjun.d@medlink.demo', name: 'Dr. Arjun Khanna', specialties: ['Dermatology'], city: 'Delhi', fee: 900, exp: 14, status: 'approved' as const },
  { email: 'kavita.d@medlink.demo', name: 'Dr. Kavita Rao', specialties: ['General Physician'], city: 'Noida', fee: 400, exp: 7, status: 'approved' as const },
  { email: 'sanjay.d@medlink.demo', name: 'Dr. Sanjay Gupta', specialties: ['General Physician'], city: 'Ghaziabad', fee: 350, exp: 20, status: 'approved' as const },
  { email: 'neha.d@medlink.demo', name: 'Dr. Neha Verma', specialties: ['Gastroenterology'], city: 'Delhi', fee: 1000, exp: 11, status: 'approved' as const },
  { email: 'rohit.d@medlink.demo', name: 'Dr. Rohit Malhotra', specialties: ['Cardiology'], city: 'Delhi', fee: 1200, exp: 16, status: 'approved' as const },
  { email: 'anjali.d@medlink.demo', name: 'Dr. Anjali Singh', specialties: ['Gynecology'], city: 'Noida', fee: 700, exp: 10, status: 'approved' as const },
  { email: 'farhan.d@medlink.demo', name: 'Dr. Farhan Ali', specialties: ['Orthopedics'], city: 'Noida', fee: 800, exp: 12, status: 'approved' as const },
  { email: 'pooja.d@medlink.demo', name: 'Dr. Pooja Iyer', specialties: ['Pediatrics'], city: 'Delhi', fee: 600, exp: 8, status: 'approved' as const },
  { email: 'vivek.d@medlink.demo', name: 'Dr. Vivek Joshi', specialties: ['ENT'], city: 'Ghaziabad', fee: 500, exp: 9, status: 'approved' as const },
  { email: 'ritu.d@medlink.demo', name: 'Dr. Ritu Bansal', specialties: ['Psychiatry'], city: 'Delhi', fee: 1100, exp: 13, status: 'approved' as const },
  { email: 'karan.d@medlink.demo', name: 'Dr. Karan Mehta', specialties: ['Ophthalmology'], city: 'Noida', fee: 650, exp: 6, status: 'pending' as const },
];

// Bulks the roster up so search/listing pages read as a real, populated
// marketplace instead of a handful of demo cards. Deterministic (no Math.random
// for names/specialty/city) so re-running the idempotent seed produces the same
// roster every time; regNo below is the only intentionally random field.
const EXTRA_FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Aryan', 'Yash', 'Dhruv', 'Nikhil', 'Varun', 'Siddharth', 'Abhishek', 'Manoj', 'Rajesh', 'Anand',
  'Deepak', 'Vikas', 'Ravi', 'Ajay', 'Gaurav', 'Naveen', 'Pankaj', 'Ashok', 'Mahesh', 'Sunil',
  'Vinod', 'Ramesh', 'Prakash', 'Harish', 'Sandeep', 'Sameer', 'Tarun', 'Puneet', 'Mohit', 'Nitin',
  'Kunal', 'Vishal', 'Saurabh', 'Anil', 'Aanya', 'Diya', 'Saanvi', 'Ananya', 'Pari', 'Anika',
  'Navya', 'Riya', 'Ira', 'Myra', 'Sara', 'Aditi', 'Ishita', 'Kavya', 'Rhea', 'Shreya',
  'Simran', 'Swati', 'Tanya', 'Vidya', 'Zara', 'Sunita', 'Rekha', 'Geeta', 'Kiran', 'Lata',
  'Madhuri', 'Nandini', 'Pallavi', 'Preeti', 'Radha', 'Seema', 'Shalini', 'Uma', 'Vandana', 'Bhavna',
  'Charu', 'Divya', 'Esha', 'Falguni', 'Gauri', 'Hema',
];
const EXTRA_LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Kumar', 'Singh', 'Rao', 'Reddy', 'Iyer', 'Nair', 'Menon',
  'Pillai', 'Khanna', 'Malhotra', 'Kapoor', 'Chopra', 'Bansal', 'Mehta', 'Shah', 'Patel', 'Joshi',
  'Desai', 'Trivedi', 'Pandey', 'Mishra', 'Tiwari', 'Dubey', 'Saxena', 'Agarwal', 'Bhatia', 'Chawla',
  'Arora', 'Bhalla', 'Chauhan', 'Rathore', 'Yadav', 'Choudhary', 'Jain', 'Goel', 'Aggarwal', 'Bajaj',
  'Sethi', 'Kohli', 'Dutta', 'Sen', 'Bose', 'Mukherjee', 'Chatterjee', 'Banerjee', 'Ghosh', 'Das',
];
const SPECIALTY_FEE_RANGE: Record<string, [number, number]> = {
  Dermatology: [500, 1000],
  'General Physician': [300, 550],
  Gastroenterology: [800, 1300],
  Cardiology: [1000, 1800],
  Gynecology: [600, 1100],
  Orthopedics: [700, 1200],
  Pediatrics: [500, 900],
  ENT: [400, 800],
  Psychiatry: [900, 1500],
  Ophthalmology: [500, 900],
};
const EXTRA_SPECIALTIES = Object.keys(SPECIALTY_FEE_RANGE);
const EXTRA_CITIES = ['Noida', 'Delhi', 'Ghaziabad'];

function generateExtraDoctors(count: number): typeof CURATED_DOCTORS {
  const doctors: typeof CURATED_DOCTORS = [];
  for (let i = 0; i < count; i++) {
    const first = EXTRA_FIRST_NAMES[i % EXTRA_FIRST_NAMES.length]!;
    const last = EXTRA_LAST_NAMES[(i * 7 + 3) % EXTRA_LAST_NAMES.length]!;
    const specialty = EXTRA_SPECIALTIES[i % EXTRA_SPECIALTIES.length]!;
    const city = EXTRA_CITIES[i % EXTRA_CITIES.length]!;
    const [minFee, maxFee] = SPECIALTY_FEE_RANGE[specialty]!;
    const fee = minFee + ((i * 37) % (maxFee - minFee + 1));
    const exp = 3 + (i % 23);
    doctors.push({
      email: `${first}.${last}.${i}@medlink.demo`.toLowerCase(),
      name: `Dr. ${first} ${last}`,
      specialties: [specialty],
      city,
      fee,
      exp,
      status: 'approved' as const,
    });
  }
  return doctors;
}

const GENERATED_DOCTORS = generateExtraDoctors(90);

export const DOCTORS = [...CURATED_DOCTORS, ...GENERATED_DOCTORS];

// Every generated doctor also gets a weekly slot, cycling through a handful of
// realistic patterns by index, so search results are bookable rather than
// decorative-only.
const EXTRA_AVAILABILITY_PATTERNS: { dayOfWeek: number; startTime: string; endTime: string; slotMinutes: number }[][] = [
  [{ dayOfWeek: 1, startTime: '10:00', endTime: '13:00', slotMinutes: 15 }],
  [{ dayOfWeek: 2, startTime: '17:00', endTime: '20:00', slotMinutes: 20 }],
  [{ dayOfWeek: 3, startTime: '09:00', endTime: '12:00', slotMinutes: 10 }],
  [{ dayOfWeek: 4, startTime: '16:00', endTime: '19:00', slotMinutes: 15 }],
  [{ dayOfWeek: 5, startTime: '11:00', endTime: '14:00', slotMinutes: 20 }],
  [{ dayOfWeek: 6, startTime: '10:00', endTime: '13:00', slotMinutes: 15 }],
];
const GENERATED_AVAILABILITY_RULES: Record<string, { dayOfWeek: number; startTime: string; endTime: string; slotMinutes: number }[]> =
  Object.fromEntries(GENERATED_DOCTORS.map((d, i) => [d.email, EXTRA_AVAILABILITY_PATTERNS[i % EXTRA_AVAILABILITY_PATTERNS.length]!]));

export const LABS = [
  {
    email: 'healthfirst.l@medlink.demo', name: 'HealthFirst Diagnostics', city: 'Noida', homeCollection: true, status: 'approved' as const,
    tests: [
      { code: 'CBC', name: 'Complete Blood Count', price: 250, turnaroundHours: 6 },
      { code: 'LFT', name: 'Liver Function Test', price: 450, turnaroundHours: 12 },
      { code: 'KFT', name: 'Kidney Function Test', price: 450, turnaroundHours: 12 },
      { code: 'TSH', name: 'Thyroid Profile (TSH)', price: 300, turnaroundHours: 12 },
      { code: 'HBA1C', name: 'HbA1c (Diabetes)', price: 400, turnaroundHours: 12 },
      { code: 'LIPID', name: 'Lipid Profile', price: 500, turnaroundHours: 12 },
      { code: 'VITD', name: 'Vitamin D', price: 900, turnaroundHours: 24 },
      { code: 'URINE', name: 'Urine Routine', price: 150, turnaroundHours: 6 },
    ],
  },
  {
    email: 'citypath.l@medlink.demo', name: 'City Path Labs', city: 'Delhi', homeCollection: true, status: 'approved' as const,
    tests: [
      { code: 'CBC', name: 'Complete Blood Count', price: 285, turnaroundHours: 6 },
      { code: 'LFT', name: 'Liver Function Test', price: 500, turnaroundHours: 12 },
      { code: 'XRAYC', name: 'Chest X-Ray', price: 350, turnaroundHours: 24 },
      { code: 'ECG', name: 'ECG', price: 250, turnaroundHours: 6 },
      { code: 'USGABD', name: 'Ultrasound Abdomen', price: 1200, turnaroundHours: 24 },
    ],
  },
  {
    email: 'ghaziabaddiag.l@medlink.demo', name: 'Ghaziabad Diagnostic Centre', city: 'Ghaziabad', homeCollection: false, status: 'approved' as const,
    tests: [
      { code: 'CBC', name: 'Complete Blood Count', price: 180, turnaroundHours: 6 },
      { code: 'TSH', name: 'Thyroid Profile (TSH)', price: 220, turnaroundHours: 12 },
      { code: 'HBA1C', name: 'HbA1c (Diabetes)', price: 300, turnaroundHours: 12 },
      { code: 'LIPID', name: 'Lipid Profile', price: 380, turnaroundHours: 12 },
      { code: 'URINE', name: 'Urine Routine', price: 100, turnaroundHours: 6 },
      { code: 'BLOODSUGAR', name: 'Blood Sugar (FBS/PPBS)', price: 120, turnaroundHours: 6 },
    ],
  },
  {
    email: 'metroscans.l@medlink.demo', name: 'Metro Scans & Labs', city: 'Delhi', homeCollection: false, status: 'pending' as const,
    tests: [
      { code: 'MRIKNEE', name: 'MRI Knee', price: 4500, turnaroundHours: 48 },
      { code: 'CTHEAD', name: 'CT Head', price: 3200, turnaroundHours: 24 },
      { code: 'USGABD', name: 'Ultrasound Abdomen', price: 1100, turnaroundHours: 24 },
    ],
  },
];

// One weekly rule per approved doctor, matching the CLAUDE.md §6.2 "Availability" column
// (days abbreviated; only the pattern needed for slot generation is encoded here — exact
// days/times are illustrative demo data, not load-bearing for any test).
export const AVAILABILITY_RULES_BY_DOCTOR_EMAIL: Record<string, { dayOfWeek: number; startTime: string; endTime: string; slotMinutes: number }[]> = {
  'meera.d@medlink.demo': [{ dayOfWeek: 1, startTime: '18:00', endTime: '21:00', slotMinutes: 15 }],
  'arjun.d@medlink.demo': [{ dayOfWeek: 2, startTime: '10:00', endTime: '13:00', slotMinutes: 20 }],
  'kavita.d@medlink.demo': [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00', slotMinutes: 10 }],
  'sanjay.d@medlink.demo': [{ dayOfWeek: 1, startTime: '17:00', endTime: '20:00', slotMinutes: 15 }],
  'neha.d@medlink.demo': [{ dayOfWeek: 1, startTime: '11:00', endTime: '14:00', slotMinutes: 20 }],
  'rohit.d@medlink.demo': [{ dayOfWeek: 2, startTime: '09:00', endTime: '12:00', slotMinutes: 20 }],
  'anjali.d@medlink.demo': [{ dayOfWeek: 1, startTime: '16:00', endTime: '19:00', slotMinutes: 15 }],
  'farhan.d@medlink.demo': [{ dayOfWeek: 2, startTime: '18:00', endTime: '21:00', slotMinutes: 15 }],
  'pooja.d@medlink.demo': [{ dayOfWeek: 1, startTime: '10:00', endTime: '13:00', slotMinutes: 15 }],
  'vivek.d@medlink.demo': [{ dayOfWeek: 1, startTime: '11:00', endTime: '13:00', slotMinutes: 15 }],
  'ritu.d@medlink.demo': [{ dayOfWeek: 2, startTime: '15:00', endTime: '18:00', slotMinutes: 30 }],
  ...GENERATED_AVAILABILITY_RULES,
};
