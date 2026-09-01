import { Router } from 'express';
import { CreatePrescriptionInput, AmendPrescriptionInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { rxVerifyLimiter } from '../../middleware/rateLimit';
import {
  createPrescriptionHandler,
  amendPrescriptionHandler,
  listMyPrescriptionsHandler,
  getPrescriptionPdfHandler,
  getPublicVerificationHandler,
  getPrescriptionSuggestionsHandler,
} from './prescriptions.controller';

export const prescriptionsRouter = Router();

// Public verification lookup -- no auth, no PHI. Must be registered before
// the router-wide requireAuth below. This is the only unauthenticated route
// in the API, so it gets its own dedicated limiter rather than relying on
// the auth-gated routes' protection.
prescriptionsRouter.get('/verify/:id', rxVerifyLimiter, getPublicVerificationHandler);

prescriptionsRouter.use(requireAuth);
prescriptionsRouter.post('/', requireRole('doctor'), validate(CreatePrescriptionInput), createPrescriptionHandler);
prescriptionsRouter.post('/:id/amend', requireRole('doctor'), validate(AmendPrescriptionInput), amendPrescriptionHandler);
prescriptionsRouter.get('/me', requireRole('patient'), listMyPrescriptionsHandler);
prescriptionsRouter.get('/:id/pdf', requireRole('patient', 'doctor'), getPrescriptionPdfHandler);

// Feature-flagged per design spec Open Questions: no flag-infrastructure
// exists in this repo, so a single env var read once at route-registration
// time is the proportionate choice for one optional route. Unset or any
// value other than the literal string 'false' means enabled -- this keeps
// local dev and CI on by default without requiring a new .env entry.
if (process.env.AI_PRESCRIPTION_SUGGESTIONS_ENABLED !== 'false') {
  prescriptionsRouter.get('/suggest/:appointmentId', requireRole('doctor'), getPrescriptionSuggestionsHandler);
}
