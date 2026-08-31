import { logger } from './logger';
import { subjectFor, bodyFor, Template } from './mailer';
import { IUser } from '../models/User';

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

// Reuses mailer.ts's subjectFor/bodyFor so the two channels can never drift out of
// sync in wording -- same template/data shape sendAppointmentEmail already takes.
export async function sendAppointmentTelegram(
  user: IUser | null,
  template: Template,
  data: Record<string, unknown>
): Promise<void> {
  if (!user?.telegramChatId) return;
  const text = `${subjectFor(template, data)}\n\n${bodyFor(template, data)}`;
  await sendTelegramMessage(user.telegramChatId, text);
}
