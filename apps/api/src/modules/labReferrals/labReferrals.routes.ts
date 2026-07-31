import { Router } from 'express';
import { CreateLabReferralInput } from '@medlink/shared';
import { requireAuth, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { apiLimiter, referralLookupLimiter } from '../../middleware/rateLimit';
import {
  createReferralHandler,
  getReferralByTokenHandler,
  listReferralsForDoctorHandler,
  listReferralsForLabHandler,
} from './labReferrals.controller';

export const labReferralsRouter = Router();
labReferralsRouter.use(apiLimiter);
labReferralsRouter.use(requireAuth, requireRole('doctor'));
labReferralsRouter.post('/', validate(CreateLabReferralInput), createReferralHandler);
labReferralsRouter.get('/me', listReferralsForDoctorHandler);

// A separate router (not a route on labReferralsRouter above) because that router is
// gated router-wide to requireRole('doctor') via .use() -- a lab-only route cannot live
// on it without changing that gate. IMPORTANT: this router must be mounted at
// '/api/lab-referrals' BEFORE labReferralsRouter in app.ts (not after) -- Express runs a
// mounted router's path-less `.use()` middleware for ANY request under that mount point,
// so if labReferralsRouter (whose requireRole('doctor') is a router-wide `.use()`) were
// mounted first, a lab caller hitting GET /for-lab would be rejected there before ever
// reaching this router. See the mount-order comment in app.ts.
//
// apiLimiter is applied directly on the /for-lab route below, not via a router-wide
// .use() here -- this router is mounted first, so a path-less .use() would run on every
// /api/lab-referrals/* request (including ones that fall through to labReferralsRouter),
// double-counting them against the shared per-IP budget.
export const labFacingReferralsRouter = Router();
labFacingReferralsRouter.get('/for-lab', apiLimiter, requireAuth, requireRole('lab'), listReferralsForLabHandler);

// Public token lookup -- no auth, no role check. Registered as a SEPARATE
// router (rather than a route on labReferralsRouter above, which is gated by
// the router-wide requireAuth+requireRole('doctor') via `.use()`) and mounted
// at its own base path (`/api/r`, see app.ts) so it never passes through
// those middlewares. This is the second unauthenticated surface in the API
// (after GET /api/prescriptions/verify/:id), so it gets its own dedicated
// rate limiter rather than relying on the auth-gated routes' protection.
export const publicReferralRouter = Router();
publicReferralRouter.get('/:token', referralLookupLimiter, getReferralByTokenHandler);
