import { logger } from '../utils/logger.js';

export class PresenceService {
  constructor(dbPool) {
    this.dbPool = dbPool;
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
          SELECT p.*, ST_Y(p.geom) as latitude, ST_X(p.geom) as longitude
          FROM presences p
          JOIN presence_entities pe ON pe.presence_id = p.id
          WHERE pe.entity_id = $1
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
