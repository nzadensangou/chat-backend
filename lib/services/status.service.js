// Status service - Handle stories/status creation and management
import db from '../db/index.js';
import { validate, safeValidate } from '../validators/index.js';
import { API_MESSAGES } from '../utils/error-codes.js';
import { STATUS_TYPE_CODES } from '../constants.js';

export class StatusService {
  static parseIds(idStr) {
    if (!idStr) return [];
    return String(idStr)
      .split(',')
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));
  }

  static serializeIds(ids) {
    if (!ids || ids.length === 0) return null;
    return ids.join(',');
  }

  static async createStatus(userId, payload) {
    const validData = validate.status.validateCreation(payload);
    const { text, type, backgroundColor, mediaUrl } = validData;

    // Convert type string to integer code
    const typeCode = STATUS_TYPE_CODES[type.toLowerCase()];

    // Generate ID for statut table
    const maxIdResult = await db.getOne('SELECT MAX(ID) as maxId FROM statut');
    const statusId = (maxIdResult?.maxId || 0) + 1;

    const query = `
      INSERT INTO statut (ID, alanyaID, text, type, backgroundColor, mediaUrl, createdAt, expiredAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
    `;

    await db.query(query, [statusId, userId, text || null, typeCode, backgroundColor || null, mediaUrl || null]);

    return {
      ID: statusId,
      alanyaID: userId,
      text: text || null,
      type,
      backgroundColor: backgroundColor || null,
      mediaUrl: mediaUrl || null,
      createdAt: new Date().toISOString(),
      expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      viewedBy: [],
      likedBy: [],
      message: 'Status created successfully',
    };
  }

  static async deleteStatus(statusId, userId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');
    if (status.alanyaID !== userId) throw new Error('You can only delete your own status');

    const query = `DELETE FROM statut WHERE ID = ?`;
    await db.query(query, [statusId]);

    return { ID: statusId, message: 'Status deleted successfully' };
  }

  static async getStatus(statusId) {
    const query = `SELECT * FROM statut WHERE ID = ? LIMIT 1`;
    return await db.getOne(query, [statusId]);
  }

  static async getUserStatuses(userId, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.nom, u.pseudo, u.avatar_url
      FROM statut s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      WHERE s.alanyaID = ? AND s.expiredAt > NOW()
      ORDER BY s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, limit, offset]);
    return statuses.map(s => ({
      ...s,
      viewedBy: this.parseIds(s.viewedBy),
      likedBy: this.parseIds(s.likedBy),
      viewCount: this.parseIds(s.viewedBy).length,
      likeCount: this.parseIds(s.likedBy).length,
    }));
  }

  static async getContactStatuses(userId, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.alanyaID, u.nom, u.pseudo, u.avatar_url
      FROM statut s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      INNER JOIN preferredContact pc ON u.alanyaID = pc.idFriend
      WHERE pc.alanyaID = ? AND s.expiredAt > NOW()
      ORDER BY u.pseudo ASC, s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, limit, offset]);
    return statuses.map(s => ({
      ...s,
      viewedBy: this.parseIds(s.viewedBy),
      likedBy: this.parseIds(s.likedBy),
      viewCount: this.parseIds(s.viewedBy).length,
      likeCount: this.parseIds(s.likedBy).length,
    }));
  }

  static async viewStatus(statusId, viewerId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    const currentViewers = this.parseIds(status.viewedBy);
    if (!currentViewers.includes(viewerId)) {
      currentViewers.push(viewerId);
      const updatedViewedBy = this.serializeIds(currentViewers);
      await db.query(`UPDATE statut SET viewedBy = ? WHERE ID = ?`, [updatedViewedBy, statusId]);
    }

    return { ID: statusId, message: 'Status view recorded' };
  }

  static async bulkViewStatuses(statusIds, viewerId) {
    let recordedCount = 0;
    for (const statusId of statusIds) {
      const status = await this.getStatus(statusId);
      if (status) {
        const currentViewers = this.parseIds(status.viewedBy);
        if (!currentViewers.includes(viewerId)) {
          currentViewers.push(viewerId);
          await db.query(`UPDATE statut SET viewedBy = ? WHERE ID = ?`, [this.serializeIds(currentViewers), statusId]);
          recordedCount++;
        }
      }
    }
    return { recordedCount, message: `${recordedCount} view(s) recorded` };
  }

  static async getStatusViewers(statusId, limit = 50, offset = 0) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    const viewerIds = this.parseIds(status.viewedBy);
    const slicedIds = viewerIds.slice(offset, offset + limit);
    if (slicedIds.length === 0) return [];

    const placeholders = slicedIds.map(() => '?').join(',');
    return await db.getAll(`SELECT alanyaID, nom, pseudo, avatar_url FROM users WHERE alanyaID IN (${placeholders})`, slicedIds);
  }

  static async likeStatus(statusId, userId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    const currentLikers = this.parseIds(status.likedBy);
    if (!currentLikers.includes(userId)) {
      currentLikers.push(userId);
      await db.query(`UPDATE statut SET likedBy = ? WHERE ID = ?`, [this.serializeIds(currentLikers), statusId]);
    }

    return { ID: statusId, message: 'Status liked' };
  }

  static async unlikeStatus(statusId, userId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    const currentLikers = this.parseIds(status.likedBy);
    const updatedLikers = currentLikers.filter(id => id !== userId);
    await db.query(`UPDATE statut SET likedBy = ? WHERE ID = ?`, [this.serializeIds(updatedLikers), statusId]);

    return { ID: statusId, message: 'Status unliked' };
  }

  static async getViewerCount(statusId) {
    const status = await this.getStatus(statusId);
    return status ? this.parseIds(status.viewedBy).length : 0;
  }

  static async hasViewed(statusId, viewerId) {
    const status = await this.getStatus(statusId);
    return status ? this.parseIds(status.viewedBy).includes(viewerId) : false;
  }

  static async getLikeCount(statusId) {
    const status = await this.getStatus(statusId);
    return status ? this.parseIds(status.likedBy).length : 0;
  }

  static async hasLiked(statusId, userId) {
    const status = await this.getStatus(statusId);
    return status ? this.parseIds(status.likedBy).includes(userId) : false;
  }

  static async searchStatuses(searchTerm, limit = 50, offset = 0) {
    const term = `%${searchTerm}%`;
    const query = `
      SELECT s.*, u.nom, u.pseudo, u.avatar_url
      FROM statut s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      WHERE s.expiredAt > NOW() AND (s.text LIKE ? OR u.nom LIKE ? OR u.pseudo LIKE ?)
      ORDER BY s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [term, term, term, limit, offset]);
    return statuses.map(s => ({
      ...s,
      viewedBy: this.parseIds(s.viewedBy),
      likedBy: this.parseIds(s.likedBy),
      viewCount: this.parseIds(s.viewedBy).length,
      likeCount: this.parseIds(s.likedBy).length,
    }));
  }

  static async filterStatuses(userId, type, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.alanyaID, u.nom, u.pseudo, u.avatar_url
      FROM statut s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      INNER JOIN preferredContact pc ON u.alanyaID = pc.idFriend
      WHERE pc.alanyaID = ? AND s.type = ? AND s.expiredAt > NOW()
      ORDER BY u.pseudo ASC, s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, type, limit, offset]);
    return statuses.map(s => ({
      ...s,
      viewedBy: this.parseIds(s.viewedBy),
      likedBy: this.parseIds(s.likedBy),
      viewCount: this.parseIds(s.viewedBy).length,
      likeCount: this.parseIds(s.likedBy).length,
    }));
  }

  static async deleteExpiredStatuses() {
    const query = `DELETE FROM statut WHERE expiredAt <= NOW()`;
    const result = await db.query(query);
    return result[0]?.affectedRows || result.affectedRows || 0;
  }

  static async getExpiredStatuses(limit = 100) {
    return await db.getAll(`SELECT * FROM statut WHERE expiredAt <= NOW() LIMIT ?`, [limit]);
  }
}

export default StatusService;