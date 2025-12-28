import { logger } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';

const KEYS = {
  homeLocation: 'project.homeLocation',
  homeAutoUpdate: 'project.homeAutoUpdate',
  aiEnabled: 'ai.enabled',
  aiSendExif: 'ai.sendExif',
  lmStudioBaseUrl: 'ai.lmStudio.baseUrl',
  lmStudioModel: 'ai.lmStudio.model',
  locationInterpolationMaxMinutes: 'assets.locationInterpolation.maxMinutes',
};

function normalizeBoolean(v, defaultValue = true) {
  if (v === null || v === undefined) return defaultValue;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  return defaultValue;
}

function normalizeBaseUrl(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  let url;
  try {
    url = new URL(s);
  } catch {
    throw new Error('lmStudioBaseUrl must be a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('lmStudioBaseUrl must start with http:// or https://');
  }
  return s.replace(/\/$/, '');
}

function normalizeInt(v, { defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (v === null || v === undefined || v === '') return defaultValue;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export class ProjectSettingsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async #getValue(key) {
    const { rows } = await this.dbPool.query(
      'SELECT value FROM project_settings WHERE key = $1',
      [key]
    );
    return rows[0]?.value ?? null;
  }

  async #setValue(key, value, updatedBy = null) {
    await this.dbPool.query(
      `
        INSERT INTO project_settings (key, value, updated_by, updated_at)
        VALUES ($1, $2::jsonb, $3, now())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
      `,
      [key, JSON.stringify(value ?? null), updatedBy]
    );
  }

  async computeHomeLocation() {
    const sql = `
      WITH points AS (
        SELECT COALESCE(m.gps, ex.gps) AS geom
        FROM assets a
        LEFT JOIN asset_metadata_manual m ON m.asset_id = a.id
        LEFT JOIN asset_metadata_exif ex ON ex.asset_id = a.id
        WHERE a.deleted_at IS NULL
          AND COALESCE(m.gps, ex.gps) IS NOT NULL

        UNION ALL
        SELECT geom FROM events WHERE geom IS NOT NULL

        UNION ALL
        SELECT geom FROM presences WHERE geom IS NOT NULL

        UNION ALL
        SELECT ST_SetSRID(
          ST_MakePoint(
            CASE
              WHEN (ea.attribute_value->>'longitude') ~ '^-?\\d+(\\.\\d+)?$' THEN (ea.attribute_value->>'longitude')::double precision
              ELSE NULL
            END,
            CASE
              WHEN (ea.attribute_value->>'latitude') ~ '^-?\\d+(\\.\\d+)?$' THEN (ea.attribute_value->>'latitude')::double precision
              ELSE NULL
            END
          ),
          4326
        ) AS geom
        FROM entities e
        JOIN entity_attributes ea ON ea.entity_id = e.id
        WHERE lower(e.entity_type) = 'location'
          AND lower(ea.attribute_name) = 'coordinates'
          AND (ea.attribute_value ? 'latitude')
          AND (ea.attribute_value ? 'longitude')
      )
      SELECT
        ST_Y(c)::double precision AS lat,
        ST_X(c)::double precision AS lng
      FROM (
        SELECT ST_Centroid(ST_Collect(geom)) AS c
        FROM points
        WHERE geom IS NOT NULL
      ) t
      WHERE c IS NOT NULL
    `;

    const { rows } = await this.dbPool.query(sql);
    const lat = rows[0]?.lat;
    const lng = rows[0]?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  async getProjectSettings({ recomputeIfAutoUpdate = true } = {}) {
    const cfg = await getConfig();

    const autoRaw = await this.#getValue(KEYS.homeAutoUpdate);
    const autoUpdate = autoRaw === true || autoRaw === 'true' || autoRaw?.enabled === true;

    let home = await this.#getValue(KEYS.homeLocation);
    let homeLat = null;
    let homeLng = null;

    if (home && typeof home === 'object') {
      const lat = Number(home.lat);
      const lng = Number(home.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        homeLat = lat;
        homeLng = lng;
      }
    }

    if (autoUpdate && recomputeIfAutoUpdate) {
      try {
        const computed = await this.computeHomeLocation();
        if (computed) {
          homeLat = computed.lat;
          homeLng = computed.lng;
          await this.#setValue(KEYS.homeLocation, computed, null);
        }
      } catch (err) {
        await logger.warn({
          dbPool: this.dbPool,
          eventType: 'project_settings_compute_home_failed',
          message: 'Failed to compute project home location',
          details: { error: err?.message || String(err) },
        });
      }
    }

    const aiEnabledRaw = await this.#getValue(KEYS.aiEnabled);
    const aiEnabled = normalizeBoolean(aiEnabledRaw, true);

    const aiSendExifRaw = await this.#getValue(KEYS.aiSendExif);
    const aiSendExif = normalizeBoolean(aiSendExifRaw, false);

    const lmStudioBaseUrlRaw = await this.#getValue(KEYS.lmStudioBaseUrl);
    const lmStudioBaseUrl = normalizeBaseUrl(lmStudioBaseUrlRaw) || (cfg?.lmStudio?.baseUrl || 'http://127.0.0.1:1234');

    const lmStudioModelRaw = await this.#getValue(KEYS.lmStudioModel);
    const lmStudioModel = (typeof lmStudioModelRaw === 'string' ? lmStudioModelRaw : lmStudioModelRaw?.id || lmStudioModelRaw?.model || null);

    const locationInterpolationMaxMinutesRaw = await this.#getValue(KEYS.locationInterpolationMaxMinutes);
    const locationInterpolationMaxMinutes = normalizeInt(locationInterpolationMaxMinutesRaw, {
      defaultValue: 30,
      min: 1,
      max: 24 * 60,
    });

    return {
      homeLat,
      homeLng,
      homeAutoUpdate: !!autoUpdate,
      aiEnabled: !!aiEnabled,
      aiSendExif: !!aiSendExif,
      lmStudioBaseUrl: String(lmStudioBaseUrl || '').replace(/\/$/, ''),
      lmStudioModel: lmStudioModel ? String(lmStudioModel) : null,
      locationInterpolationMaxMinutes,
    };
  }

  async updateProjectSettings(
    { homeLat, homeLng, homeAutoUpdate, aiEnabled, aiSendExif, lmStudioBaseUrl, lmStudioModel, locationInterpolationMaxMinutes } = {},
    updatedBy
  ) {
    if (homeAutoUpdate !== undefined) {
      await this.#setValue(KEYS.homeAutoUpdate, !!homeAutoUpdate, updatedBy);
    }

    if (aiEnabled !== undefined) {
      await this.#setValue(KEYS.aiEnabled, !!aiEnabled, updatedBy);
    }

    if (aiSendExif !== undefined) {
      await this.#setValue(KEYS.aiSendExif, !!aiSendExif, updatedBy);
    }

    if (lmStudioBaseUrl !== undefined) {
      const normalized = normalizeBaseUrl(lmStudioBaseUrl);
      await this.#setValue(KEYS.lmStudioBaseUrl, normalized, updatedBy);
    }

    if (lmStudioModel !== undefined) {
      const next = lmStudioModel == null ? null : String(lmStudioModel).trim();
      await this.#setValue(KEYS.lmStudioModel, next || null, updatedBy);
    }

    if (locationInterpolationMaxMinutes !== undefined) {
      const next = normalizeInt(locationInterpolationMaxMinutes, { defaultValue: 30, min: 1, max: 24 * 60 });
      await this.#setValue(KEYS.locationInterpolationMaxMinutes, next, updatedBy);
    }

    const hasLat = homeLat !== undefined && homeLat !== null;
    const hasLng = homeLng !== undefined && homeLng !== null;

    if (hasLat || hasLng) {
      if (!(hasLat && hasLng)) {
        throw new Error('Both homeLat and homeLng must be provided together');
      }
      const lat = Number(homeLat);
      const lng = Number(homeLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('homeLat/homeLng must be valid numbers');
      }
      await this.#setValue(KEYS.homeLocation, { lat, lng }, updatedBy);
    }

    return await this.getProjectSettings({ recomputeIfAutoUpdate: true });
  }

  async recalculateProjectHomeLocation(updatedBy = null) {
    const computed = await this.computeHomeLocation();
    if (computed) {
      await this.#setValue(KEYS.homeLocation, computed, updatedBy);
    }
    return await this.getProjectSettings({ recomputeIfAutoUpdate: false });
  }
}
