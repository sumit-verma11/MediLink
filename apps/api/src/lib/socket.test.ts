import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { initSocket, emitAppointmentUpdate } from './socket';

let httpServer: ReturnType<typeof createServer>;
let port: number;

beforeAll(async () => {
  httpServer = createServer();
  initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(() => {
  httpServer.close();
});

describe('socket.io appointment updates', () => {
  it('delivers an appointment update to a client that joined the right user room', async () => {
    const userId = 'user-123';
    const client: ClientSocket = ioClient(`http://localhost:${port}`);

    await new Promise<void>((resolve) => client.on('connect', resolve));
    client.emit('join', userId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const received = new Promise((resolve) => client.on('appointment:updated', resolve));
    emitAppointmentUpdate(userId, { _id: 'appt-1', status: 'confirmed' });

    const payload = await received;
    expect(payload).toEqual({ _id: 'appt-1', status: 'confirmed' });

    client.close();
  });

  it('does not deliver to a client in a different room', async () => {
    const client: ClientSocket = ioClient(`http://localhost:${port}`);
    await new Promise<void>((resolve) => client.on('connect', resolve));
    client.emit('join', 'some-other-user');
    await new Promise((resolve) => setTimeout(resolve, 50));

    let received = false;
    client.on('appointment:updated', () => { received = true; });

    emitAppointmentUpdate('user-not-in-any-connected-room', { _id: 'appt-2', status: 'confirmed' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toBe(false);
    client.close();
  });
});
