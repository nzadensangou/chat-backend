# Système de Logging - Pino

## Vue d'ensemble

Le système de logging utilise **Pino**, un logger JSON haute-performance optimisé pour les applications Node.js.

**Avantages:**
- Logs structurés en JSON (facile à parser et analyser)
- Support du pretty-printing en développement
- Performance élevée (minimal overhead)
- Intégration facile avec outils de monitoring
- Niveaux de log: `debug`, `info`, `warn`, `error`

## Installation

```bash
npm install pino pino-http
```

## Utilisation dans les Services

```javascript
import { logger, logError, logInfo } from '../logger.js';

export class UserService {
  static async register(payload) {
    try {
      logInfo('User registration started', { email: payload.email });
      
      // ... logique métier ...
      
      logInfo('User registered successfully', { userId: result.insertId });
      return result;
    } catch (err) {
      logError(err, { context: 'user_registration', email: payload.email });
      throw err;
    }
  }
}
```

## Utilisation dans les API Routes

### Option 1: Wrapper automatique (recommandé)

```javascript
import { withLogging } from '../../../lib/withLogging';
import { UserService } from '../../../lib/services';

async function handler(req, res) {
  if (req.method === 'POST') {
    const user = await UserService.register(req.body);
    return res.status(201).json({ status: 'success', data: user });
  }
  
  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

export default withLogging(handler);
```

### Option 2: Wrapper avec logique conditionnelle

```javascript
import { withMethodHandlers } from '../../../lib/withLogging';
import { UserService } from '../../../lib/services';

export default withMethodHandlers({
  POST: async (req, res) => {
    const user = await UserService.register(req.body);
    return res.status(201).json({ status: 'success', data: user });
  },
  
  GET: async (req, res) => {
    const users = await UserService.getAll();
    return res.status(200).json({ status: 'success', data: users });
  },
});
```

### Option 3: Logging manuel

```javascript
import { logRequest, logError } from '../../../lib/logger.js';

export default async function handler(req, res) {
  const startTime = Date.now();
  
  try {
    // ... traitement ...
    
    const duration = Date.now() - startTime;
    logRequest(req, res, req.method, req.url, res.statusCode, duration);
  } catch (err) {
    logError(err, { path: req.url, method: req.method });
    res.status(500).json({ status: 'error' });
  }
}
```

## Fonctions disponibles

### Dans `lib/logger.js`

```javascript
import { 
  logger,           // Instance Pino principale
  logRequest,       // Log une requête HTTP
  logError,         // Log une erreur
  logInfo,          // Log un message info
  logWarn,          // Log un warning
  logDebug          // Log un message debug
} from '../lib/logger.js';

// Exemples:
logInfo('Processing user', { userId: 123 });
logWarn('Rate limit approaching', { ip: '192.168.1.1', remaining: 5 });
logError(err, { context: 'database_query', sql: 'SELECT ...' });
logDebug('Cache hit', { key: 'user:123' });
```

### Dans `lib/withLogging.js`

```javascript
import { withLogging, withMethodHandlers } from '../lib/withLogging.js';

// Wrapper simple
export default withLogging(handler);

// Wrapper avec support multi-méthodes
export default withMethodHandlers({
  GET: getHandler,
  POST: postHandler,
  PUT: putHandler,
  DELETE: deleteHandler,
});
```

## Niveaux de Log

| Niveau | Usage | Exemple |
|--------|-------|---------|
| **debug** | Infos détaillées pour développement | `Query SQL: SELECT...`, `Cache miss` |
| **info** | Événements normaux | `User registered`, `Request processed` |
| **warn** | Situations anormales mais non-bloquantes | `Rate limit near`, `Deprecated API` |
| **error** | Erreurs qui doivent être corrigées | `DB connection failed`, `Validation error` |

## Configuration

### Variables d'environnement

```bash
# .env.local

# Niveau de log (debug, info, warn, error)
LOG_LEVEL=debug

# Mode de sortie (json pour production, pretty pour dev)
NODE_ENV=development
```

### En développement

```
[08:30:42] INFO: User registration started
  email: "user@example.com"

[08:30:43] INFO: User registered successfully
  userId: 42
  duration: 150ms
```

### En production

```json
{"level":30,"time":"2026-05-11T08:30:42.123Z","pid":1234,"method":"POST","path":"/api/users","statusCode":201,"duration_ms":150}
```

## Intégration avec les Services

Tous les services doivent utiliser le logger pour tracer les opérations:

```javascript
// lib/services/user.service.js
import { logger, logError, logInfo } from '../logger.js';

export class UserService {
  static async register(payload) {
    logInfo('Registration attempt', { email: payload.email });
    
    try {
      const [result] = await db.query(query, [email, password]);
      logInfo('User created', { userId: result.insertId });
      return result;
    } catch (err) {
      logError(err, { context: 'user_registration', email });
      throw err;
    }
  }
  
  static async getUserById(userId) {
    logDebug('Fetching user', { userId });
    const user = await db.getOne(query, [userId]);
    return user;
  }
}
```

## Exemple complet: Migration d'un endpoint

### Avant (sans logging structuré)

```javascript
export default async function handler(req, res) {
  try {
    const user = await UserService.register(req.body);
    res.status(201).json({ data: user });
  } catch (err) {
    console.error('Error:', err);  // ❌ Logs non-structurés
    res.status(500).json({ error: 'Server error' });
  }
}
```

### Après (avec Pino)

```javascript
import { withLogging } from '../../../lib/withLogging';
import { UserService } from '../../../lib/services';

async function handler(req, res) {
  if (req.method === 'POST') {
    const user = await UserService.register(req.body);
    return res.status(201).json({ status: 'success', data: user });
  }
  return res.status(405).json({ status: 'error' });
}

export default withLogging(handler);  // ✓ Logging automatique
```

## Monitoring et Debugging

### Logs en temps réel (développement)

```bash
npm run dev
# Affiche les logs en pretty-print
```

### Logs JSON (production)

Les logs sont sortis en JSON et peuvent être parsés par:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Datadog**
- **New Relic**
- **CloudWatch** (AWS)
- **Stackdriver** (Google Cloud)

### Exemple d'analyse

```javascript
// Filtrer les erreurs
logs.filter(l => l.level >= 50)

// Erreurs par endpoint
logs.reduce((acc, l) => {
  acc[l.path] = (acc[l.path] || 0) + 1;
  return acc;
}, {})
```

## Bonnes pratiques

1. ✅ **Log avec contexte** - Incluez toujours les IDs pertinents
   ```javascript
   logInfo('Message sent', { userId, conversationId, messageId });
   ```

2. ✅ **Log les erreurs avec contexte** - Aide au debugging
   ```javascript
   logError(err, { userId, endpoint: '/api/messages', action: 'send' });
   ```

3. ❌ **Évitez les logs trop verbeux** - Les logs ne doivent pas polluer
   ```javascript
   // ❌ Mauvais: Trop d'info
   logInfo('Loop iteration', { i: 0 });
   
   // ✅ Bon: Info pertinente
   logInfo('Batch processed', { count: 1000, duration: 250 });
   ```

4. ✅ **Utilisez les niveaux correctement**
   ```javascript
   logDebug('...');    // Infos détaillées
   logInfo('...');     // Événements normaux
   logWarn('...');     // Avertissements
   logError(err, ...); // Erreurs
   ```

5. ✅ **Incluez des IDs de session/requête** pour tracer les flows
   ```javascript
   const requestId = req.requestId;
   logInfo('Step 1', { requestId, status: 'done' });
   logInfo('Step 2', { requestId, status: 'processing' });
   ```
