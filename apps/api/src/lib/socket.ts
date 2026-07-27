import { Server as HTTPServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | undefined;

export function initSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true },
  });

  io.on('connection', (socket) => {
    socket.on('join', (userId: string) => {
      socket.join(userId);
    });
  });

  return io;
}

export function emitAppointmentUpdate(userId: string, appointment: unknown): void {
  io?.to(userId).emit('appointment:updated', appointment);
}
