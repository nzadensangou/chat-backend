# Modification proposée : création de `meeting` lors de `call:initiate`

## Objectif
Faire en sorte que le handler Socket.IO `call:initiate` crée un enregistrement `meeting` en base (via `CallService.initiateCall`) et émette ensuite `call:incoming` en incluant le `meetingId` créé.

## Pourquoi
- Garantir qu'un identifiant de réunion (`meetingId`) existe dès l'émission de l'appel entrant.  
- Éviter les états partiels / courses entre socket et API REST (client n'a pas à faire un `POST /api/calls/initiate` séparé).  
- Simplifier le flux côté client (socket‑only pour l'établissement d'appel et l'identifiant persistant disponible immédiatement).

## Conséquences fonctionnelles
- Un appel audio ou vidéo crée une ligne `meeting` en DB même si le callee est offline.  
- Le payload `call:incoming` contiendra désormais `meetingId`.  
- Les flows `call:answer` et `call:end` peuvent s'appuyer sur ce `meetingId` (ex: persistance de la durée, ajout de participant via `CallService`).

## Risques / contre‑parties
- Petite latence supplémentaire (création DB) avant d'émettre `call:incoming`.  
- Nécessite un déploiement backend.  
- Doit gérer correctement les erreurs DB (rollback, code d'erreur envoyé au caller).

## Étapes d'implémentation (concrètes)
1. Ouvrir `backend/server.js`.  
2. Importer `CallService` si nécessaire (déjà présent dans `backend/lib/services/call.service.js`).  
3. Remplacer le handler actuel `socket.on('call:initiate', (data) => { ... })` par une version `async` qui :
   - vérifie `socket.userId` === `callerId`,
   - (optionnel) vérifie la permission via `CallService.canCallUser(callerId, calleeId)`,
   - appelle `await CallService.initiateCall(callerId, { receiverId: calleeId, callType, room: data.room })`,
   - récupère `meetingId` depuis le résultat (`meeting.idMeeting` ou équivalent),
   - met à jour `callStates` en incluant `meetingId`,
   - émet `call:incoming` à la callee avec `{ callerId, callerName, callType, meetingId, timestamp }`,
   - en cas d'erreur, logge et émet `socket.emit('error', { code: 'MEETING_CREATE_FAILED', message })`.

## Extrait de code (patch minimal)
```js
socket.on('call:initiate', async (data) => {
  const { callerId, calleeId, callType, room } = data;
  try {
    if (!socket.userId || socket.userId !== callerId) {
      socket.emit('error', { code: 'AUTH_MISMATCH', message: 'Invalid caller' });
      return;
    }

    const canCall = await CallService.canCallUser(callerId, calleeId);
    if (!canCall) {
      socket.emit('error', { code: 'CALL_NOT_ALLOWED' });
      return;
    }

    const meeting = await CallService.initiateCall(callerId, { receiverId: calleeId, callType, room });
    const meetingId = meeting?.idMeeting || meeting?.id;

    const callStateKey = `${callerId}-${calleeId}`;
    callStates.set(callStateKey, { caller: callerId, callee: calleeId, meetingId, state: 'ringing', timestamp: Date.now() });

    const calleeSocketId = onlineUsers.get(calleeId);
    if (calleeSocketId) {
      io.to(calleeSocketId).emit('call:incoming', { callerId, callerName: data.callerName, callType, meetingId, timestamp: new Date() });
    } else {
      // FCM fallback : inclure meetingId dans la notification
    }
  } catch (err) {
    logger.error({ err: err.message, callerId, calleeId }, 'Failed to create meeting for call:initiate');
    socket.emit('error', { code: 'MEETING_CREATE_FAILED', message: err.message });
  }
});
```

## Tests recommandés
- Caller → callee online : vérifier `call:incoming` inclut `meetingId` et DB contient la réunion.  
- Caller → callee offline : vérifier DB contient la réunion, FCM payload contient `meetingId`.  
- Simuler DB down : Caller reçoit `MEETING_CREATE_FAILED` et aucun `call:incoming` n’est émis.

## Déploiement & monitoring
- Déployer sur staging, exécuter tests e2e (ou manuels).  
- Ajouter metrics/logs pour suivre échecs `MEETING_CREATE_FAILED` et latence moyenne de `initiateCall`.

## Notes
- Si vous préférez ne pas toucher le serveur immédiatement, alternative client : appeler `POST /api/calls/initiate` avant d'émettre `call:initiate` et transmettre `meetingId` dans le payload socket.

---
Fichier créé automatiquement pour guider l'implémentation. Dis‑moi si tu veux que j'applique le patch serveur maintenant.
