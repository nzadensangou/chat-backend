/**
 * Socket.IO Instance Manager
 * Centralized access to the Socket.IO instance across the application
 * 
 * Usage:
 *   // In server.js
 *   import socketManager from './lib/socket-instance.js';
 *   socketManager.setIO(io);
 * 
 *   // In any endpoint/service
 *   import socketManager from './lib/socket-instance.js';
 *   socketManager.getIO().emit('status:created', data);
 */

// ⚠️ FIX: on stocke l'instance io sur `global` plutôt que sur `this.io`.
//
// Pourquoi : ce module peut être chargé DEUX FOIS en mémoire dans une
// config Next.js + serveur custom :
//   1) une fois par server.js, qui tourne en Node.js "brut" et appelle
//      setIO(io) sur SA copie du module.
//   2) une fois par le bundle webpack de Next.js pour les routes API
//      (pages/api/...), qui obtient SA PROPRE copie isolée du module.
// Avec `this.io` (propriété d'instance classique), chaque copie a son
// propre `io`, donc les routes API voient toujours `io = null` même si
// server.js a bien fait setIO() sur la sienne — d'où isAvailable() qui
// renvoie silencieusement false et aucun événement jamais émis.
// `global` est le seul objet garanti unique quel que soit le nombre de
// copies du module chargées par le bundler.
class SocketIOManager {
  /**
   * Set the Socket.IO instance (called from server.js on initialization)
   */
  setIO(ioInstance) {
    global.__socketIOInstance = ioInstance;
    console.log('✅ Socket.IO instance registered in manager (global)');
  }

  /**
   * Get the Socket.IO instance
   */
  getIO() {
    if (!global.__socketIOInstance) {
      throw new Error('Socket.IO instance not initialized. Call setIO() first.');
    }
    return global.__socketIOInstance;
  }

  /**
   * Check if Socket.IO is available
   */
  isAvailable() {
    return global.__socketIOInstance != null;
  }

  /**
   * Safe emit - emit only if Socket.IO is available
   */
  safeEmit(event, data) {
    try {
      if (this.isAvailable()) {
        global.__socketIOInstance.emit(event, data);
        return true;
      }
      console.warn(`⚠️ Socket.IO not available for event: ${event}`);
      return false;
    } catch (error) {
      console.error(`❌ Error emitting Socket.IO event ${event}:`, error);
      return false;
    }
  }
}

const socketManager = new SocketIOManager();
export default socketManager;