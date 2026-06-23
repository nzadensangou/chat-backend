// config/index.js - Configuration centralisée du backend

// Validation des secrets en production
const validateSecrets = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const requiredSecrets = ['JWT_SECRET', 'DB_PASSWORD'];
    const dangerousDefaults = ['your-secret-key-change-in-production', 'nsangou.2006'];
    
    for (const secret of requiredSecrets) {
      const value = process.env[secret];
      
      if (!value) {
        throw new Error(`🚨 SECURITY ERROR: ${secret} is not set in production!`);
      }
      
      if (dangerousDefaults.includes(value)) {
        throw new Error(`🚨 SECURITY ERROR: ${secret} is using a default/exposed value in production!`);
      }
    }
  }
};

// Configuration du Cameroun
export const cameroonConfig = {
  countryCode: 237,
  prefix: '+237',
  phoneFormat: '+237 6XXXXXXXX',
  timeZone: 'Africa/Douala',
  decallageHoraire: 0, // UTC+1
  phoneValidation: {
    minLength: 6,
    maxLength: 15,
    pattern: /^\+?[1-9]\d{1,14}$/,
    cameroonPattern: /^\+237\d{8}$/,
  },
};

// Configuration Base de Données (MySQL)
export const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alanyabd2026',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Configuration Serveur
export const serverConfig = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
};

// Configuration JWT - Sécurisée
export const jwtConfig = (() => {
  validateSecrets();
  
  return {
    secret: process.env.JWT_SECRET || (
      process.env.NODE_ENV === 'production'
        ? (() => { throw new Error('JWT_SECRET required in production'); })()
        : 'dev-only-key-not-for-production'
    ),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256',
  };
})();

// Configuration CORS - Sécurisée en production
export const corsConfig = {
  origin: (() => {
    const origin = process.env.CORS_ORIGIN || (
      process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000'
    );
    
    if (process.env.NODE_ENV === 'production' && origin === '*') {
      throw new Error('🚨 SECURITY ERROR: CORS origin cannot be "*" in production!');
    }
    
    return origin;
  })(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Configuration Rate Limiting
export const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limite 100 requêtes par windowMs
  message: 'Trop de requêtes, veuillez réessayer plus tard',
  standardHeaders: true,
  legacyHeaders: false,
};

// Configuration API
export const apiConfig = {
  version: 'v1',
  baseUrl: process.env.API_BASE_URL || `http://localhost:${serverConfig.port}`,
  timeout: 30000,
};

// Export défaut: tous les configs
export default {
  cameroon: cameroonConfig,
  database: databaseConfig,
  server: serverConfig,
  jwt: jwtConfig,
  cors: corsConfig,
  rateLimit: rateLimitConfig,
  api: apiConfig,
};
