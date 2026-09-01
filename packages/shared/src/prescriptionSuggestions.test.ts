import { describe, it, expect } from 'vitest';
import { SPECIALTY_PRESCRIPTION_SUGGESTIONS } from './prescriptionSuggestions';
import { GENERIC_MEDICINES } from './genericMedicines';

// The specialties actually seeded for demo doctors (apps/api/src/seed/data.ts) --
// the minimum set that must resolve a suggestion so every seeded doctor's
// composer has something to show, per the design spec's Data shapes section.
const SEEDED_SPECIALTIES = [
  'Dermatology', 'General Physician', 'Gastroenterology', 'Cardiology',
  'Gynecology', 'Orthopedics', 'Pediatrics', 'ENT', 'Psychiatry', 'Ophthalmology',
];

describe('SPECIALTY_PRESCRIPTION_SUGGESTIONS', () => {
  it('covers every specialty seeded for demo doctors', () => {
    for (const specialty of SEEDED_SPECIALTIES) {
      expect(SPECIALTY_PRESCRIPTION_SUGGESTIONS[specialty]).toBeDefined();
    }
  });

  it('gives every entry 1-3 medicines and a non-empty advice string', () => {
    for (const entry of Object.values(SPECIALTY_PRESCRIPTION_SUGGESTIONS)) {
      expect(entry.medicines.length).toBeGreaterThanOrEqual(1);
      expect(entry.medicines.length).toBeLessThanOrEqual(3);
      expect(entry.advice.length).toBeGreaterThan(0);
    }
  });

  it('only suggests medicine names that exist in GENERIC_MEDICINES', () => {
    for (const entry of Object.values(SPECIALTY_PRESCRIPTION_SUGGESTIONS)) {
      for (const medicine of entry.medicines) {
        expect(GENERIC_MEDICINES).toContain(medicine.name);
      }
    }
  });

  it('gives every medicine a dosage, frequency, and positive durationDays', () => {
    for (const entry of Object.values(SPECIALTY_PRESCRIPTION_SUGGESTIONS)) {
      for (const medicine of entry.medicines) {
        expect(medicine.dosage.length).toBeGreaterThan(0);
        expect(medicine.frequency.length).toBeGreaterThan(0);
        expect(medicine.durationDays).toBeGreaterThan(0);
      }
    }
  });
});
