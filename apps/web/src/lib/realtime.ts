import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getRealtimeSocket(): Socket {
  if (!socket) {
    socket = io('/realtime', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
  }
  return socket;
}
