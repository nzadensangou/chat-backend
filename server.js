import dotenv from 'dotenv';

// MUST be first before any other imports!
dotenv.config();

import next from 'next';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './lib/logger.js';
import fcmService from './lib/services/fcm.service.js';
import { UserService } from './lib/services/user.service.js';
import socketManager from './lib/socket-instance.js';

// ========================
// NEXT.JS APP SETUP
// ========================
// On initialise Next.js en mode programmatique pour pouvoir
// le combiner avec le même serveur HTTP que Socket.IO
const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const PORT = process.env.PORT || 3000;

// ========================
// HTTP + SOCKET.IO SETUP
// ========================
// Un seul serveur HTTP : Next.js gère TOUTES les routes (pages + /api/...)
// Socket.IO est attaché à ce même serveur pour le temps réel
const server = http.createServer((req, res) => {
  handle(req, res);
});

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ✅ Register Socket.IO instance for use in endpoints and services
socketManager.setIO(io);

// Connection Pool pour tracker les utilisateurs online
const onlineUsers = new Map(); // { userId: socket }

// Buffer pour stocker les ICE candidates en attente (si destinataire offline)
const candidateBuffer = new Map();
const CANDIDATE_BUFFER_TIMEOUT = 60000; // ✅ FIX 5: 60 secondes expiration (augmenté de 15s pour slower networks)

// Tracker l'état des appels
// Format: { 'caller-callee': {caller, callee, state: 'ringing'|'connected'|'ended'|'rejected', timestamp} }
const callStates = new Map();
const CALL_STATE_TIMEOUT = 300000; // 5 minutes expiration pour appels terminés

// ✅ Rooms de réunion WebRTC en direct.
// Différent de la table `participant` en base (qui ne dit que "a un jour
// répondu à /api/calls/:id/answer" — une info d'historique/permission) :
// ceci ne suit QUE qui a physiquement le flux audio/vidéo ouvert MAINTENANT
// (MeetingRoomScreen monté côté Flutter). C'est cette room-ci qui sert de
// base au signaling WebRTC en mesh (une connexion P2P directe par paire de
// participants présents), pas la state machine 'ringing/connected' des
// callStates ci-dessus, pensée pour un appel 1-à-1 qui "sonne".
// Format: meetingRoomId (string) -> Set<userId>
const meetingRooms = new Map();

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
// ✅ TURN via Twilio Network Traversal Service.
// Les identifiants TURN générés par Twilio expirent (~24h par défaut côté
// Twilio) ; on les met en cache en mémoire et on ne refait un appel API
// que lorsqu'ils sont périmés, pour éviter de solliciter Twilio à chaque
// connexion socket (potentiellement des milliers par jour).
let cachedIceServers = null;
let cachedIceServersExpiry = 0;

const STATIC_STUN_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun2.l.google.com:19302'] },
  { urls: ['stun:stun3.l.google.com:19302'] },
  { urls: ['stun:stun4.l.google.com:19302'] },
];

async function fetchTwilioIceServers() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    logger.warn(
      'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN absents - serveurs TURN désactivés, STUN seul utilisé'
    );
    return null;
  }

  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio Tokens API a répondu ${response.status}`);
  }

  const data = await response.json();
  // data.ice_servers contient déjà les entrées stun: ET turn: fournies par Twilio
  // data.ttl est en secondes (généralement 86400 = 24h)

  // ✅ DIAGNOSTIC : le "username" de chaque entrée turn: contient en réalité
  // un timestamp Unix d'expiration, au format "1751600000:ACxxxxxxxx".
  // On le décode ici pour logger l'heure d'expiration RÉELLE du jeton,
  // ce qui permet de vérifier a posteriori si un échec ICE coïncidait avec
  // un jeton expiré ou presque expiré (par ex. serveur resté up trop
  // longtemps sans jamais rafraîchir _cachedIceServers).
  const turnEntry = (data.ice_servers || []).find((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === 'string' && u.startsWith('turn:'));
  });

  if (turnEntry?.username) {
    const expiryUnixSeconds = Number(turnEntry.username.split(':')[0]);
    if (!Number.isNaN(expiryUnixSeconds)) {
      const expiresAt = new Date(expiryUnixSeconds * 1000);
      const secondsUntilExpiry = expiryUnixSeconds - Math.floor(Date.now() / 1000);
      logger.info(
        {
          turnUsername: turnEntry.username,
          expiresAt: expiresAt.toISOString(),
          secondsUntilExpiry,
        },
        'Twilio TURN token decoded expiry'
      );
    }
  }

  return {
    iceServers: data.ice_servers,
    ttlSeconds: Number(data.ttl) || 3600,
  };
}

async function getIceServers() {
  const now = Date.now();

  if (cachedIceServers && now < cachedIceServersExpiry) {
    return cachedIceServers;
  }

  try {
    const twilioResult = await fetchTwilioIceServers();

    if (twilioResult) {
      cachedIceServers = { iceServers: twilioResult.iceServers };
      // On rafraîchit un peu avant l'expiration réelle (marge de 10%)
      cachedIceServersExpiry = now + twilioResult.ttlSeconds * 1000 * 0.9;
      logger.info(
        { serverCount: twilioResult.iceServers.length, ttlSeconds: twilioResult.ttlSeconds },
        'Twilio TURN/STUN servers refreshed'
      );
      return cachedIceServers;
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Échec récupération TURN Twilio - fallback STUN seul');
  }

  // Fallback : STUN public seul si Twilio n'est pas configuré ou indisponible.
  // Les appels marcheront toujours sur la plupart des réseaux, mais
  // échoueront derrière un NAT symétrique tant que ce fallback est actif.
  return { iceServers: STATIC_STUN_SERVERS };
}

// ✅ FIX : rafraîchissement proactif + diffusion aux sockets déjà connectés.
// Avant ce correctif, un client recevait `ice:servers` UNE SEULE FOIS, au
// moment de `user:join`. Si son socket restait ouvert plus longtemps que la
// durée de vie du jeton Twilio (typiquement ~24h), il continuait à utiliser
// un jeton TURN expiré sans jamais le savoir jusqu'à sa prochaine
// reconnexion — c'est ça, un jeton "mal renouvelé" côté client.
// On vérifie donc toutes les 30 minutes si le cache doit être renouvelé,
// et si c'est le cas, on repousse la nouvelle config à TOUT LE MONDE.
const ICE_REFRESH_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes

setInterval(async () => {
  const now = Date.now();
  // On ne fait rien si le cache est encore valide (évite un appel Twilio
  // inutile toutes les 30 minutes).
  if (cachedIceServers && now < cachedIceServersExpiry) {
    return;
  }

  try {
    const iceConfig = await getIceServers();
    let notified = 0;
    onlineUsers.forEach((socketId) => {
      io.to(socketId).emit('ice:servers', iceConfig);
      notified += 1;
    });
    logger.info(
      { notified, serverCount: iceConfig.iceServers.length },
      'ICE servers proactively refreshed and pushed to connected clients'
    );
  } catch (error) {
    logger.error({ error: error.message }, 'Proactive ICE servers refresh failed');
  }
}, ICE_REFRESH_CHECK_INTERVAL);

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

    // ✅ FIX présence : io.emit('user:online', ...) plus bas ne diffuse
    // QUE vers les sockets déjà connectés au moment de l'émission. Un
    // client qui se connecte APRÈS que d'autres utilisateurs soient déjà
    // en ligne ne recevra donc jamais leur 'user:online' passé — il ne
    // saura jamais qu'ils sont déjà connectés. On envoie donc un instantané
    // de tous les utilisateurs actuellement en ligne, réservé à CE client.
    socket.emit('users:online-list', Array.from(onlineUsers.keys()));

    // ✅ FIX: Room personnelle par utilisateur (`user:${userId}`), rejointe
    // tant que le socket est connecté — indépendamment de l'écran affiché.
    // Permet d'émettre message:new vers le destinataire même s'il n'a PAS
    // ChatScreen ouvert sur cette conversation précise (ex: il est sur la
    // liste des conversations, ou sur un tout autre écran de l'app).
    socket.join(`user:${userId}`);

    logger.info({ userId, socketId: socket.id, userName }, 'User joined');

    // Save FCM token for push notifications
    if (fcmToken) {
      UserService.updateFCMToken(userId, fcmToken).catch((error) => {
        logger.error({ userId, error: error.message }, 'Failed to update FCM token');
      });
    }

    // Envoyer la configuration STUN/TURN pour WebRTC
    getIceServers()
      .then((iceConfig) => {
        socket.emit('ice:servers', iceConfig);
        logger.debug(
          { userId, serverCount: iceConfig.iceServers.length },
          'ICE servers configuration sent'
        );
      })
      .catch((error) => {
        logger.error({ userId, error: error.message }, 'Failed to send ICE servers config');
      });

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

  // ✅ Permet au client de pousser un nouveau token FCM en cours de session,
  // sans devoir se reconnecter (cas du onTokenRefresh de Firebase, qui peut
  // se déclencher à tout moment : réinstallation, restauration de backup...).
  // Sans cet event, un token rafraîchi côté client ne remontait jamais au
  // serveur, qui continuait à utiliser l'ancien token (donc à échouer
  // silencieusement sur les notifications push d'appel entrant).
  socket.on('fcm:token-update', (data) => {
    const { userId, fcmToken } = data;

    if (!userId || !fcmToken) {
      logger.warn({ socketId: socket.id }, 'fcm:token-update missing userId or fcmToken');
      return;
    }

    UserService.updateFCMToken(userId, fcmToken)
      .then(() => {
        logger.info({ userId }, 'FCM token refreshed via fcm:token-update');
      })
      .catch((error) => {
        logger.error({ userId, error: error.message }, 'Failed to update refreshed FCM token');
      });
  });

  // ✅ FIX: Rejoindre la room d'une conversation pour recevoir message:new
  // en temps réel. MessageService.createMessage() émet vers
  // `conversation:${conversationID}` — sans ce handler, ce room reste vide
  // et aucun client ne reçoit jamais les messages en temps réel.
  socket.on('conversation:join', (data, callback) => {
    const { conversationId } = data;
    if (!conversationId) {
      logger.warn({ socketId: socket.id }, 'conversation:join sans conversationId');
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Missing conversationId' });
      }
      return;
    }
    socket.join(`conversation:${conversationId}`);
    logger.debug(
      { userId: socket.userId, conversationId },
      'Socket joined conversation room'
    );
    if (typeof callback === 'function') {
      callback({ success: true, conversationId });
    }
  });

  // Quitter la room d'une conversation (à la fermeture de l'écran de chat)
  socket.on('conversation:leave', (data) => {
    const { conversationId } = data;
    if (!conversationId) return;
    socket.leave(`conversation:${conversationId}`);
    logger.debug(
      { userId: socket.userId, conversationId },
      'Socket left conversation room'
    );
  });

  // ========================
  // MEETING (WEBRTC MESH) EVENTS
  // ========================

  // ✅ Rejoindre la room WebRTC en direct d'une réunion.
  // C'est CE point d'entrée — et non /api/calls/:id/answer — qui déclenche
  // le vrai établissement WebRTC : /api/calls/:id/answer ne fait qu'écrire
  // en base qu'on a répondu (historique/permissions), sans jamais toucher
  // au signaling temps réel. Ici, on reçoit d'abord la liste des
  // participants déjà présents (meeting:room-state) — c'est à NOUS,
  // nouvel arrivant, d'envoyer une offre SDP à chacun d'eux (convention
  // mesh : le nouvel arrivant initie vers l'existant, jamais l'inverse,
  // pour éviter que deux pairs s'envoient une offre simultanément).
  socket.on('meeting:join', (data) => {
    const { meetingRoomId, userId } = data;
    if (!meetingRoomId || !userId) {
      logger.warn({ socketId: socket.id, data }, 'meeting:join sans meetingRoomId/userId');
      return;
    }

    if (!meetingRooms.has(meetingRoomId)) {
      meetingRooms.set(meetingRoomId, new Set());
    }
    const room = meetingRooms.get(meetingRoomId);

    // Snapshot AVANT d'ajouter le nouvel arrivant à la room, sinon il se
    // verrait lui-même dans sa propre liste de pairs à contacter.
    const existingPeers = Array.from(room);
    socket.emit('meeting:room-state', { meetingRoomId, peers: existingPeers });

    room.add(userId);
    socket.join(`meeting:${meetingRoomId}`);
    // Certains clients (ex: organisateur qui n'a jamais émis call:*
    // upfront) peuvent ne pas encore avoir socket.userId positionné ici.
    socket.userId = socket.userId || userId;

    // Prévenir les participants déjà présents : ils doivent s'attendre à
    // recevoir une offre SDP de ce nouvel arrivant sous peu.
    socket.to(`meeting:${meetingRoomId}`).emit('meeting:peer-joined', {
      meetingRoomId,
      userId,
    });

    logger.info(
      { meetingRoomId, userId, roomSize: room.size },
      'User joined meeting WebRTC room'
    );
  });

  // Quitter la room WebRTC d'une réunion (fermeture de MeetingRoomScreen)
  socket.on('meeting:leave', (data) => {
    const { meetingRoomId, userId } = data;
    if (!meetingRoomId || !userId) return;

    const room = meetingRooms.get(meetingRoomId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        meetingRooms.delete(meetingRoomId);
      }
    }
    socket.leave(`meeting:${meetingRoomId}`);
    socket.to(`meeting:${meetingRoomId}`).emit('meeting:peer-left', {
      meetingRoomId,
      userId,
    });

    logger.info({ meetingRoomId, userId }, 'User left meeting WebRTC room');
  });

  // Message envoyé
  socket.on('message:send', (data) => {
    const { conversationId, recipientId, message } = data;

    // Envoyer le message au destinataire s'il est online
    const recipientSocketId = onlineUsers.get(recipientId);
    if (recipientSocketId) {
      const normalizedMessage =
        typeof message === 'string'
          ? { content: message, type: 'text' }
          : (message || {});

      io.to(recipientSocketId).emit('message:new', {
        conversationId,
        senderId: socket.userId,
        content: normalizedMessage.content ?? normalizedMessage.text ?? '',
        type: normalizedMessage.type ?? 'text',
        mediaUrl: normalizedMessage.mediaUrl ?? null,
        messageId: normalizedMessage.messageId ?? normalizedMessage.id ?? Date.now(),
        timestamp: normalizedMessage.timestamp ?? new Date(),
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
    const { offer, to, meetingRoomId } = data;
    const recipientSocketId = onlineUsers.get(to);

    // ✅ Réunions (mesh) : pas de state machine 'ringing'/'connected' — un
    // appel 1-à-1 "sonne" puis se "connecte", mais une réunion à N
    // participants n'a pas cette notion (chaque paire négocie sa propre
    // connexion P2P indépendamment, dès que les deux ont rejoint la même
    // room). On vérifie donc juste que les DEUX côtés ont bien rejoint
    // `meetingRooms.get(meetingRoomId)`, plutôt que callStates (pensé pour les
    // appels 1-à-1 initiés via call:initiate).
    if (meetingRoomId) {
      const room = meetingRooms.get(meetingRoomId);
      if (!room || !room.has(socket.userId) || !room.has(to)) {
        logger.warn(
          { meetingRoomId, from: socket.userId, to },
          'SDP Offer rejected: not both participants in meeting room'
        );
        socket.emit('error', {
          code: 'NOT_IN_MEETING',
          message: 'Not both participants are in this meeting room',
        });
        return;
      }
    } else {
      const callStateKey = `${socket.userId}-${to}`;
      const callState = callStates.get(callStateKey);

      if (!callState || callState.state !== 'ringing') {
        logger.warn(
          { from: socket.userId, to, currentState: callState?.state },
          'SDP Offer received in invalid call state'
        );
        socket.emit('error', {
          code: 'INVALID_CALL_STATE',
          message: 'Cannot send SDP offer when call is not ringing',
        });
        return;
      }
    }

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('call:offer', {
        offer,
        from: socket.userId,
        meetingRoomId,
      });
      logger.info({ from: socket.userId, to, meetingRoomId }, 'SDP Offer relayed');
    } else {
      logger.warn({ to }, 'Recipient not online for offer');
      socket.emit('error', { message: 'Recipient offline' });
    }
  });

  // Relayer la réponse SDP du callee au caller
  socket.on('call:answer', (data) => {
    const { answer, to, meetingRoomId } = data;
    const recipientSocketId = onlineUsers.get(to);

    // ✅ Réunions (mesh) : même raisonnement que call:offer ci-dessus —
    // pas de transition 'ringing' -> 'connected' à faire, une réponse SDP
    // dans un mesh de réunion est juste acceptée dès lors que les deux
    // participants sont bien dans la même room.
    if (meetingRoomId) {
      const room = meetingRooms.get(meetingRoomId);
      if (!room || !room.has(socket.userId) || !room.has(to)) {
        logger.warn(
          { meetingRoomId, from: socket.userId, to },
          'SDP Answer rejected: not both participants in meeting room'
        );
        socket.emit('error', {
          code: 'NOT_IN_MEETING',
          message: 'Not both participants are in this meeting room',
        });
        return;
      }
    } else {
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

      // Mettre à jour l'état de l'appel à 'connected'
      callState.state = 'connected';
      logger.debug({ callStateKey, state: 'connected' }, 'Call state updated to connected');
    }

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('call:answer', {
        answer,
        from: socket.userId,
        meetingRoomId,
      });
      logger.info({ from: socket.userId, to, meetingRoomId }, 'SDP Answer relayed');
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
    // S'assurer que l'utilisateur participe vraiment à cet appel/réunion
    // (pas un attaquant qui envoie des candidates pour un échange quelconque)
    const { meetingRoomId } = data;

    if (meetingRoomId) {
      // ✅ Réunions (mesh) : l'autorisation se base sur la room WebRTC de
      // réunion (meetingRooms), pas sur callStates — un mesh n'a pas de
      // notion d'appel "qui sonne" entre deux userId précis.
      const room = meetingRooms.get(meetingRoomId);
      if (!room || !room.has(userId) || !room.has(to)) {
        logger.warn(
          { meetingRoomId, userId, to },
          'User not participant in meeting room - rejecting ICE candidate'
        );
        socket.emit('error', {
          message: 'You are not part of this meeting',
          code: 'NOT_CALL_PARTICIPANT',
        });
        return; // ← Rejeter le candidate
      }
    } else {
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

      // ========== ✅ FIX 2 (révisé): VÉRIFICATION D'ÉTAT ==========
      // En WebRTC "trickle ICE", les candidates arrivent au fur et à mesure,
      // dès l'offre SDP — donc AVANT que l'autre partie ait répondu (call:answer).
      // N'accepter que l'état 'connected' bloquait systématiquement tous les
      // premiers candidates envoyés pendant que l'appel sonne encore ('ringing'),
      // empêchant toute négociation WebRTC d'aboutir. On accepte donc les
      // candidates dès que l'appel est 'ringing' OU 'connected'.
      const ACCEPTED_STATES_FOR_ICE = ['ringing', 'connected'];

      if (!callState || !ACCEPTED_STATES_FOR_ICE.includes(callState.state)) {
        logger.warn(
          { from: userId, to, state: callState?.state },
          'ICE candidate rejected: call not ringing or connected'
        );
        socket.emit('error', {
          message: 'Call not active',
          code: 'CALL_NOT_ACTIVE',
        });
        return; // ← Rejeter le candidate
      }
    }

    const recipientSocketId = onlineUsers.get(to);

    if (recipientSocketId) {
      io.to(recipientSocketId).emit('ice:candidate', {
        candidate,
        from: userId,
        meetingRoomId,
      });
      logger.debug({ from: userId, to, meetingRoomId }, 'ICE candidate relayed');
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
    
    const CALL_STATE_CLEANUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    
    // Mettre à jour l'état de l'appel à 'ended'. L'ordre des IDs peut varier
    // selon qui termine l'appel (caller ou callee), donc on cherche les deux
    // directions possibles du call state.
    participantIds.forEach((participantId) => {
      const directKey = `${socket.userId}-${participantId}`;
      const reverseKey = `${participantId}-${socket.userId}`;
      const callStateKey = callStates.has(directKey)
        ? directKey
        : callStates.has(reverseKey)
            ? reverseKey
            : null;

      if (callStateKey) {
        const callState = callStates.get(callStateKey);
        callState.state = 'ended';
        logger.debug({ callStateKey, state: 'ended' }, 'Call state updated to ended');
        
        // Nettoyer automatiquement après 5 minutes
        setTimeout(() => {
          if (callStates.has(callStateKey)) {
            const state = callStates.get(callStateKey);
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

    // ✅ Nettoyer les rooms de réunion WebRTC : sans ça, un utilisateur qui
    // ferme brutalement l'app (crash, mise à jour forcée...) resterait
    // fantôme dans meetingRooms — les pairs restants continueraient de le
    // croire présent, et un nouvel arrivant recevrait son ID dans
    // meeting:room-state alors qu'il n'y a plus personne pour répondre à
    // l'offre SDP envoyée.
    meetingRooms.forEach((room, meetingRoomId) => {
      if (room.has(userId)) {
        room.delete(userId);
        if (room.size === 0) {
          meetingRooms.delete(meetingRoomId);
        } else {
          socket.to(`meeting:${meetingRoomId}`).emit('meeting:peer-left', {
            meetingRoomId,
            userId,
          });
        }
        logger.debug({ meetingRoomId, userId }, 'Cleared meeting room membership for disconnected user');
      }
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
// ⚠️ Cette route est désormais gérée par Next.js (pages/api/health.js)
// car toutes les requêtes HTTP passent par handle(req, res).
// Si tu veux garder un /health rapide ici sans passer par Next, vois la note plus bas.

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

// Start server (Next.js + Socket.IO sur le même port)
nextApp.prepare().then(() => {
  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server (Next.js + Socket.IO) started');
  });
}).catch((err) => {
  logger.error({ error: err.message }, 'Error starting Next.js app');
  process.exit(1);
});