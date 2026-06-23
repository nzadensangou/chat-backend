import { io } from 'socket.io-client';
import { logger } from '../logger.js';

let socket = null;

export const connectSocket = () => {
  const socketUrl = process.env.SOCKET_IO_URL || 'http://localhost:3001';
  
  socket = io(socketUrl, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    logger.info('Socket.IO connected');
  });

  socket.on('disconnect', () => {
    logger.warn('Socket.IO disconnected');
  });

  return socket;
};

export const getSocket = () => socket;