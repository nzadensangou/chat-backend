// Database connection and initialization - MySQL with async/await
import mysql from 'mysql2/promise';
import { logger } from '../logger.js';

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? undefined,
  database: process.env.DB_NAME || 'alanyabd2026',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Async/await API
const db = {
  // Execute query (INSERT, UPDATE, DELETE, SELECT)
  async query(sql, params = []) {
    const connection = await pool.getConnection();
    try {
      return await connection.query(sql, params);
    } finally {
      connection.release();
    }
  },

  // Get single row (returns first row or null)
  async getOne(sql, params = []) {
    const [rows] = await this.query(sql, params);
    return rows[0] || null;
  },

  // Get all rows (returns array)
  async getAll(sql, params = []) {
    const [rows] = await this.query(sql, params);
    return rows;
  },

  // Execute transaction
  async withTransaction(fn) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  // Get raw pool for advanced operations
  getPool: () => pool,

  // Close all connections
  async close() {
    await pool.end();
  },
};


logger.info({ host: process.env.DB_HOST, database: process.env.DB_NAME }, 'Attempting to connect to MySQL');

// Test connection
pool.getConnection().then(conn => {
  logger.info('Connected to MySQL database successfully');
  conn.release();
}).catch(err => {
  logger.error(err, 'Database connection failed');
  logger.error('Ensure MySQL is running and all required database environment variables are configured correctly');
});

export default db;
export { logger };
