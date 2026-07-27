import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

export function getSocket(userId: string): Socket {
  if (!socket) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
    socket = io(base.replace(/\/api$/, ''));
    socket.on('connect', () => socket?.emit('join', userId));
  }
  return socket;
}
