import { logger } from '../utils/logger.js';

export class EntityLinkService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async createEntityLink({
    fromEntityId,
    toEntityId,
    relationType,
    confidence = 1.0,
    notes,
    createdBy,
    metadata
  }) {
    if (!fromEntityId || !toEntityId) {
      throw new Error('fromEntityId and toEntityId are required');
    }
    if (!relationType) {
      throw new Error('relationType is required');
    }

    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        `
          INSERT INTO entity_links (
            from_entity,
            to_entity,
            relation_type,
            confidence,
            notes,
            created_by,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [
          fromEntityId,
          toEntityId,
          relationType,
          confidence ?? 1.0,
          notes || null,
          createdBy || null,
          JSON.stringify(metadata || {})
        ]
      );

      return this.formatEntityLink(result.rows[0]);
    } catch (error) {
      logger.error('Error creating entity link:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteEntityLink(linkId) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        `
          DELETE FROM entity_links
          WHERE id = $1
          RETURNING id
        `,
        [linkId]
      );

      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  async getEntityLinksByEntity(entityId, { limit = 100, offset = 0 } = {}) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        `
          SELECT *
          FROM entity_links
          WHERE from_entity = $1 OR to_entity = $1
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [entityId, limit, offset]
      );

      return result.rows.map((row) => this.formatEntityLink(row));
    } finally {
      client.release();
    }
  }

  formatEntityLink(row) {
    return {
      id: row.id,
      fromEntityId: row.from_entity,
      toEntityId: row.to_entity,
      relationType: row.relation_type,
      confidence: row.confidence !== null && row.confidence !== undefined ? parseFloat(row.confidence) : null,
      notes: row.notes,
      createdAt: row.created_at?.toISOString(),
      createdBy: row.created_by,
      metadata: row.metadata || {}
    };
  }
}
