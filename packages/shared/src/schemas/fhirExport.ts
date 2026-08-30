import { z } from 'zod';

// Only a shape check here -- whether `encounterId` actually names an
// Appointment belonging to the requested patient is a DB-membership check,
// resolved in apps/api's fhirExport.service.ts, not something Zod alone
// can express.
export const FhirExportQuery = z.object({
  encounterId: z.string().min(1).optional(),
});
export type FhirExportQuery = z.infer<typeof FhirExportQuery>;
