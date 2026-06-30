import admin from 'firebase-admin';
import { logger } from '../logger.js';

/**
 * FCM Service - Push Notifications via Firebase Cloud Messaging
 * 
 * Usage:
 * 1. Initialize at startup: await fcmService.initialize(serviceAccountKey)
 * 2. Send notifications: await fcmService.sendCallNotification(fcmToken, callData)
 */

class FCMService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Initialize Firebase Admin SDK
   * Call this ONCE at server startup
   * 
   * @param {Object} serviceAccountKey - Firebase service account JSON
   * @returns {Promise<void>}
   */
  async initialize(serviceAccountKey) {
    try {
      if (this.isInitialized) {
        logger.debug('FCM already initialized');
        return;
      }

      if (!serviceAccountKey) {
        throw new Error('Service account key is required for FCM initialization');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountKey),
      });

      this.isInitialized = true;
      logger.info('✅ FCM (Firebase Cloud Messaging) initialized successfully');
    } catch (error) {
      logger.error({ error: error.message }, 'FCM initialization failed');
      throw error;
    }
  }

  /**
   * Send push notification for incoming call
   * 
   * @param {string} fcmToken - FCM token of the recipient
   * @param {Object} callData - Call information
   *   - callerId: Caller's user ID
   *   - callerName: Caller's display name
   *   - callType: 'video' or 'audio'
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendCallNotification(fcmToken, { callerId, callerName, callType }) {
    try {
      if (!this.isInitialized) {
        throw new Error('FCM not initialized. Call initialize() first');
      }

      if (!fcmToken) {
        logger.warn('FCM token is empty');
        return { success: false, error: 'No FCM token provided' };
      }

      const title = `${callerName || 'Someone'} is calling...`;
      const body = callType === 'video' ? '📹 Incoming video call' : '📞 Incoming call';

      const message = {
        token: fcmToken,
        
        // Notification shown in notification center
        notification: {
          title,
          body,
        },

        // Android-specific configuration
        android: {
          priority: 'high',
          ttl: 300,  // 5 minutes
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            priority: 'high',
            defaultSound: true,
          },
        },

        // iOS-specific configuration
        apns: {
          headers: {
            'apns-priority': '10',  // High priority
          },
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound: 'default',
              badge: 1,
              'content-available': 1,  // Wake app in background
            },
          },
        },

        // Data payload (for custom handling in app)
        data: {
          callerId: String(callerId),
          callerName: callerName || 'Unknown',
          callType: callType || 'audio',
          action: 'INCOMING_CALL',
          timestamp: new Date().toISOString(),
        },
      };

      // Send the message
      const messageId = await admin.messaging().send(message);

      logger.info(
        { fcmToken: fcmToken.substring(0, 20) + '...', callerId, messageId },
        'FCM notification sent successfully'
      );

      return { success: true, messageId };
    } catch (error) {
      logger.error(
        { fcmToken: fcmToken.substring(0, 20) + '...', error: error.message },
        'FCM notification failed'
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification for message
   * (Optional: for future message notifications)
   * 
   * @param {string} fcmToken - FCM token
   * @param {Object} messageData - Message information
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendMessageNotification(fcmToken, { senderName, messagePreview, conversationId }) {
    try {
      if (!this.isInitialized) {
        throw new Error('FCM not initialized');
      }
      if (!fcmToken) {                    // ← à ajouter
        logger.warn('FCM token is empty');
        return { success: false, error: 'No FCM token provided' };
      }

      const message = {
        token: fcmToken,
        notification: {
          title: senderName || 'New message',
          body: messagePreview || 'You have a new message',
        },
        android: {
          priority: 'normal',
          notification: {
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        data: {
          action: 'NEW_MESSAGE',
          conversationId: String(conversationId),
          senderName,
          timestamp: new Date().toISOString(),
        },
      };

      const messageId = await admin.messaging().send(message);

      logger.debug({ messageId }, 'Message notification sent');
      return { success: true, messageId };
    } catch (error) {
      logger.error({ error: error.message }, 'Message notification failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification for status/story
   * (Optional: for future status notifications)
   * 
   * @param {string} fcmToken - FCM token
   * @param {Object} statusData - Status information
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendStatusNotification(fcmToken, { senderName, statusId }) {
    try {
      if (!this.isInitialized) {
        throw new Error('FCM not initialized');
      }

      const message = {
        token: fcmToken,
        notification: {
          title: `${senderName} posted a status`,
          body: '👁️ Check out the latest story',
        },
        data: {
          action: 'NEW_STATUS',
          statusId: String(statusId),
          senderName,
          timestamp: new Date().toISOString(),
        },
      };

      const messageId = await admin.messaging().send(message);

      logger.debug({ messageId }, 'Status notification sent');
      return { success: true, messageId };
    } catch (error) {
      logger.error({ error: error.message }, 'Status notification failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if FCM is initialized
   * @returns {boolean}
   */
  isReady() {
    return this.isInitialized;
  }
}

// Export singleton instance
const fcmServiceInstance = new FCMService();
export default fcmServiceInstance;