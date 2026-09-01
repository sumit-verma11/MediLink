// Curated, rule-based specialty -> suggested-medicines/advice lookup. This is
// NOT a trained model and makes no symptom-level claim -- same spirit as
// apps/ai/specialty_map.json (curated specialty<->symptom phrases) and
// genericMedicines.ts (curated static drug list). See design spec Design
// Decision 1 for why specialty (not free-text symptom matching) is the
// signal, and Non-goals for why this stays specialty-level.

export interface MedicineSuggestion {
  name: string; // must be one of GENERIC_MEDICINES
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface SpecialtySuggestionEntry {
  medicines: MedicineSuggestion[]; // 1-3 entries
  advice: string;
}

export const SPECIALTY_PRESCRIPTION_SUGGESTIONS: Record<string, SpecialtySuggestionEntry> = {
  Dermatology: {
    medicines: [
      { name: 'Cetirizine', dosage: '10mg', frequency: 'OD', durationDays: 5, instructions: 'After food' },
      { name: 'Hydrocortisone Cream', dosage: 'Apply thin layer', frequency: 'BD', durationDays: 7 },
    ],
    advice: 'Avoid known allergens; keep affected area clean and dry.',
  },
  'General Physician': {
    medicines: [
      { name: 'Paracetamol', dosage: '500mg', frequency: 'TDS', durationDays: 3, instructions: 'After food' },
    ],
    advice: 'Rest, stay hydrated, and monitor temperature; follow up if symptoms persist beyond 3 days.',
  },
  Gastroenterology: {
    medicines: [
      { name: 'Pantoprazole', dosage: '40mg', frequency: 'OD', durationDays: 14, instructions: 'Before breakfast' },
      { name: 'Domperidone', dosage: '10mg', frequency: 'BD', durationDays: 5, instructions: 'Before food' },
    ],
    advice: 'Avoid spicy/oily food and large meals close to bedtime.',
  },
  Cardiology: {
    medicines: [
      { name: 'Amlodipine', dosage: '5mg', frequency: 'OD', durationDays: 30 },
      { name: 'Atorvastatin', dosage: '10mg', frequency: 'OD', durationDays: 30, instructions: 'At night' },
    ],
    advice: 'Low-salt, low-fat diet; monitor blood pressure regularly.',
  },
  Gynecology: {
    medicines: [
      { name: 'Iron + Folic Acid', dosage: '1 tablet', frequency: 'OD', durationDays: 30 },
    ],
    advice: 'Maintain a balanced diet; follow up as advised for routine monitoring.',
  },
  Orthopedics: {
    medicines: [
      { name: 'Diclofenac', dosage: '50mg', frequency: 'BD', durationDays: 5, instructions: 'After food' },
      { name: 'Calcium Carbonate', dosage: '500mg', frequency: 'OD', durationDays: 30 },
    ],
    advice: 'Rest the affected area; apply ice for the first 48 hours if swelling is present.',
  },
  Pediatrics: {
    medicines: [
      { name: 'Paracetamol', dosage: '250mg', frequency: 'TDS', durationDays: 3, instructions: 'After food' },
      { name: 'ORS Sachets', dosage: '1 sachet in 200ml water', frequency: 'As needed', durationDays: 3 },
    ],
    advice: 'Ensure adequate fluid intake; seek urgent care if fever exceeds 3 days.',
  },
  ENT: {
    medicines: [
      { name: 'Levocetirizine', dosage: '5mg', frequency: 'OD', durationDays: 5, instructions: 'At night' },
      { name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 5, instructions: 'After food' },
    ],
    advice: 'Steam inhalation twice daily; avoid cold beverages.',
  },
  Psychiatry: {
    medicines: [
      { name: 'Sertraline', dosage: '50mg', frequency: 'OD', durationDays: 30, instructions: 'Morning' },
    ],
    advice: 'Maintain a regular sleep schedule; follow up in 2-4 weeks to review response.',
  },
  Ophthalmology: {
    medicines: [
      { name: 'Betamethasone Cream', dosage: 'Apply thin layer', frequency: 'BD', durationDays: 5 },
    ],
    advice: 'Avoid rubbing the eyes; maintain good hand hygiene.',
  },
};
