import { logger } from '../utils/logger.js';

export class AnnotationService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async createAnnotation(assetId, createdBy, { title, description, tags, metadata }) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Create annotation
      const annotationQuery = `
        INSERT INTO annotations (asset_id, created_by, title, description, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const annotationResult = await client.query(annotationQuery, [
        assetId,
        createdBy,
        title,
        description,
        JSON.stringify(metadata || {})
      ]);
      const annotation = annotationResult.rows[0];

      // Add tags if provided
      if (tags && tags.length > 0) {
        await this.addTags(client, annotation.id, tags);
      }

      // Log creation
      await this.logChange(client, annotation.id, createdBy, 'CREATE', null, annotation);

      await client.query('COMMIT');
      return await this.getAnnotationById(annotation.id);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating annotation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAnnotation(annotationId, updatedBy, { title, description, tags, metadata }) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Get previous state for history
      const previous = await this.getAnnotationById(annotationId);

      // Update annotation
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        values.push(title);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(description);
      }
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(metadata));
      }
      updates.push(`updated_at = NOW()`);
      values.push(annotationId);

      if (updates.length > 0) {
        const updateQuery = `
          UPDATE annotations
          SET ${updates.join(', ')}
          WHERE id = $${paramIndex}
          RETURNING *
        `;
        await client.query(updateQuery, values);
      }

      // Update tags if provided
      if (tags !== undefined) {
        await client.query('DELETE FROM annotation_tags WHERE annotation_id = $1', [annotationId]);
        if (tags.length > 0) {
          await this.addTags(client, annotationId, tags);
        }
      }

      // Get updated state
      const updated = await this.getAnnotationById(annotationId);

      // Log change
      await this.logChange(client, annotationId, updatedBy, 'UPDATE', previous, updated);

      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating annotation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAnnotation(annotationId, deletedBy) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Get annotation for history
      const annotation = await this.getAnnotationById(annotationId);

      // Log deletion
      await this.logChange(client, annotationId, deletedBy, 'DELETE', annotation, null);

      // Delete annotation (cascade will handle regions, tags, etc.)
      await client.query('DELETE FROM annotations WHERE id = $1', [annotationId]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error deleting annotation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async addRegion(annotationId, { shapeType, coordinates, style }) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        INSERT INTO annotation_regions (annotation_id, shape_type, coordinates, style)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const result = await client.query(query, [
        annotationId,
        shapeType.toLowerCase(),
        JSON.stringify(coordinates),
        JSON.stringify(style || { color: '#ff0000', strokeWidth: 2 })
      ]);
      
      // Update annotation timestamp
      await client.query('UPDATE annotations SET updated_at = NOW() WHERE id = $1', [annotationId]);
      
      return this.formatRegion(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async updateRegion(regionId, { coordinates, style }) {
    const client = await this.dbPool.connect();
    try {
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (coordinates !== undefined) {
        updates.push(`coordinates = $${paramIndex++}`);
        values.push(JSON.stringify(coordinates));
      }
      if (style !== undefined) {
        updates.push(`style = $${paramIndex++}`);
        values.push(JSON.stringify(style));
      }
      values.push(regionId);

      if (updates.length === 0) {
        throw new Error('No updates provided');
      }

      const query = `
        UPDATE annotation_regions
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Region not found');
      }
      
      // Update annotation timestamp
      await client.query(
        'UPDATE annotations SET updated_at = NOW() WHERE id = (SELECT annotation_id FROM annotation_regions WHERE id = $1)',
        [regionId]
      );
      
      return this.formatRegion(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async deleteRegion(regionId) {
    const client = await this.dbPool.connect();
    try {
      // Get annotation_id before deletion
      const annotationResult = await client.query(
        'SELECT annotation_id FROM annotation_regions WHERE id = $1',
        [regionId]
      );
      
      if (annotationResult.rows.length === 0) {
        throw new Error('Region not found');
      }
      
      const annotationId = annotationResult.rows[0].annotation_id;
      
      // Delete region
      await client.query('DELETE FROM annotation_regions WHERE id = $1', [regionId]);
      
      // Update annotation timestamp
      await client.query('UPDATE annotations SET updated_at = NOW() WHERE id = $1', [annotationId]);
      
      return true;
    } finally {
      client.release();
    }
  }

  async getAnnotationById(annotationId) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        SELECT a.*,
               array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as tags
        FROM annotations a
        LEFT JOIN annotation_tags at ON a.id = at.annotation_id
        LEFT JOIN tags t ON at.tag_id = t.id
        WHERE a.id = $1
        GROUP BY a.id
      `;
      const result = await client.query(query, [annotationId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.formatAnnotation(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getAnnotationsByAssetId(assetId) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        SELECT a.*,
               array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as tags
        FROM annotations a
        LEFT JOIN annotation_tags at ON a.id = at.annotation_id
        LEFT JOIN tags t ON at.tag_id = t.id
        WHERE a.asset_id = $1
        GROUP BY a.id
        ORDER BY a.created_at DESC
      `;
      const result = await client.query(query, [assetId]);
      return result.rows.map(row => this.formatAnnotation(row));
    } finally {
      client.release();
    }
  }

  async getRegionsByAnnotationId(annotationId) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        SELECT * FROM annotation_regions
        WHERE annotation_id = $1
        ORDER BY created_at ASC
      `;
      const result = await client.query(query, [annotationId]);
      return result.rows.map(row => this.formatRegion(row));
    } finally {
      client.release();
    }
  }

  async getEntityLinksByAnnotationId(annotationId) {
    const client = await this.dbPool.connect();
    try {
      const query = `
        SELECT * FROM annotation_entity_links
        WHERE annotation_id = $1
        ORDER BY created_at ASC
      `;
      const result = await client.query(query, [annotationId]);
      return result.rows.map(row => this.formatEntityLink(row));
    } finally {
      client.release();
    }
  }

  async addTags(client, annotationId, tags) {
    for (const tagName of tags) {
      // Parse tag (format: "type:value" or just "value")
      const parts = tagName.split(':');
      const type = parts.length > 1 ? parts[0] : 'general';
      const value = parts.length > 1 ? parts[1] : parts[0];

      // Get or create tag
      const tagQuery = `
        INSERT INTO tags (type, value)
        VALUES ($1, $2)
        ON CONFLICT (type, value) DO UPDATE SET type = $1
        RETURNING id
      `;
      const tagResult = await client.query(tagQuery, [type, value]);
      const tagId = tagResult.rows[0].id;

      // Link tag to annotation
      await client.query(
        'INSERT INTO annotation_tags (annotation_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [annotationId, tagId]
      );
    }
  }

  async logChange(client, annotationId, changedBy, changeType, previousValue, newValue) {
    const query = `
      INSERT INTO annotation_history (annotation_id, changed_by, change_type, previous_value, new_value)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await client.query(query, [
      annotationId,
      changedBy,
      changeType,
      JSON.stringify(previousValue),
      JSON.stringify(newValue)
    ]);
  }

  formatAnnotation(row) {
    return {
      id: row.id,
      assetId: row.asset_id,
      createdBy: row.created_by,
      title: row.title,
      description: row.description,
      tags: row.tags || [],
      createdAt: row.created_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
      metadata: row.metadata || {}
    };
  }

  formatRegion(row) {
    return {
      id: row.id,
      annotationId: row.annotation_id,
      shapeType: row.shape_type.toUpperCase(),
      coordinates: row.coordinates,
      style: row.style,
      createdAt: row.created_at?.toISOString()
    };
  }

  formatEntityLink(row) {
    return {
      id: row.id,
      annotationId: row.annotation_id,
      entityId: row.entity_id,
      relationType: row.relation_type,
      confidence: row.confidence ? parseFloat(row.confidence) : null,
      notes: row.notes,
      createdAt: row.created_at?.toISOString()
    };
  }
}
