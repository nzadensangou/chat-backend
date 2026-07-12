// Status service - Handle stories/status creation and management
import db from '../db/index.js';
import { validate, safeValidate } from '../validators/index.js';
import { API_MESSAGES } from '../utils/error-codes.js';


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
    const { text, type, backgroundColor, mediaUrl, visibility } = validData;

    // La colonne `type` de la table `status` est un VARCHAR(20) : on stocke
    // directement le libellé ('text' | 'image' | 'video'), pas un code entier.
    const query = `
      INSERT INTO status (alanyaID, text, type, backgroundColor, mediaUrl, visibility, createdAt, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
    `;

    const [result] = await db.query(query, [
      userId,
      text || null,
      type,
      backgroundColor || null,
      mediaUrl || null,
      visibility,
    ]);
    const statusId = result.insertId;

    return {
      statusId,
      alanyaID: userId,
      text: text || null,
      type,
      backgroundColor: backgroundColor || null,
      mediaUrl: mediaUrl || null,
      visibility,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      viewCount: 0,
      likeCount: 0,
      message: 'Status created successfully',
    };
  }

  static async deleteStatus(statusId, userId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');
    if (status.alanyaID !== userId) throw new Error('You can only delete your own status');

    const query = `DELETE FROM status WHERE statusId = ?`;
    await db.query(query, [statusId]);

    return { statusId, message: 'Status deleted successfully' };
  }

  static async getStatus(statusId) {
    const query = `SELECT * FROM status WHERE statusId = ? LIMIT 1`;
    return await db.getOne(query, [statusId]);
  }

  static async getUserStatuses(userId, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.nom, u.pseudo, u.avatar_url,
        (SELECT COUNT(*) FROM statusViewer sv WHERE sv.statusId = s.statusId) AS viewCount,
        1 AS isViewedByMe
      FROM status s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      WHERE s.alanyaID = ? AND s.expiresAt > NOW()
      ORDER BY s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, limit, offset]);
    return this.attachViewAndLikeCounts(statuses);
  }

  // Fil "Statuts des contacts" : visible si
  //  1) l'auteur est dans MES contacts (préréquis d'accès, comme avant), ET
  //  2) l'auteur n'a pas mis son statut en 'private', ET
  //  3) l'auteur ne m'a pas explicitement masqué ce statut (statusHiddenFrom)
  static async getContactStatuses(userId, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.alanyaID, u.nom, u.pseudo, u.avatar_url,
        (SELECT COUNT(*) FROM statusViewer sv WHERE sv.statusId = s.statusId) AS viewCount,
        EXISTS(
          SELECT 1 FROM statusViewer sv2
          WHERE sv2.statusId = s.statusId AND sv2.viewerId = ?
        ) AS isViewedByMe
      FROM status s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      INNER JOIN preferredContact pc ON u.alanyaID = pc.idFriend
      WHERE pc.alanyaID = ?
        AND s.expiresAt > NOW()
        AND s.visibility != 'private'
        AND NOT EXISTS (
          SELECT 1 FROM statusHiddenFrom shf
          WHERE shf.statusId = s.statusId AND shf.hiddenFromId = ?
        )
      ORDER BY u.pseudo ASC, s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, userId, userId, limit, offset]);
    return this.attachViewAndLikeCounts(statuses);
  }

  // viewedBy/likedBy n'existent plus en colonnes CSV : les vues viennent de
  // statusViewer (voir viewStatus). isViewedByMe (0/1 renvoyé par MySQL)
  // est converti en vrai booléen pour le front. Les "likes" au sens ancien
  // du terme ne sont pas encore branchés à une table dédiée — voir note
  // dans le service de réactions ; on renvoie 0 pour ne rien casser côté
  // front en attendant.
  static attachViewAndLikeCounts(statuses) {
    return statuses.map(s => ({
      ...s,
      viewCount: Number(s.viewCount ?? 0),
      isViewedByMe: !!Number(s.isViewedByMe ?? 0),
      likeCount: 0,
    }));
  }

  static async viewStatus(statusId, viewerId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    // La contrainte UNIQUE(statusId, viewerId) évite les doublons ;
    // IGNORE fait que revoir un statut déjà vu ne fait juste rien.
    await db.query(
      `INSERT IGNORE INTO statusViewer (statusId, viewerId) VALUES (?, ?)`,
      [statusId, viewerId]
    );

    return { statusId, message: 'Status view recorded' };
  }

  static async bulkViewStatuses(statusIds, viewerId) {
    let recordedCount = 0;
    for (const statusId of statusIds) {
      const status = await this.getStatus(statusId);
      if (status) {
        const [result] = await db.query(
          `INSERT IGNORE INTO statusViewer (statusId, viewerId) VALUES (?, ?)`,
          [statusId, viewerId]
        );
        if (result.affectedRows > 0) recordedCount++;
      }
    }
    return { recordedCount, message: `${recordedCount} view(s) recorded` };
  }

  static async getStatusViewers(statusId, limit = 50, offset = 0) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    return await db.getAll(
      `SELECT u.alanyaID, u.nom, u.pseudo, u.avatar_url, sv.viewedAt
       FROM statusViewer sv
       INNER JOIN users u ON u.alanyaID = sv.viewerId
       WHERE sv.statusId = ?
       ORDER BY sv.viewedAt DESC
       LIMIT ? OFFSET ?`,
      [statusId, limit, offset]
    );
  }

  // ⚠️ likeStatus/unlikeStatus/getLikeCount/hasLiked ont été retirés : ils
  // reposaient sur une colonne `likedBy` qui n'a jamais existé dans le
  // schéma. Le "like" simple est de toute façon remplacé côté API par les
  // réactions emoji (/api/statuses/[id]/reactions) — voir le TODO séparé
  // sur StatusService.getStatusReactions / addReaction, qui sont eux aussi
  // référencés par les routes mais absents de ce service : ce sera un
  // deuxième correctif dédié (il faut d'abord ajouter une table
  // `statusReaction` au schéma).

  static async getViewerCount(statusId) {
    const row = await db.getOne(
      `SELECT COUNT(*) as count FROM statusViewer WHERE statusId = ?`,
      [statusId]
    );
    return row ? Number(row.count) : 0;
  }

  static async hasViewed(statusId, viewerId) {
    const row = await db.getOne(
      `SELECT 1 FROM statusViewer WHERE statusId = ? AND viewerId = ? LIMIT 1`,
      [statusId, viewerId]
    );
    return !!row;
  }

  static async searchStatuses(searchTerm, limit = 50, offset = 0) {
    const term = `%${searchTerm}%`;
    const query = `
      SELECT s.*, u.nom, u.pseudo, u.avatar_url
      FROM status s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      WHERE s.expiresAt > NOW() AND (s.text LIKE ? OR u.nom LIKE ? OR u.pseudo LIKE ?)
      ORDER BY s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [term, term, term, limit, offset]);
    return this.attachViewAndLikeCounts(statuses);
  }

  static async filterStatuses(userId, type, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.alanyaID, u.nom, u.pseudo, u.avatar_url
      FROM status s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      INNER JOIN preferredContact pc ON u.alanyaID = pc.idFriend
      WHERE pc.alanyaID = ? AND s.type = ? AND s.expiresAt > NOW()
      ORDER BY u.pseudo ASC, s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, type, limit, offset]);
    return this.attachViewAndLikeCounts(statuses);
  }

  static async deleteExpiredStatuses() {
    const query = `DELETE FROM status WHERE expiresAt <= NOW()`;
    const result = await db.query(query);
    return result[0]?.affectedRows || result.affectedRows || 0;
  }

  static async getExpiredStatuses(limit = 100) {
    return await db.getAll(`SELECT * FROM status WHERE expiresAt <= NOW() LIMIT ?`, [limit]);
  }
}

export default StatusService;