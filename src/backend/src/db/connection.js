import { Pool } from 'pg';
import 'dotenv/config';
import { getConfig } from '../utils/config.js';

let pool;

const DB_DEBUG = ['1', 'true', 'yes', 'on'].includes(String(process.env.DB_DEBUG || '').toLowerCase());
let poolEventsAttached = false;

function toPositiveInt(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function redactDbConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const copy = { ...cfg };
  if (copy.password) copy.password = '***';
  if (copy.ssl && typeof copy.ssl === 'object') {
    // Avoid dumping cert contents.
    copy.ssl = { ...copy.ssl, key: copy.ssl.key ? '***' : undefined, cert: copy.ssl.cert ? '***' : undefined, ca: copy.ssl.ca ? '***' : undefined };
  }
  return copy;
}

function attachPoolDebugEvents(p) {
  if (!DB_DEBUG || poolEventsAttached || !p) return;
  poolEventsAttached = true;

   
  console.log('[db] Pool debug enabled');

  p.on('connect', () => {
     
    console.log('[db] client connect');
  });

  p.on('acquire', () => {
     
    console.log('[db] client acquire');
  });

  p.on('remove', () => {
     
    console.log('[db] client remove');
  });

  p.on('error', (err) => {
     
    console.error('[db] pool error', err);
  });
}

async function ensurePool() {
  if (pool) return pool;
  const cfg = await getConfig();

  // Prevent “hang forever” when the pool is exhausted or a connection can't be established.
  const connectionTimeoutMillis = toPositiveInt(process.env.PG_CONNECT_TIMEOUT_MS, 15000);
  const idleTimeoutMillis = toPositiveInt(process.env.PG_IDLE_TIMEOUT_MS, 30000);
  const max = toPositiveInt(process.env.PG_POOL_MAX, 10);

  pool = new Pool({
    ...cfg.db,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    max,
  });
  if (DB_DEBUG) {
     
    console.log('[db] creating pool with config:', {
      ...redactDbConfig(cfg.db),
      connectionTimeoutMillis,
      idleTimeoutMillis,
      max,
    });
  }
  attachPoolDebugEvents(pool);
  return pool;
}

export async function getPoolStats() {
  const p = await ensurePool();
  return {
    total: p.totalCount,
    idle: p.idleCount,
    waiting: p.waitingCount,
  };
}

async function testConnection() {
  try {
    const p = await ensurePool();
    const client = await p.connect();
    console.log('Successfully connected to PostgreSQL database');
    client.release();
    return true;
  } catch (err) {
    console.error('Error connecting to PostgreSQL:', err);
    return false;
  }
}

// Export a proxy-like pool API used across the app.
const poolProxy = {
  connect: async () => {
    const p = await ensurePool();
    return await p.connect();
  },
  query: async (text, params) => {
    const p = await ensurePool();
    return await p.query(text, params);
  },
  end: async () => {
    if (!pool) return;
    await pool.end();
    pool = null;
  }
};

export { poolProxy as pool, testConnection };
