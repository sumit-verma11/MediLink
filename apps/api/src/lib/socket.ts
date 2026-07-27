import { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import * as cookie from 'cookie';
import { verifyAccessToken } from '../modules/auth/jwt';

let io: SocketIOServer | undefined;

export function initSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    // credentials: true is required for the browser to send its httpOnly auth cookie
    // along with the WebSocket handshake — the handshake middleware below depends on it.
    cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true },
  });

  // Room membership is derived server-side from the same JWT the REST API trusts.
  // Previously the client chose its own room via a `join` event, so any connected client
  // could join any user's room and receive that user's appointment data (PHI exposure).
  io.use((socket, next) => {
    try {
      const header = socket.handshake.headers.cookie;
      if (!header) {
        next(new Error('Unauthorized'));
        return;
      }
      const token = cookie.parse(header).accessToken;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(socket.data.userId as string);
  });

  return io;
}

export function emitAppointmentUpdate(userId: string, appointment: unknown): void {
  io?.to(userId).emit('appointment:updated', appointment);
}
