import { describe, it, expect, vi, afterEach } from 'vitest';
import { sendTelegramMessage } from './telegram';

describe('sendTelegramMessage', () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it('posts chat_id and text to the Telegram Bot API when a token is configured', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('12345', 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chat_id: '12345', text: 'hello' }),
      })
    );
  });

  it('does not call fetch when TELEGRAM_BOT_TOKEN is unset', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await sendTelegramMessage('12345', 'hello');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a fetch rejection without throwing', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(sendTelegramMessage('12345', 'hello')).resolves.toBeUndefined();
  });
});
