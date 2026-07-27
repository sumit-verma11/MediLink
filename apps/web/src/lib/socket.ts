import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

export function getSocket(): Socket {
  if (!socket) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
    // withCredentials sends the httpOnly accessToken cookie with the handshake; the API
    // verifies that JWT and puts this socket in its own user room. The client never picks
    // its own room, so there is nothing to pass in here.
    socket = io(base.replace(/\/api$/, ''), { withCredentials: true });
  }
  return socket;
}
