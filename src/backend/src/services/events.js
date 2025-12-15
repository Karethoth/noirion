import { logger } from '../utils/logger.js';

export class EventsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async createEvent({ occurredAt, latitude, longitude, title, description, createdBy, metadata }) {
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

      return this.formatEvent(result.rows[0]);
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

  async updateEvent(eventId, { occurredAt, latitude, longitude, title, description, metadata }) {
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

      return this.formatEvent(result.rows[0]);
    } catch (error) {
      logger.error('Error updating event:', error);
      throw error;
    } finally {
      client.release();
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
