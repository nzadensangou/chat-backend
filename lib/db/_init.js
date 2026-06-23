// Initial database migration - Create all tables
import { schema } from './schema.js';
import { logger } from '../logger.js';

/**
 * Migration version
 */
export const version = '001_initial_schema';

/**
 * Migration description
 */
export const description = 'Create initial database schema with all tables and indexes';

/**
 * Timestamp of migration
 */
export const timestamp = new Date('2024-01-01').toISOString();

/**
 * Execute migration (create tables)
 * @param {mysql2.Pool} pool - MySQL connection pool
 * @returns {Promise<boolean>} Success status
 */
export const up = async (pool) => {
  try {
    const statements = schema.split(';').filter(stmt => stmt.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement.trim());
      }
    }
    logger.info({ version }, 'Migration executed successfully');
    return true;
  } catch (err) {
    logger.error(err, `Migration ${version} failed`);
    throw err;
  }
};

/**
 * Rollback migration (drop all tables)
 * @param {mysql2.Pool} pool - MySQL connection pool
 * @returns {Promise<boolean>} Success status
 */
export const down = async (pool) => {
  const dropStatements = [
    'DROP TABLE IF EXISTS userAccess',
    'DROP TABLE IF EXISTS callHistory',
    'DROP TABLE IF EXISTS participant',
    'DROP TABLE IF EXISTS meeting',
    'DROP TABLE IF EXISTS blocked',
    'DROP TABLE IF EXISTS preferredContact',
    'DROP TABLE IF EXISTS statusReport',
    'DROP TABLE IF EXISTS statusHiddenFrom',
    'DROP TABLE IF EXISTS statusViewer',
    'DROP TABLE IF EXISTS status',
    'DROP TABLE IF EXISTS messageReadReceipts',
    'DROP TABLE IF EXISTS messages',
    'DROP TABLE IF EXISTS conv_participants',
    'DROP TABLE IF EXISTS conversation',
    'DROP TABLE IF EXISTS users',
    'DROP TABLE IF EXISTS pays',
  ];

  try {
    for (const statement of dropStatements) {
      await pool.query(statement);
    }
    logger.info({ version }, 'Migration rolled back successfully');
    return true;
  } catch (err) {
    logger.error(err, `Migration ${version} rollback failed`);
    throw err;
  }
};

/**
 * Migration metadata
 */
export const migration = {
  version,
  description,
  timestamp,
  tables: [
    'pays',
    'users',
    'conversation',
    'conv_participants',
    'messages',
    'messageReadReceipts',
    'status',
    'statusViewer',
    'statusHiddenFrom',
    'statusReport',
    'preferredContact',
    'blocked',
    'meeting',
    'participant',
    'callHistory',
    'userAccess',
  ],
  indexes: 25,
};

export default {
  version,
  description,
  timestamp,
  up,
  down,
  migration,
};