// Status service - Handle stories/status creation and management
//
// ⚠️ IMPORTANT (2026-07-13) : ce service interrogeait à l'origine une table
// `status` + des tables satellites `statusViewer` / `statusHiddenFrom` qui
// n'ont JAMAIS existé en base de production — seule la table `statut`
// (schéma "historique", une seule table) existe réellement. Toutes les
// requêtes /api/statuses* renvoyaient donc systématiquement une 500
// (ER_NO_SUCH_TABLE). Ce fichier a été réécrit pour cibler `statut`.
//
// Limites du schéma réel, qu'on ne peut pas contourner sans migration :
//  - pas de colonne `visibility` → tous les statuts sont visibles par les
//    contacts (pas de mode "privé").
//  - pas de table de vues par utilisateur : `viewedBy`/`likedBy` sont de
//    simples compteurs entiers sur `statut`. Impossible de savoir QUI a vu
//    un statut, ni d'empêcher qu'un même spectateur fasse grimper le
//    compteur à chaque réouverture.
//  - pas de table `statusHiddenFrom` → pas de "masquer à telle personne".
//  - pas de table de réactions/réponses → non gérées ici (routes séparées).
import db from '../db/index.js';
import { validate } from '../validators/index.js';
import { STATUS_TYPE_CODES } from '../constants.js';

const TABLE = 'statut';

// STATUS_TYPE_CODES: { text: 1, image: 2, video: 3 } (colonne `type` = smallint)
const CODE_TO_TYPE = Object.fromEntries(
  Object.entries(STATUS_TYPE_CODES).map(([label, code]) => [code, label])
);

function typeToCode(typeLabel) {
  return STATUS_TYPE_CODES[typeLabel] ?? STATUS_TYPE_CODES.text;
}

function codeToType(code) {
  return CODE_TO_TYPE[Number(code)] ?? 'text';
}

// Normalise une ligne `statut` brute vers le format attendu par le front
// (mêmes clés que l'ancien code visait : statusId/alanyaID/text/type/...).
function formatStatus(row) {
  if (!row) return null;
  return {
    ...row,
    statusId: row.ID,
    type: codeToType(row.type),
    expiresAt: row.expiredAt,
    viewCount: Number(row.viewedBy ?? 0),
    likeCount: Number(row.likedBy ?? 0),
  };
}

export class StatusService {
  static async createStatus(userId, payload) {
    const validData = validate.status.validateCreation(payload);
    const { text, type, backgroundColor, mediaUrl } = validData;
    // `text` est NOT NULL dans `statut` (tinytext) : jamais de null.
    const textValue = text || '';

    const query = `
      INSERT INTO ${TABLE} (alanyaID, type, text, mediaUrl, backgroundColor, createdAt, expiredAt)
      VALUES (?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
    `;

    const [result] = await db.query(query, [
      userId,
      typeToCode(type),
      textValue,
      mediaUrl || null,
      backgroundColor || null,
    ]);
    const statusId = result.insertId;

    return {
      statusId,
      id: statusId,
      alanyaID: userId,
      text: textValue || null,
      type,
      backgroundColor: backgroundColor || null,
      mediaUrl: mediaUrl || null,
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

    await db.query(`DELETE FROM ${TABLE} WHERE ID = ?`, [statusId]);
    return { statusId, message: 'Status deleted successfully' };
  }

  static async getStatus(statusId) {
    const row = await db.getOne(`SELECT * FROM ${TABLE} WHERE ID = ? LIMIT 1`, [statusId]);
    return formatStatus(row);
  }

  static async getUserStatuses(userId, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.nom, u.pseudo, u.avatar_url
      FROM ${TABLE} s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      WHERE s.alanyaID = ? AND s.expiredAt > NOW()
      ORDER BY s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, limit, offset]);
    // Ce sont mes propres statuts : "vu par moi" n'a pas de sens ici.
    return statuses.map(s => ({ ...formatStatus(s), isViewedByMe: true }));
  }

  // Fil "Statuts des contacts" : visible si l'auteur est dans mes contacts.
  // (pas de filtre visibility/hiddenFrom possible : colonnes/tables absentes)
  static async getContactStatuses(userId, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.alanyaID, u.nom, u.pseudo, u.avatar_url
      FROM ${TABLE} s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      INNER JOIN preferredContact pc ON u.alanyaID = pc.idFriend
      WHERE pc.alanyaID = ?
        AND s.expiredAt > NOW()
      ORDER BY u.pseudo ASC, s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, limit, offset]);
    // ⚠️ Pas de suivi par utilisateur possible avec ce schéma : on ne peut
    // pas dire de façon fiable si CE viewerId précis a déjà vu CE statut.
    return statuses.map(s => ({ ...formatStatus(s), isViewedByMe: false }));
  }

  // Incrémente le compteur brut de vues. Ne protège pas contre les vues
  // répétées du même utilisateur (le schéma ne le permet pas).
  static async viewStatus(statusId, viewerId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    await db.query(`UPDATE ${TABLE} SET viewedBy = viewedBy + 1 WHERE ID = ?`, [statusId]);
    return { statusId, message: 'Status view recorded' };
  }

  static async bulkViewStatuses(statusIds, viewerId) {
    let recordedCount = 0;
    for (const statusId of statusIds) {
      const [result] = await db.query(
        `UPDATE ${TABLE} SET viewedBy = viewedBy + 1 WHERE ID = ?`,
        [statusId]
      );
      if (result.affectedRows > 0) recordedCount++;
    }
    return { recordedCount, message: `${recordedCount} view(s) recorded` };
  }

  // Pas de table de viewers nominative dans ce schéma : on ne peut renvoyer
  // que le compteur, pas la liste des personnes ayant vu le statut.
  static async getStatusViewers(statusId) {
    const status = await this.getStatus(statusId);
    if (!status) throw new Error('Status not found');

    return {
      viewCount: status.viewCount,
      viewers: [],
      note: 'Liste nominative des vues non disponible avec le schéma actuel (statut.viewedBy est un compteur, pas une table par utilisateur).',
    };
  }

  static async getViewerCount(statusId) {
    const row = await db.getOne(`SELECT viewedBy FROM ${TABLE} WHERE ID = ?`, [statusId]);
    return row ? Number(row.viewedBy) : 0;
  }

  // Ne peut pas être déterminé de façon fiable avec ce schéma (pas de table
  // par utilisateur) : renvoie toujours false.
  static async hasViewed(_statusId, _viewerId) {
    return false;
  }

  static async searchStatuses(searchTerm, limit = 50, offset = 0) {
    const term = `%${searchTerm}%`;
    const query = `
      SELECT s.*, u.nom, u.pseudo, u.avatar_url
      FROM ${TABLE} s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      WHERE s.expiredAt > NOW() AND (s.text LIKE ? OR u.nom LIKE ? OR u.pseudo LIKE ?)
      ORDER BY s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [term, term, term, limit, offset]);
    return statuses.map(formatStatus);
  }

  static async filterStatuses(userId, type, limit = 50, offset = 0) {
    const query = `
      SELECT s.*, u.alanyaID, u.nom, u.pseudo, u.avatar_url
      FROM ${TABLE} s
      INNER JOIN users u ON s.alanyaID = u.alanyaID
      INNER JOIN preferredContact pc ON u.alanyaID = pc.idFriend
      WHERE pc.alanyaID = ? AND s.type = ? AND s.expiredAt > NOW()
      ORDER BY u.pseudo ASC, s.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const statuses = await db.getAll(query, [userId, typeToCode(type), limit, offset]);
    return statuses.map(formatStatus);
  }

  static async deleteExpiredStatuses() {
    const [result] = await db.query(`DELETE FROM ${TABLE} WHERE expiredAt <= NOW()`);
    return result?.affectedRows || 0;
  }

  static async getExpiredStatuses(limit = 100) {
    const rows = await db.getAll(`SELECT * FROM ${TABLE} WHERE expiredAt <= NOW() LIMIT ?`, [limit]);
    return rows.map(formatStatus);
  }
}

export default StatusService;