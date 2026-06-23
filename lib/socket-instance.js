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

class SocketIOManager {
  constructor() {
    this.io = null;
  }

  /**
   * Set the Socket.IO instance (called from server.js on initialization)
   */
  setIO(ioInstance) {
    this.io = ioInstance;
    console.log('✅ Socket.IO instance registered in manager');
  }

  /**
   * Get the Socket.IO instance
   */
  getIO() {
    if (!this.io) {
      throw new Error('Socket.IO instance not initialized. Call setIO() first.');
    }
    return this.io;
  }

  /**
   * Check if Socket.IO is available
   */
  isAvailable() {
    return this.io !== null;
  }

  /**
   * Safe emit - emit only if Socket.IO is available
   */
  safeEmit(event, data) {
    try {
      if (this.isAvailable()) {
        this.io.emit(event, data);
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

export default new SocketIOManager();
