import dotenv from 'dotenv';

// MUST be first before any other imports!
dotenv.config();

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './lib/logger.js';
import fcmService from './lib/services/fcm.service.js';
import { UserService } from './lib/services/user.service.js';
import socketManager from './lib/socket-instance.js';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ✅ Register Socket.IO instance for use in endpoints and services
socketManager.setIO(io);

// Middleware
app.use(express.json());

// Connection Pool pour tracker les utilisateurs online
const onlineUsers = new Map(); // { userId: socket }

// Buffer pour stocker les ICE candidates en attente (si destinataire offline)
const candidateBuffer = new Map();
const CANDIDATE_BUFFER_TIMEOUT = 60000; // ✅ FIX 5: 60 secondes expiration (augmenté de 15s pour slower networks)

// Tracker l'état des appels
// Format: { 'caller-callee': {caller, callee, state: 'ringing'|'connected'|'ended'|'rejected', timestamp} }
const callStates = new Map();
const CALL_STATE_TIMEOUT = 300000; // 5 minutes expiration pour appels terminés

// Rate limiting pour ICE candidates
// Format: { userId: {count: number, lastReset: timestamp} }
const candidateRateLimits = new Map();
const CANDIDATE_RATE_LIMIT_MAX = 100; // Max candidates par période
const CANDIDATE_RATE_LIMIT_WINDOW = 10000; // Fenêtre de 10 secondes

// ========================
// UTILITY FUNCTIONS
// ========================

/**
 * Retourne la configuration des serveurs STUN/TURN pour WebRTC
 * Ces serveurs permettent aux clients de trouver leur adresse IP publique
 * et de relayer le trafic si la connexion P2P directe n'est pas possible
 */
function getIceServers() {
  return {
    iceServers: [
      // STUN Servers (gratuits, resolvent l'adresse publique)
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] },
      { urls: ['stun:stun2.l.google.com:19302'] },
      { urls: ['stun:stun3.l.google.com:19302'] },
      { urls: ['stun:stun4.l.google.com:19302'] },
      
      // TURN Servers (optionnel pour production - relais du trafic)
      // Décommenter et configurer avec vos paramètres:
      // {
      //   urls: ['turn:your-turn-server.com:3478?transport=udp', 'turn:your-turn-server.com:3478?transport=tcp'],
      //   username: process.env.TURN_USERNAME || 'user',
      //   credential: process.env.TURN_PASSWORD || 'pass',
      // },
    ],
  };
}

// ========================
// SOCKET EVENTS
// ========================

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected');

  // User joins (après authentication)
  socket.on('user:join', (data) => {
    const { userId, userName, fcmToken } = data;
    
    // ✅ Validate userId is not empty
    if (!userId || userId === 'anonymous') {
      logger.warn({ socketId: socket.id, userId }, 'User joined with invalid/anonymous ID');
    }
    
    onlineUsers.set(userId, socket.id);
    socket.userId = userId;

    logger.info({ userId, socketId: socket.id, userName }, 'User joined');

    // Save FCM token for push notifications
    if (fcmToken) {
      UserService.updateFCMToken(userId, fcmToken).catch((error) => {
        logger.error({ userId, error: error.message }, 'Failed to update FCM token');
      });
    }

    // Envoyer la configuration STUN/TURN pour WebRTC
    const iceConfig = getIceServers();
    socket.emit('ice:servers', iceConfig);
    logger.debug({ userId, serverCount: iceConfig.iceServers.length }, 'ICE servers configuration sent');

    // Envoyer les ICE candidates en attente (bufferisés)
    if (candidateBuffer.has(userId)) {
      const pendingCandidates = candidateBuffer.get(userId);
      logger.info({ userId, count: pendingCandidates.length }, 'Flushing buffered ICE candidates');
      
      pendingCandidates.forEach(({ candidate, from }) => {
        socket.emit('ice:candidate', {
          candidate,
          from,
        });
      });
      
      candidateBuffer.delete(userId);
    }

    // Notifier tout le monde que cet user est online
    io.emit('user:online', { userId, userName, timestamp: new Date() });
  });

  // Rejoindre la room d'une conversation (pour recevoir message:new)
  socket.on('conversation:join', (data) => {
    const { conversationId } = data;
    if (!conversationId) {
      logger.warn({ socketId: socket.id }, 'conversation:join sans conversationId');
      return;
    }
    socket.join(`conversation:${conversationId}`);
    logger.debug({ userId: socket.userId, conversationId }, 'Socket joined conversation room');
  });

  // Quitter la room d'une conversation
  socket.on('conversation:leave', (data) => {
    const { conversationId } = data;
    if (!conversationId) {
      logger.warn({ socketId: socket.id }, 'conversation:leave sans conversationId');
      return;
    }
    socket.leave(`conversation:${conversationId}`);
    logger.debug({ userId: socket.userId, conversationId }, 'Socket left conversation room');
  });

  // Message envoyé
  socket.on('message:send', (data) => {
    const { conversationId, recipientId, message } = data;

    // Envoyer le message au destinataire s'il est online
    const recipientSocketId = onlineUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message:receive', {
        conversationId,
        senderId: socket.userId,
        message,
        timestamp: new Date(),
      });
      logger.debug({ recipientId, conversationId }, 'Message delivered in real-time');
    } else {
      logger.debug({ recipientId }, 'User offline, will get message when reconnects');
    }
  });

  // Typing indicator
  socket.on('typing:start', (data) => {
    const { conversationId, recipientId } = data;
    const recipientSocketId = onlineUsers.get(recipientId);
    
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('typing:active', {
        conversationId,
        userId: socket.userId,
        isTyping: true,
      });
    }
  });

  socket.on('typing:stop', (data) => {
    const { conversationId, recipientId } = data;
    const recipientSocketId = onlineUsers.get(recipientId);
    
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('typing:active', {
        conversationId,
        userId: socket.userId,
        isTyping: false,
      });
    }
  });

  // Appel entrant
  socket.on('call:initiate', (data) => {
    const { callerId, calleeId, callType } = data;
    const calleeSocketId = onlineUsers.get(calleeId);

    // Créer l'état de l'appel
    const callStateKey = `${callerId}-${calleeId}`;
    callStates.set(callStateKey, {
      caller: callerId,
      callee: calleeId,
      state: 'ringing',
      timestamp: Date.now(),
    });
    logger.debug({ callStateKey, state: 'ringing' }, 'Call state created');

    if (calleeSocketId) {
      io.to(calleeSocketId).emit('call:incoming', {
        callerId,
        callerName: data.callerName,
        callType,
        timestamp: new Date(),
      });
      logger.info({ callerId, calleeId }, 'Incoming call sent');
    } else {
      // ========== ✅ FIX 4: NOTIFIER LE CALLER SI OFFLINE ==========
      logger.info({ calleeId }, 'Callee offline - sending error to caller');
      
      // Envoyer une erreur au caller pour qu'il sache que l'appel est impossible
      socket.emit('error', {
        code: 'CALLEE_OFFLINE',
        message: `${data.callerName || 'User'} is currently offline`,
        calleeId,
      });
      
      // ========== FCM NOTIFICATION ==========
      // Envoyer une notification push au callee en arrière-plan via FCM
      (async () => {
        try {
          const callee = await UserService.getUserById(calleeId);
          if (callee && callee.fcm_token) {
            const result = await fcmService.sendCallNotification(callee.fcm_token, {
              callerId,
              callerName: data.callerName || 'Unknown',
              callType: callType || 'audio',
            });
            if (!result.success) {
              logger.warn({ calleeId, error: result.error }, 'FCM notification failed');
            }
          } else {
            logger.debug({ calleeId }, 'Callee has no FCM token stored');
          }
        } catch (error) {
          logger.error({ calleeId, error: error.message }, 'Error sending FCM notification');
        }
      })();
    }
  });

  // Relayer l'offre SDP du caller au callee
  socket.on('call:offer', (data) => {
    const { offer, to } = data;
    const recipientSocketId = onlineUsers.get(to);

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('call:offer', {
        offer,
        from: socket.userId,
      });
      logger.info({ from: socket.userId, to }, 'SDP Offer relayed');
    } else {
      logger.warn({ to }, 'Recipient not online for offer');
      socket.emit('error', { message: 'Recipient offline' });
    }
  });

  // Relayer la réponse SDP du callee au caller
  socket.on('call:answer', (data) => {
    const { answer, to } = data;

    // ✅ FIX 1: Vérifier que le call state est 'ringing' avant d'accepter l'answer
    const callStateKey = `${to}-${socket.userId}`;
    const callState = callStates.get(callStateKey);

    if (!callState || callState.state !== 'ringing') {
      logger.warn(
        { to, userId: socket.userId, currentState: callState?.state },
        'Answer received in wrong call state - rejecting'
      );
      socket.emit('error', {
        message: 'Call is not in ringing state',
        code: 'INVALID_CALL_STATE',
      });
      return; // ← Rejeter l'answer
    }

    const recipientSocketId = onlineUsers.get(to);

    // Mettre à jour l'état de l'appel à 'connected'
    callState.state = 'connected';
    logger.debug({ callStateKey, state: 'connected' }, 'Call state updated to connected');

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('call:answer', {
        answer,
        from: socket.userId,
      });
      logger.info({ from: socket.userId, to }, 'SDP Answer relayed');
    } else {
      logger.warn({ to }, 'Recipient not online for answer');
      socket.emit('error', { message: 'Recipient offline' });
    }
  });

  // Relayer les ICE candidates pour établir la connexion P2P
  socket.on('ice:candidate', (data) => {
    const { candidate, to } = data;
    const userId = socket.userId;
    
    // ========== ✅ FIX 3: VALIDER LE FORMAT DU RTCIceCandidate ==========
    // Un RTCIceCandidate valide doit avoir:
    // - candidate: string (la donnée du candidate)
    // - sdpMLineIndex: number ou null (l'index de la ligne m dans le SDP)
    // - sdpMid: string ou null (l'identifiant de la ligne m)
    
    if (!candidate || typeof candidate !== 'object') {
      logger.warn({ candidate }, 'ICE candidate: invalid format - not an object');
      socket.emit('error', {
        message: 'Invalid ICE candidate format - must be an object',
        code: 'INVALID_CANDIDATE_FORMAT',
      });
      return; // ← Rejeter
    }
    
    // Vérifier le champ 'candidate' (string, peut être une ligne vide à la fin)
    if (typeof candidate.candidate !== 'string') {
      logger.warn({ candidate }, 'ICE candidate: invalid format - candidate field missing or not string');
      socket.emit('error', {
        message: 'Invalid ICE candidate format - candidate field must be string',
        code: 'INVALID_CANDIDATE_FORMAT',
      });
      return; // ← Rejeter
    }
    
    // Vérifier sdpMLineIndex (peut être null ou number)
    if (candidate.sdpMLineIndex !== null && candidate.sdpMLineIndex !== undefined && typeof candidate.sdpMLineIndex !== 'number') {
      logger.warn({ candidate }, 'ICE candidate: invalid format - sdpMLineIndex must be number or null');
      socket.emit('error', {
        message: 'Invalid ICE candidate format - sdpMLineIndex must be number or null',
        code: 'INVALID_CANDIDATE_FORMAT',
      });
      return; // ← Rejeter
    }
    
    // Vérifier sdpMid (peut être null ou string)
    if (candidate.sdpMid !== null && candidate.sdpMid !== undefined && typeof candidate.sdpMid !== 'string') {
      logger.warn({ candidate }, 'ICE candidate: invalid format - sdpMid must be string or null');
      socket.emit('error', {
        message: 'Invalid ICE candidate format - sdpMid must be string or null',
        code: 'INVALID_CANDIDATE_FORMAT',
      });
      return; // ← Rejeter
    }
    
    logger.debug({ candidateLength: candidate.candidate.length }, 'ICE candidate format validated');
    
    // ========== RATE LIMITING CHECK ==========
    const now = Date.now();
    if (!candidateRateLimits.has(userId)) {
      candidateRateLimits.set(userId, {
        count: 0,
        lastReset: now,
      });
    }
    
    const rateLimitData = candidateRateLimits.get(userId);
    
    // Réinitialiser le compteur si la fenêtre est expirée
    if (now - rateLimitData.lastReset > CANDIDATE_RATE_LIMIT_WINDOW) {
      rateLimitData.count = 0;
      rateLimitData.lastReset = now;
    }
    
    // Incrémenter le compteur
    rateLimitData.count++;
    
    // Vérifier le dépassement du limite
    if (rateLimitData.count > CANDIDATE_RATE_LIMIT_MAX) {
      logger.warn(
        { userId, count: rateLimitData.count, max: CANDIDATE_RATE_LIMIT_MAX },
        'ICE candidate rate limit exceeded'
      );
      socket.emit('error', {
        message: 'Too many ICE candidates - rate limit exceeded',
        retryAfter: CANDIDATE_RATE_LIMIT_WINDOW,
      });
      return; // Rejeter le candidate
    }
    
    // ========== ✅ FIX 7: VÉRIFIER LES PERMISSIONS ==========
    // S'assurer que l'utilisateur participe vraiment à cet appel
    // (pas un attaquant qui envoie des candidates pour un appel quelconque)
    const callStateKey1 = `${userId}-${to}`;
    const callStateKey2 = `${to}-${userId}`;
    
    const callStateForward = callStates.get(callStateKey1);
    const callStateReverse = callStates.get(callStateKey2);
    
    // Il faut que l'un des deux états existe
    if (!callStateForward && !callStateReverse) {
      logger.warn(
        { userId, to },
        'User not participant in any call - rejecting ICE candidate'
      );
      socket.emit('error', {
        message: 'You are not part of this call',
        code: 'NOT_CALL_PARTICIPANT',
      });
      return; // ← Rejeter le candidate
    }
    
    // Utiliser le call state qui existe (peu importe la direction)
    let callState = callStateForward || callStateReverse;
    let callStateKey = callStateForward ? callStateKey1 : callStateKey2;
    
    // ========== ✅ FIX 2: VÉRIFICATION D'ÉTAT (MAINTENANT ACTIVÉ) ==========
    // Vérifier que le call est vraiment connecté avant d'accepter les ICE candidates
    
    if (!callState || callState.state !== 'connected') {
      logger.warn(
        { from: userId, to, state: callState?.state },
        'ICE candidate rejected: call not connected'
      );
      socket.emit('error', {
        message: 'Call not connected',
        code: 'CALL_NOT_CONNECTED',
      });
      return; // ← Rejeter le candidate
    }

    const recipientSocketId = onlineUsers.get(to);

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('ice:candidate', {
        candidate,
        from: userId,
      });
      logger.debug({ from: userId, to }, 'ICE candidate relayed');
    } else {
      // Bufferer le candidate si destinataire offline
      if (!candidateBuffer.has(to)) {
        candidateBuffer.set(to, []);
      }
      
      const candidateData = {
        candidate,
        from: userId,
        timestamp: Date.now(),
      };
      
      const candidates = candidateBuffer.get(to);
      candidates.push(candidateData);
      
      logger.debug({ from: userId, to, bufferSize: candidates.length }, 'ICE candidate buffered (recipient offline)');
      
      // Auto-expirer après timeout
      setTimeout(() => {
        const buff = candidateBuffer.get(to);
        if (buff) {
          const idx = buff.indexOf(candidateData);
          if (idx !== -1) {
            buff.splice(idx, 1);
            logger.debug({ to }, 'Buffered ICE candidate expired');
          }
        }
      }, CANDIDATE_BUFFER_TIMEOUT);
    }
  });

  // Rejeter appel
  socket.on('call:reject', (data) => {
    const { callerId } = data;
    const callerSocketId = onlineUsers.get(callerId);

    // Mettre à jour l'état à 'rejected'
    const callStateKey = `${callerId}-${socket.userId}`;
    if (callStates.has(callStateKey)) {
      const callState = callStates.get(callStateKey);
      callState.state = 'rejected';
      logger.debug({ callStateKey, state: 'rejected' }, 'Call state updated to rejected');
      
      // ========== ✅ FIX 6a: AUTO-CLEANUP APRÈS 5 MINUTES ==========
      // Nettoyer automatiquement après 5 minutes pour éviter les memory leaks
      const CALL_STATE_CLEANUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes
      
      setTimeout(() => {
        if (callStates.has(callStateKey)) {
          const state = callStates.get(callStateKey);
          // Ne supprimer que si l'état n'a pas changé
          if (state.state === 'rejected') {
            callStates.delete(callStateKey);
            logger.debug({ callStateKey }, 'Call state cleaned up after rejection timeout');
          }
        }
      }, CALL_STATE_CLEANUP_TIMEOUT);
    }

    if (callerSocketId) {
      io.to(callerSocketId).emit('call:rejected', {
        rejectorId: socket.userId,
      });
      logger.info({ callerId }, 'Call rejected');
    }
  });

  // Terminer appel
  socket.on('call:end', (data) => {
    const { participantIds } = data;
    
    // ========== ✅ FIX 6b: AUTO-CLEANUP APRÈS 5 MINUTES ==========
    const CALL_STATE_CLEANUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    // Mettre à jour l'état de l'appel à 'ended'
    participantIds.forEach((participantId) => {
      const callStateKey = `${socket.userId}-${participantId}`;
      if (callStates.has(callStateKey)) {
        const callState = callStates.get(callStateKey);
        callState.state = 'ended';
        logger.debug({ callStateKey, state: 'ended' }, 'Call state updated to ended');
        
        // Nettoyer automatiquement après 5 minutes
        setTimeout(() => {
          if (callStates.has(callStateKey)) {
            const state = callStates.get(callStateKey);
            // Ne supprimer que si l'état n'a pas changé
            if (state.state === 'ended') {
              callStates.delete(callStateKey);
              logger.debug({ callStateKey }, 'Call state cleaned up after end timeout');
            }
          }
        }, CALL_STATE_CLEANUP_TIMEOUT);
      }
    });
    
    participantIds.forEach((participantId) => {
      const participantSocketId = onlineUsers.get(participantId);
      if (participantSocketId && participantSocketId !== socket.id) {
        io.to(participantSocketId).emit('call:ended', {
          enderId: socket.userId,
        });
      }
    });
    logger.info({ participantIds }, 'Call ended');
  });

  // Marquer message comme lu
  socket.on('message:read', (data) => {
    const { conversationId, senderId } = data;
    const senderSocketId = onlineUsers.get(senderId);

    if (senderSocketId) {
      io.to(senderSocketId).emit('message:marked-read', {
        conversationId,
        readById: socket.userId,
      });
    }
  });

  // ========================
  // STATUS EVENTS
  // ========================

  // Status created - relay to all users
  socket.on('status:created', (data) => {
    try {
      logger.info({ statusId: data.id, userId: socket.userId }, 'Status created received');
      io.emit('status:created', {
        ...data,
        broadcastedAt: new Date(),
      });
      logger.debug({ statusId: data.id }, 'Status broadcast to all users');
    } catch (error) {
      logger.error({ error: error.message, statusId: data?.id }, 'Error broadcasting status:created');
    }
  });

  // Status deleted - relay to all users
  socket.on('status:deleted', (data) => {
    try {
      logger.info({ statusId: data.statusId, userId: socket.userId }, 'Status deleted received');
      io.emit('status:deleted', {
        statusId: data.statusId,
        deletedBy: socket.userId,
        deletedAt: new Date(),
      });
      logger.debug({ statusId: data.statusId }, 'Status deletion broadcast to all users');
    } catch (error) {
      logger.error({ error: error.message, statusId: data?.statusId }, 'Error broadcasting status:deleted');
    }
  });

  // Status viewed - relay to all users
  socket.on('status:viewed', (data) => {
    try {
      logger.info({ statusId: data.statusId, viewerId: data.viewerId }, 'Status viewed received');
      io.emit('status:viewed', {
        statusId: data.statusId,
        viewerId: data.viewerId,
        viewedAt: new Date(),
      });
      logger.debug({ statusId: data.statusId }, 'Status view event broadcast to all users');
    } catch (error) {
      logger.error({ error: error.message, statusId: data?.statusId }, 'Error broadcasting status:viewed');
    }
  });

  // ========================
  // REACTION EVENTS
  // ========================

  // Reaction added - relay to all users
  socket.on('reaction:added', (data) => {
    try {
      logger.info({ statusId: data.statusId, emoji: data.reaction, userId: socket.userId }, 'Reaction added received');
      io.emit('reaction:added', {
        ...data,
        addedAt: new Date(),
      });
      logger.debug({ statusId: data.statusId }, 'Reaction broadcast to all users');
    } catch (error) {
      logger.error({ error: error.message, statusId: data?.statusId }, 'Error broadcasting reaction:added');
    }
  });

  // Reaction removed - relay to all users
  socket.on('reaction:removed', (data) => {
    try {
      logger.info({ statusId: data.statusId, emoji: data.emoji, userId: socket.userId }, 'Reaction removed received');
      io.emit('reaction:removed', {
        statusId: data.statusId,
        userId: data.userId,
        emoji: data.emoji,
        removedAt: new Date(),
      });
      logger.debug({ statusId: data.statusId }, 'Reaction removal broadcast to all users');
    } catch (error) {
      logger.error({ error: error.message, statusId: data?.statusId }, 'Error broadcasting reaction:removed');
    }
  });

  // ========================
  // REPLY EVENTS
  // ========================

  // Reply added - relay to all users
  socket.on('reply:added', (data) => {
    try {
      logger.info({ statusId: data.statusId, replyId: data.id, userId: socket.userId }, 'Reply added received');
      io.emit('reply:added', {
        ...data,
        addedAt: new Date(),
      });
      logger.debug({ statusId: data.statusId }, 'Reply broadcast to all users');
    } catch (error) {
      logger.error({ error: error.message, statusId: data?.statusId }, 'Error broadcasting reply:added');
    }
  });

  // Reply deleted - relay to all users
  socket.on('reply:deleted', (data) => {
    try {
      logger.info({ statusId: data.statusId, replyId: data.replyId, userId: socket.userId }, 'Reply deleted received');
      io.emit('reply:deleted', {
        replyId: data.replyId,
        statusId: data.statusId,
        deletedBy: socket.userId,
        deletedAt: new Date(),
      });
      logger.debug({ replyId: data.replyId }, 'Reply deletion broadcast to all users');
    } catch (error) {
      logger.error({ error: error.message, replyId: data?.replyId }, 'Error broadcasting reply:deleted');
    }
  });

  // Disconnection
  socket.on('disconnect', () => {
    const userId = socket.userId;
    onlineUsers.delete(userId);
    
    // Nettoyer les candidates bufferisés pour cet utilisateur
    if (candidateBuffer.has(userId)) {
      candidateBuffer.delete(userId);
      logger.debug({ userId }, 'Cleared buffered ICE candidates for disconnected user');
    }
    
    // Nettoyer les états d'appel associés à cet utilisateur
    const callKeysToDelete = [];
    callStates.forEach((callState, callStateKey) => {
      if (callState.caller === userId || callState.callee === userId) {
        callKeysToDelete.push(callStateKey);
      }
    });
    callKeysToDelete.forEach((key) => {
      callStates.delete(key);
      logger.debug({ key }, 'Cleared call state for disconnected user');
    });
    
    // Nettoyer les rate limits
    if (candidateRateLimits.has(userId)) {
      candidateRateLimits.delete(userId);
      logger.debug({ userId }, 'Cleared rate limit for disconnected user');
    }
    
    logger.info({ userId, socketId: socket.id }, 'User disconnected');
    io.emit('user:offline', { userId, timestamp: new Date() });
  });

  // Erreur
  socket.on('error', (error) => {
    logger.error({ error }, 'Socket error');
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    onlineUsers: onlineUsers.size,
    connectedClients: io.engine.clientsCount,
  });
});

// Initialize Firebase Cloud Messaging (FCM) for push notifications
(async () => {
  try {
    // Load Firebase service account key from environment variable
    // Set FIREBASE_SERVICE_ACCOUNT_KEY env var with JSON string
    const firebaseKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : null;

    if (firebaseKey) {
      await fcmService.initialize(firebaseKey);
    } else {
      logger.warn('Firebase service account key not configured - FCM notifications disabled');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'FCM initialization error');
  }
})();

// Start server
const PORT = process.env.SOCKET_IO_PORT || 3001;
server.listen(PORT, () => {
  logger.info({ port: PORT }, 'Socket.IO server started');
});