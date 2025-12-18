import { logger } from '../utils/logger.js';

export class PresenceService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async deletePresence(presenceId) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      const presenceRes = await client.query(
        `SELECT id, source_asset, source_type FROM presences WHERE id = $1`,
        [presenceId]
      );
      if (presenceRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const presence = presenceRes.rows[0];
      const sourceAssetId = presence.source_asset;
      const sourceType = presence.source_type;

      const entityRes = await client.query(
        `SELECT entity_id FROM presence_entities WHERE presence_id = $1`,
        [presenceId]
      );
      const entityIds = entityRes.rows.map((r) => r.entity_id).filter(Boolean).map((x) => String(x));

      // If this is an auto-presence generated from annotation entity links, treat deletion as “ignore”
      // so it won't be recreated by subsequent sync.
      if (sourceAssetId && sourceType === 'annotation_entity_link' && entityIds.length > 0) {
        const assetMetaRes = await client.query(
          `SELECT COALESCE(metadata, '{}'::jsonb) as metadata FROM assets WHERE id = $1`,
          [sourceAssetId]
        );
        if (assetMetaRes.rows.length > 0) {
          const metadata = assetMetaRes.rows[0].metadata || {};
          const existing = Array.isArray(metadata?.autoPresenceIgnoreEntityIds)
            ? metadata.autoPresenceIgnoreEntityIds.map((x) => String(x))
            : [];
          const merged = Array.from(new Set([...existing, ...entityIds]));

          await client.query(
            `UPDATE assets
             SET metadata = jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{autoPresenceIgnoreEntityIds}',
               $2::jsonb,
               true
             )
             WHERE id = $1`,
            [sourceAssetId, JSON.stringify(merged)]
          );
        }
      }

      await client.query(`DELETE FROM presences WHERE id = $1`, [presenceId]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deleting presence:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getPresenceById(presenceId) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        `
          SELECT p.*, ST_Y(p.geom) as latitude, ST_X(p.geom) as longitude
          FROM presences p
          WHERE p.id = $1
        `,
        [presenceId]
      );

      if (result.rows.length === 0) return null;
      return this.formatPresence(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getPresencesByEntity(entityId, { limit = 50, offset = 0 } = {}) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        `
          WITH connected_entities AS (
            SELECT $1::uuid AS id
            UNION
            SELECT el.from_entity AS id
            FROM entity_links el
            WHERE el.to_entity = $1::uuid
            UNION
            SELECT el.to_entity AS id
            FROM entity_links el
            WHERE el.from_entity = $1::uuid
          )
          SELECT p.*, ST_Y(p.geom) as latitude, ST_X(p.geom) as longitude
          FROM presences p
          JOIN presence_entities pe ON pe.presence_id = p.id
          WHERE pe.entity_id IN (SELECT id FROM connected_entities)
          ORDER BY p.observed_at DESC
          LIMIT $2 OFFSET $3
        `,
        [entityId, limit, offset]
      );

      return result.rows.map((row) => this.formatPresence(row));
    } finally {
      client.release();
    }
  }

  async getPresences({ before, after, limit = 200, offset = 0 } = {}) {
    const client = await this.dbPool.connect();
    try {
      const conditions = [];
      const values = [];
      let idx = 1;

      if (before) {
        conditions.push(`p.observed_at <= $${idx++}`);
        values.push(new Date(before));
      }
      if (after) {
        conditions.push(`p.observed_at >= $${idx++}`);
        values.push(new Date(after));
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      values.push(limit);
      values.push(offset);

      const result = await client.query(
        `
          SELECT p.*, ST_Y(p.geom) as latitude, ST_X(p.geom) as longitude
          FROM presences p
          ${where}
          ORDER BY p.observed_at DESC
          LIMIT $${idx++} OFFSET $${idx++}
        `,
        values
      );

      return result.rows.map((row) => this.formatPresence(row));
    } finally {
      client.release();
    }
  }

  async getPresenceEntities(presenceId) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        `
          SELECT presence_id, entity_id, role, confidence
          FROM presence_entities
          WHERE presence_id = $1
          ORDER BY entity_id ASC
        `,
        [presenceId]
      );

      return result.rows.map((row) => this.formatPresenceEntity(row));
    } finally {
      client.release();
    }
  }

  async createPresence({
    observedAt,
    observedBy,
    sourceAssetId,
    sourceType,
    latitude,
    longitude,
    notes,
    metadata,
    entities
  }) {
    if (!observedAt) {
      throw new Error('observedAt is required');
    }
    if (!entities || entities.length === 0) {
      throw new Error('At least one entity is required');
    }

    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      const hasPoint = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined;
      const geomClause = hasPoint ? 'ST_SetSRID(ST_MakePoint($5, $6), 4326)' : 'NULL';

      const presenceInsert = await client.query(
        `
          INSERT INTO presences (
            observed_at,
            observed_by,
            source_asset,
            source_type,
            geom,
            notes,
            metadata
          ) VALUES (
            $1, $2, $3, $4, ${geomClause}, $7, $8
          )
          RETURNING id
        `,
        [
          new Date(observedAt),
          observedBy || null,
          sourceAssetId || null,
          sourceType || null,
          hasPoint ? longitude : null,
          hasPoint ? latitude : null,
          notes || null,
          JSON.stringify(metadata || {})
        ]
      );

      const presenceId = presenceInsert.rows[0].id;

      for (const entity of entities) {
        await client.query(
          `
            INSERT INTO presence_entities (presence_id, entity_id, role, confidence)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (presence_id, entity_id) DO NOTHING
          `,
          [
            presenceId,
            entity.entityId,
            entity.role || null,
            entity.confidence !== undefined && entity.confidence !== null ? entity.confidence : 1.0
          ]
        );
      }

      await client.query('COMMIT');
      return await this.getPresenceById(presenceId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating presence:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  formatPresence(row) {
    return {
      id: row.id,
      observedAt: row.observed_at?.toISOString(),
      observedBy: row.observed_by,
      sourceAssetId: row.source_asset,
      sourceType: row.source_type,
      latitude: row.latitude !== null && row.latitude !== undefined ? parseFloat(row.latitude) : null,
      longitude: row.longitude !== null && row.longitude !== undefined ? parseFloat(row.longitude) : null,
      notes: row.notes,
      metadata: row.metadata || {},
      createdAt: row.created_at?.toISOString()
    };
  }

  formatPresenceEntity(row) {
    return {
      presenceId: row.presence_id,
      entityId: row.entity_id,
      role: row.role,
      confidence: row.confidence !== null && row.confidence !== undefined ? parseFloat(row.confidence) : null
    };
  }
}
