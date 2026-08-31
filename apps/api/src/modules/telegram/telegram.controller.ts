import { Request, Response, NextFunction } from 'express';
import { generateLinkCode, handleStartCommand, unlinkTelegram } from './telegram.service';

export async function generateLinkCodeHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await generateLinkCode(req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

interface TelegramUpdate {
  message?: { text?: string; chat: { id: number } };
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  // Telegram's own webhook verification mechanism -- 404, not 401, so a scanner
  // probing for this route gets the same response as a route that doesn't exist.
  if (req.header('X-Telegram-Bot-Api-Secret-Token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    res.status(404).end();
    return;
  }

  const update = req.body as TelegramUpdate;
  const match = update.message?.text?.match(/^\/start (.+)$/);
  if (match) {
    await handleStartCommand(match[1]!, String(update.message!.chat.id));
  }

  // Always 200, regardless of match -- Telegram retries the update on any non-2xx.
  res.status(200).json({});
}

export async function unlinkHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await unlinkTelegram(req.user!.id);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}
