import fs from 'fs/promises';
import path from 'path';

let cachedConfig = null;

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toNumber(value, fallback) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Loads configuration from (in order):
 * - appsettings.json (optional)
 * - environment variables (override)
 */
export async function loadConfig() {
  if (cachedConfig) return cachedConfig;

  const appRoot = process.cwd();
  const appSettingsPath = path.join(appRoot, 'appsettings.json');
  const appSettings = (await readJsonIfExists(appSettingsPath)) || {};

  const db = appSettings.db || {};
  const lmStudio = appSettings.lmStudio || {};
  const jwt = appSettings.jwt || {};

  cachedConfig = {
    db: {
      user: process.env.POSTGRES_USER || db.user || 'noirion',
      host: process.env.POSTGRES_HOST || db.host || 'localhost',
      database: process.env.POSTGRES_DB || db.database || 'noirion',
      password: process.env.POSTGRES_PASSWORD || db.password || 'secret',
      port: toNumber(process.env.POSTGRES_PORT || db.port, 5432),
    },
    lmStudio: {
      baseUrl: (process.env.LM_STUDIO_BASE_URL || lmStudio.baseUrl || 'http://127.0.0.1:1234').replace(/\/$/, ''),
      model: process.env.LM_STUDIO_MODEL || lmStudio.model || null,
      timeoutMs: toNumber(process.env.LM_STUDIO_TIMEOUT_MS || lmStudio.timeoutMs, 60000),
    },
    jwt: {
      secret: process.env.JWT_SECRET || jwt.secret || 'noirion-secret-key-change-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || jwt.expiresIn || '7d',
    },
  };

  return cachedConfig;
}

export async function getConfig() {
  return await loadConfig();
}
