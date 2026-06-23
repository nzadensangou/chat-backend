// Knex Configuration - Database migrations & schema management
// Commands:
//   npx knex migrate:latest       → Apply pending migrations
//   npx knex migrate:rollback     → Undo last migration batch
//   npx knex migrate:list         → List all migrations
//   npx knex seed:run             → Run seeds (load test data)

import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const config = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'mydb',
    },
    migrations: {
      directory: './lib/db/migrations',
      extension: 'js',
      timestampFilename: true,
    },
    seeds: {
      directory: './lib/db/seeds',
      extension: 'js',
    },
    // Show SQL queries in console
    debug: process.env.NODE_ENV === 'development' && process.env.DEBUG_SQL === 'true',
    // Connection pool
    pool: {
      min: 2,
      max: 10,
    },
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },
    migrations: {
      directory: './lib/db/migrations',
      extension: 'js',
      timestampFilename: true,
    },
    seeds: {
      directory: './lib/db/seeds',
      extension: 'js',
    },
    pool: {
      min: 5,
      max: 20,
    },
  },

  staging: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },
    migrations: {
      directory: './lib/db/migrations',
      extension: 'js',
      timestampFilename: true,
    },
    seeds: {
      directory: './lib/db/seeds',
      extension: 'js',
    },
    pool: {
      min: 3,
      max: 15,
    },
  },
};

// Export config for current environment
export default config[process.env.NODE_ENV || 'development'];