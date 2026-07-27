import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { initSocket, emitAppointmentUpdate } from './socket';
import { signAccessToken } from '../modules/auth/jwt';

process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';

let httpServer: ReturnType<typeof createServer>;
let port: number;
const openClients: ClientSocket[] = [];

function connectWithCookie(cookieHeader?: string): ClientSocket {
  // Node-side socket.io clients can set arbitrary handshake headers, which is how a
  // browser's httpOnly accessToken cookie is simulated here.
  const client = ioClient(`http://localhost:${port}`, {
    ...(cookieHeader ? { extraHeaders: { Cookie: cookieHeader } } : {}),
    reconnection: false,
  });
  openClients.push(client);
  return client;
}

beforeAll(async () => {
  httpServer = createServer();
  initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(() => {
  for (const client of openClients) client.close();
  httpServer.close();
});

describe('socket.io handshake authentication', () => {
  it('places an authenticated client in its own user room and delivers updates there', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const { token } = signAccessToken(userId, 'patient');
    const client = connectWithCookie(`accessToken=${token}`);

    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('connect_error', reject);
    });

    const received = new Promise((resolve) => client.on('appointment:updated', resolve));
    // Note: no join event is emitted by the client — the server derived the room itself.
    emitAppointmentUpdate(userId, { _id: 'appt-1', status: 'confirmed' });

    expect(await received).toEqual({ _id: 'appt-1', status: 'confirmed' });
    client.close();
  });

  it('rejects a connection with no cookie at all', async () => {
    const client = connectWithCookie();

    const error = await new Promise<Error>((resolve, reject) => {
      client.on('connect_error', resolve);
      client.on('connect', () => reject(new Error('unauthenticated client was allowed to connect')));
    });

    expect(error.message).toBe('Unauthorized');
    expect(client.connected).toBe(false);
    client.close();
  });

  it('rejects a connection presenting a forged access token', async () => {
    const client = connectWithCookie('accessToken=not-a-real-jwt');

    const error = await new Promise<Error>((resolve, reject) => {
      client.on('connect_error', resolve);
      client.on('connect', () => reject(new Error('forged token was allowed to connect')));
    });

    expect(error.message).toBe('Unauthorized');
    client.close();
  });

  it('never delivers another user\'s updates to an authenticated client', async () => {
    const ownUserId = '507f1f77bcf86cd799439022';
    const victimUserId = '507f1f77bcf86cd799439033';
    const { token } = signAccessToken(ownUserId, 'patient');
    const client = connectWithCookie(`accessToken=${token}`);
    await new Promise<void>((resolve) => client.on('connect', resolve));

    let received = false;
    client.on('appointment:updated', () => { received = true; });

    // An attacker's old lever was `emit('join', victimUserId)`; the server no longer
    // honours any client-supplied room, so this must have no effect.
    client.emit('join', victimUserId);
    await new Promise((resolve) => setTimeout(resolve, 50));
    emitAppointmentUpdate(victimUserId, { _id: 'appt-2', status: 'confirmed' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toBe(false);
    client.close();
  });
});
