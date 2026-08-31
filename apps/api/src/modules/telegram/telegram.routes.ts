import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { apiLimiter, telegramWebhookLimiter } from '../../middleware/rateLimit';
import { generateLinkCodeHandler, webhookHandler, unlinkHandler } from './telegram.controller';

export const telegramRouter = Router();
telegramRouter.post('/link-code', apiLimiter, requireAuth, generateLinkCodeHandler);
telegramRouter.delete('/link', apiLimiter, requireAuth, unlinkHandler);

// Public, secret-token gated (Telegram's own webhook verification mechanism) --
// separate from the two routes above, same reasoning as publicReferralRouter in
// labReferrals.routes.ts: never pass through requireAuth.
export const telegramWebhookRouter = Router();
telegramWebhookRouter.post('/webhook', telegramWebhookLimiter, webhookHandler);
