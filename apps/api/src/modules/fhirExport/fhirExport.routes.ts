import { Router } from 'express';
import { FhirExportQuery } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter } from '../../middleware/rateLimit';
import { getFhirExportHandler } from './fhirExport.controller';

export const fhirExportRouter = Router();

fhirExportRouter.use(apiLimiter);
fhirExportRouter.use(requireAuth, requireRole('patient', 'doctor', 'admin'));
// The literal `$` (mirroring FHIR's own `$everything` operation-invocation naming
// convention) must be escaped here: Express 4's path-to-regexp (0.1.x) does not
// auto-escape regex metacharacters in literal path segments, so an unescaped `$`
// is compiled as a regex end-of-string anchor -- silently making this route
// unmatchable (a bare 404, not even reaching this handler). Caught live: every
// integration test past the 401 case failed with a raw Express 404, not this
// route's own JSON error shape.
fhirExportRouter.get(
  '/Patient/:patientId/\\$everything-lite',
  validate(FhirExportQuery, 'query'),
  getFhirExportHandler
);
