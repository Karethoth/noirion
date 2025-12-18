import { logger } from '../utils/logger.js';

export class EntityService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  /**
   * Find an entity by a specific tag (type/value), optionally constrained by entityType.
   * Returns the full formatted entity or null.
   */
  async findEntityByTag({ entityType = null, tagType, tagValue }) {
    const client = await this.dbPool.connect();
    try {
      const conditions = ['t.type = $1', 't.value = $2'];
      const values = [tagType, tagValue];
      let paramIndex = 3;

      if (entityType) {
        conditions.push(`e.entity_type = $${paramIndex++}`);
        values.push(entityType);
      }

      const { rows } = await client.query(
        `
          SELECT e.id
          FROM entities e
          JOIN entity_tags et ON et.entity_id = e.id
          JOIN tags t ON t.id = et.tag_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY e.created_at DESC
          LIMIT 1
        `,
        values
      );

      const id = rows[0]?.id;
      if (!id) return null;
      return await this.getEntityById(id);
    } finally {
      client.release();
    }
  }

  /**
   * Create a new entity
   */
  async createEntity({ entityType, displayName, tags, metadata }) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Create entity
      const entityQuery = `
        INSERT INTO entities (entity_type, display_name, metadata)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const entityResult = await client.query(entityQuery, [
        entityType,
        displayName,
        JSON.stringify(metadata || {})
      ]);
      const entity = entityResult.rows[0];

      // Add tags if provided
      if (tags && tags.length > 0) {
        await this.addTags(client, entity.id, tags);
      }

      await client.query('COMMIT');
      return await this.getEntityById(entity.id);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating entity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an existing entity
   */
  async updateEntity(entityId, { displayName, tags, metadata }) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (displayName !== undefined) {
        updates.push(`display_name = $${paramIndex++}`);
        values.push(displayName);
      }
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(metadata));
      }
      updates.push(`updated_at = NOW()`);
      values.push(entityId);

      if (updates.length > 1) { // More than just updated_at
        const updateQuery = `
          UPDATE entities
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
        `;
        await client.query(updateQuery, values);
      }

      // Update tags if provided
      if (tags !== undefined) {
        await client.query('DELETE FROM entity_tags WHERE entity_id = $1', [entityId]);
        if (tags.length > 0) {
          await this.addTags(client, entityId, tags);
        }
      }

      await client.query('COMMIT');
      return await this.getEntityById(entityId);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating entity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete an entity
   */
  async deleteEntity(entityId) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Delete entity (cascade will handle attributes, tags, etc.)
      const result = await client.query('DELETE FROM entities WHERE id = $1', [entityId]);

      await client.query('COMMIT');
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deleting entity:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get entity by ID
   */
  async getEntityById(entityId) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        SELECT * FROM entities WHERE id = $1
      `;
      const result = await client.query(query, [entityId]);

      if (result.rows.length === 0) {
        return null;
      }

      const entity = result.rows[0];

      // Get attributes
      entity.attributes = await this.getEntityAttributes(entityId);

      // Get tags
      entity.tags = await this.getEntityTags(entityId);

      return this.formatEntity(entity);
    } finally {
      client.release();
    }
  }

  /**
   * Get all entities with optional filtering
   */
  async getEntities({ entityType, limit = 100, offset = 0 }) {
    const client = await this.dbPool.connect();
    try {
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      if (entityType) {
        conditions.push(`entity_type = $${paramIndex++}`);
        values.push(entityType);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT * FROM entities
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);
      const result = await client.query(query, values);

      // Get attributes and tags for all entities
      const entities = await Promise.all(
        result.rows.map(async (entity) => {
          entity.attributes = await this.getEntityAttributes(entity.id);
          entity.tags = await this.getEntityTags(entity.id);
          return this.formatEntity(entity);
        })
      );

      return entities;
    } finally {
      client.release();
    }
  }

  /**
   * Search entities by display name
   */
  async searchEntities(query, { entityType, limit = 50 }) {
    const client = await this.dbPool.connect();
    try {
      const conditions = ['display_name ILIKE $1'];
      const values = [`%${query}%`];
      let paramIndex = 2;

      if (entityType) {
        conditions.push(`entity_type = $${paramIndex++}`);
        values.push(entityType);
      }

      values.push(limit);

      const searchQuery = `
        SELECT * FROM entities
        WHERE ${conditions.join(' AND ')}
        ORDER BY display_name ASC
        LIMIT $${paramIndex}
      `;

      const result = await client.query(searchQuery, values);

      const entities = await Promise.all(
        result.rows.map(async (entity) => {
          entity.attributes = await this.getEntityAttributes(entity.id);
          entity.tags = await this.getEntityTags(entity.id);
          return this.formatEntity(entity);
        })
      );

      return entities;
    } finally {
      client.release();
    }
  }

  /**
   * Add an attribute to an entity
   */
  async addEntityAttribute(entityId, { attributeName, attributeValue, confidence = 1.0 }) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        INSERT INTO entity_attributes (entity_id, attribute_name, attribute_value, confidence)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const result = await client.query(query, [
        entityId,
        attributeName,
        JSON.stringify(attributeValue),
        confidence
      ]);

      // Update entity timestamp
      await client.query('UPDATE entities SET updated_at = NOW() WHERE id = $1', [entityId]);

      return this.formatAttribute(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Update an entity attribute
   */
  async updateEntityAttribute(attributeId, { attributeName, attributeValue, confidence }) {
    const client = await this.dbPool.connect();
    try {
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (attributeName !== undefined) {
        updates.push(`attribute_name = $${paramIndex++}`);
        values.push(attributeName);
      }
      if (attributeValue !== undefined) {
        updates.push(`attribute_value = $${paramIndex++}`);
        values.push(JSON.stringify(attributeValue));
      }
      if (confidence !== undefined) {
        updates.push(`confidence = $${paramIndex++}`);
        values.push(confidence);
      }
      updates.push(`updated_at = NOW()`);
      values.push(attributeId);

      if (updates.length <= 1) { // Only updated_at
        throw new Error('No updates provided');
      }

      const query = `
        UPDATE entity_attributes
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Attribute not found');
      }

      // Update entity timestamp
      await client.query(
        'UPDATE entities SET updated_at = NOW() WHERE id = (SELECT entity_id FROM entity_attributes WHERE id = $1)',
        [attributeId]
      );

      return this.formatAttribute(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Delete an entity attribute
   */
  async deleteEntityAttribute(attributeId) {
    const client = await this.dbPool.connect();
    try {
      // Update entity timestamp first
      await client.query(
        'UPDATE entities SET updated_at = NOW() WHERE id = (SELECT entity_id FROM entity_attributes WHERE id = $1)',
        [attributeId]
      );

      const result = await client.query('DELETE FROM entity_attributes WHERE id = $1', [attributeId]);
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Get all attributes for an entity
   */
  async getEntityAttributes(entityId) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        SELECT * FROM entity_attributes
        WHERE entity_id = $1
        ORDER BY created_at ASC
      `;
      const result = await client.query(query, [entityId]);
      return result.rows.map(attr => this.formatAttribute(attr));
    } finally {
      client.release();
    }
  }

  /**
   * Get all tags for an entity
   */
  async getEntityTags(entityId) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        SELECT t.name FROM tags t
        JOIN entity_tags et ON et.tag_id = t.id
        WHERE et.entity_id = $1
      `;
      const result = await client.query(query, [entityId]);
      return result.rows.map(row => row.name);
    } finally {
      client.release();
    }
  }

  /**
   * Add tags to an entity
   */
  async addTags(client, entityId, tags) {
    for (const tag of tags) {
      // Parse tag (format: "type:value" or just "value")
      const [type, value] = tag.includes(':')
        ? tag.split(':', 2)
        : ['general', tag];

      // Insert or get tag
      const tagQuery = `
        INSERT INTO tags (type, value)
        VALUES ($1, $2)
        ON CONFLICT (type, value) DO UPDATE SET type = EXCLUDED.type
        RETURNING id
      `;
      const tagResult = await client.query(tagQuery, [type, value]);
      const tagId = tagResult.rows[0].id;

      // Link tag to entity
      await client.query(
        'INSERT INTO entity_tags (entity_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [entityId, tagId]
      );
    }
  }

  /**
   * Format entity for GraphQL response
   */
  formatEntity(entity) {
    return {
      id: entity.id,
      entityType: entity.entity_type,
      displayName: entity.display_name,
      attributes: entity.attributes || [],
      tags: entity.tags || [],
      metadata: entity.metadata,
      createdAt: entity.created_at,
      updatedAt: entity.updated_at
    };
  }

  /**
   * Format attribute for GraphQL response
   */
  formatAttribute(attribute) {
    return {
      id: attribute.id,
      entityId: attribute.entity_id,
      attributeName: attribute.attribute_name,
      attributeValue: attribute.attribute_value,
      confidence: parseFloat(attribute.confidence),
      createdAt: attribute.created_at,
      updatedAt: attribute.updated_at
    };
  }
}
