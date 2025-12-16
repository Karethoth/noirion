import { Pool } from 'pg';
import 'dotenv/config';
import { getConfig } from '../utils/config.js';

let pool;

async function ensurePool() {
  if (pool) return pool;
  const cfg = await getConfig();
  pool = new Pool(cfg.db);
  return pool;
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
