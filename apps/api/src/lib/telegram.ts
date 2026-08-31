import { logger } from './logger';

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // No bot configured (local dev / CI) — log instead of calling out, same
    // fallback shape as mailer.ts's jsonTransport when SMTP_USER is unset.
    logger.info({ chatId, text }, 'telegram send skipped: no TELEGRAM_BOT_TOKEN configured');
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    // Best-effort, same contract as sendAppointmentEmail: never throws into the caller.
    logger.error(err, 'failed to send telegram message');
  }
}
