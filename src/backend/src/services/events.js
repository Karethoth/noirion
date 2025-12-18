import { logger } from '../utils/logger.js';

export class EventsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async createEvent({ occurredAt, latitude, longitude, title, description, createdBy, metadata, entities }) {
    if (!occurredAt) throw new Error('occurredAt is required');
    if (!title) throw new Error('title is required');

    const client = await this.dbPool.connect();
    try {
      const hasPoint = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined;
      const geomClause = hasPoint ? 'ST_SetSRID(ST_MakePoint($2, $3), 4326)' : 'NULL';

      const result = await client.query(
        `
          INSERT INTO events (
            occurred_at,
            geom,
            title,
            description,
            created_by,
            metadata
          ) VALUES (
            $1, ${geomClause}, $4, $5, $6, $7
          )
          RETURNING *, ST_Y(geom) as latitude, ST_X(geom) as longitude
        `,
        [
          new Date(occurredAt),
          hasPoint ? longitude : null,
          hasPoint ? latitude : null,
          title,
          description || null,
          createdBy || null,
          JSON.stringify(metadata || {})
        ]
      );

      const created = this.formatEvent(result.rows[0]);

      if (Array.isArray(entities) && entities.length > 0) {
        await this.replaceEventEntities(client, created.id, entities);
      }

      return created;
    } catch (error) {
      logger.error('Error creating event:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteEvent(eventId) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        'DELETE FROM events WHERE id = $1 RETURNING id',
        [eventId]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  async updateEvent(eventId, { occurredAt, latitude, longitude, title, description, metadata, entities }) {
    if (!eventId) throw new Error('eventId is required');
    if (!occurredAt) throw new Error('occurredAt is required');
    if (!title) throw new Error('title is required');

    const client = await this.dbPool.connect();
    try {
      const hasPoint = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined;

      const metadataValue = metadata === undefined ? null : JSON.stringify(metadata || {});
      const geomClause = hasPoint ? 'ST_SetSRID(ST_MakePoint($3, $4), 4326)' : 'NULL';

      const result = await client.query(
        `
          UPDATE events
          SET
            occurred_at = $2,
            geom = ${geomClause},
            title = $5,
            description = $6,
            metadata = COALESCE($7::jsonb, metadata)
          WHERE id = $1
          RETURNING *, ST_Y(geom) as latitude, ST_X(geom) as longitude
        `,
        [
          eventId,
          new Date(occurredAt),
          hasPoint ? longitude : null,
          hasPoint ? latitude : null,
          title,
          description || null,
          metadataValue
        ]
      );

      if (result.rows.length === 0) {
        throw new Error('Event not found');
      }

      const updated = this.formatEvent(result.rows[0]);

      // Only update entity links when explicitly provided
      if (entities !== undefined) {
        await this.replaceEventEntities(client, updated.id, Array.isArray(entities) ? entities : []);
      }

      return updated;
    } catch (error) {
      logger.error('Error updating event:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getEventEntities(eventId) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(
        `
          SELECT event_id, entity_id, role, confidence
          FROM event_entities
          WHERE event_id = $1
          ORDER BY entity_id ASC
        `,
        [eventId]
      );

      return result.rows.map((row) => ({
        eventId: row.event_id,
        entityId: row.entity_id,
        role: row.role,
        confidence: row.confidence != null ? parseFloat(row.confidence) : null,
      }));
    } catch (error) {
      // Backward-compatible behavior if DB migration hasn't been applied yet.
      // In that case, treat as "no entity links" rather than failing the whole query.
      if (error?.code === '42P01' || /event_entities.*does not exist/i.test(error?.message || '')) {
        logger.warn('event_entities table missing; returning empty Event.entities', {
          eventId,
          code: error?.code,
          message: error?.message
        });
        return [];
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceEventEntities(client, eventId, entities) {
    await client.query('DELETE FROM event_entities WHERE event_id = $1', [eventId]);

    for (const link of entities) {
      if (!link?.entityId) continue;
      const role = link.role || null;
      const confidence = link.confidence ?? 1.0;

      await client.query(
        `
          INSERT INTO event_entities (event_id, entity_id, role, confidence)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (event_id, entity_id) DO UPDATE
          SET role = EXCLUDED.role,
              confidence = EXCLUDED.confidence
        `,
        [eventId, link.entityId, role, confidence]
      );
    }
  }

  async getEvents({ before, after, limit = 200, offset = 0 } = {}) {
    const client = await this.dbPool.connect();
    try {
      const conditions = [];
      const values = [];
      let idx = 1;

      if (before) {
        conditions.push(`occurred_at <= $${idx++}`);
        values.push(new Date(before));
      }
      if (after) {
        conditions.push(`occurred_at >= $${idx++}`);
        values.push(new Date(after));
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      values.push(limit);
      values.push(offset);

      const result = await client.query(
        `
          SELECT *, ST_Y(geom) as latitude, ST_X(geom) as longitude
          FROM events
          ${where}
          ORDER BY occurred_at DESC
          LIMIT $${idx++} OFFSET $${idx++}
        `,
        values
      );

      return result.rows.map((row) => this.formatEvent(row));
    } finally {
      client.release();
    }
  }

  async getEventsByEntity(entityId, { before, after, limit = 200, offset = 0 } = {}) {
    if (!entityId) throw new Error('entityId is required');

    const client = await this.dbPool.connect();
    try {
      const conditions = ['ee.entity_id = $1'];
      const values = [entityId];
      let idx = 2;

      if (before) {
        conditions.push(`e.occurred_at <= $${idx++}`);
        values.push(new Date(before));
      }
      if (after) {
        conditions.push(`e.occurred_at >= $${idx++}`);
        values.push(new Date(after));
      }

      values.push(limit);
      values.push(offset);

      const where = `WHERE ${conditions.join(' AND ')}`;

      const result = await client.query(
        `
          SELECT e.*, ST_Y(e.geom) as latitude, ST_X(e.geom) as longitude
          FROM event_entities ee
          JOIN events e ON e.id = ee.event_id
          ${where}
          ORDER BY e.occurred_at DESC
          LIMIT $${idx++} OFFSET $${idx++}
        `,
        values
      );

      return result.rows.map((row) => this.formatEvent(row));
    } catch (error) {
      // Backward-compatible behavior if DB migration hasn't been applied yet.
      if (error?.code === '42P01' || /event_entities.*does not exist/i.test(error?.message || '')) {
        logger.warn('event_entities table missing; returning empty eventsByEntity', {
          entityId,
          code: error?.code,
          message: error?.message
        });
        return [];
      }
      throw error;
    } finally {
      client.release();
    }
  }

  formatEvent(row) {
    return {
      id: row.id,
      occurredAt: row.occurred_at?.toISOString(),
      latitude: row.latitude !== null && row.latitude !== undefined ? parseFloat(row.latitude) : null,
      longitude: row.longitude !== null && row.longitude !== undefined ? parseFloat(row.longitude) : null,
      title: row.title,
      description: row.description,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString(),
      metadata: row.metadata || {}
    };
  }
}
