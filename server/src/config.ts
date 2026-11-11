import path from 'path';
import dotenv from 'dotenv';

// Look for .env in current directory and parent workspace root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'hackathon-race-proof-secret-jwt-key-2026',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  database: {
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/team_formation',
    max: parseInt(process.env.PG_POOL_MAX || '50', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  rateLimits: {
    maxRedeemPerMinute: 5,
    maxRedeemPer15Min: 20,
    maxIpPerMinute: 20,
  },
};
