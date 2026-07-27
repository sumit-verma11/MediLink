export const PATIENTS = [
  { email: 'rahul.p@medlink.demo', name: 'Rahul Sharma', phone: '9810000001', age: 34, gender: 'male' as const, city: 'Noida' },
  { email: 'priya.p@medlink.demo', name: 'Priya Singh', phone: '9810000002', age: 28, gender: 'female' as const, city: 'Delhi' },
  { email: 'amit.p@medlink.demo', name: 'Amit Kumar', phone: '9810000003', age: 45, gender: 'male' as const, city: 'Ghaziabad' },
  { email: 'sneha.p@medlink.demo', name: 'Sneha Gupta', phone: '9810000004', age: 8, gender: 'female' as const, city: 'Noida' },
  { email: 'vikram.p@medlink.demo', name: 'Vikram Rathore', phone: '9810000005', age: 62, gender: 'male' as const, city: 'Delhi' },
  { email: 'anita.p@medlink.demo', name: 'Anita Verma', phone: '9810000006', age: 51, gender: 'female' as const, city: 'Ghaziabad' },
];

export const DOCTORS = [
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
};
