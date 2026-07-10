// pages/api/db-check.js
//
// ⚠️ ENDPOINT DE DIAGNOSTIC TEMPORAIRE ⚠️
// À supprimer une fois le problème de connexion DB résolu — il expose
// des détails techniques (hôte, port, code d'erreur) qui ne devraient
// jamais être publics en production normale.

import db from '../../lib/db/index.js';

export default async function handler(req, res) {
  const startTime = Date.now();

  const diagnostics = {
    step: null,
    config: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      database: process.env.DB_NAME || 'alanyabd2026',
      user: process.env.DB_USER ? '(défini)' : '(VIDE - utilise le fallback "root")',
      password: process.env.DB_PASSWORD ? '(défini)' : '(VIDE)',
    },
  };

  try {
    // Étape 1 : est-ce qu'on arrive à obtenir une connexion du pool ?
    diagnostics.step = 'getConnection';
    const pool = db.getPool();
    const connection = await pool.getConnection();

    // Étape 2 : requête la plus simple possible (ne touche aucune table)
    diagnostics.step = 'SELECT 1';
    await connection.query('SELECT 1');

    // Étape 3 : requête réelle sur la table qui pose problème
    diagnostics.step = 'SELECT COUNT(*) FROM users';
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM users');

    connection.release();

    return res.status(200).json({
      status: 'success',
      message: 'Connexion DB et requête OK',
      userCount: rows[0].count,
      duration_ms: Date.now() - startTime,
      ...diagnostics,
    });
  } catch (error) {
    // ✅ Ici on n'avale PAS l'erreur : on renvoie tout ce qui est utile
    // pour diagnostiquer (code MySQL, errno, message réel).
    return res.status(500).json({
      status: 'error',
      failedAtStep: diagnostics.step,
      errorMessage: error.message,
      errorCode: error.code || null,       // ex: ECONNREFUSED, ER_ACCESS_DENIED_ERROR, ETIMEDOUT
      errorErrno: error.errno || null,
      sqlState: error.sqlState || null,
      duration_ms: Date.now() - startTime,
      ...diagnostics,
    });
  }
}
