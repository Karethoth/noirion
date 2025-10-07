import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AnnotationService } from '../src/services/annotations.js';

describe('AnnotationService', () => {
  let annotationService;
  let mockDbPool;
  let mockClient;

  beforeEach(() => {
    // Mock database client
    mockClient = {
      query: vi.fn(),
      release: vi.fn()
    };

    // Mock database pool
    mockDbPool = {
      connect: vi.fn().mockResolvedValue(mockClient)
    };

    annotationService = new AnnotationService(mockDbPool);
  });

  describe('createAnnotation', () => {
    test('should create annotation with tags', async () => {
      const mockAnnotation = {
        id: 1,
        asset_id: 100,
        created_by: 1,
        title: 'Test Annotation',
        description: 'Test description',
        metadata: {},
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockTag = { id: 1 };
      
      // Mock transaction and queries
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockAnnotation] }) // INSERT annotation
        .mockResolvedValueOnce({ rows: [mockTag] }) // INSERT tag
        .mockResolvedValueOnce({ rows: [] }) // INSERT annotation_tags
        .mockResolvedValueOnce({ rows: [] }) // INSERT history
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [{ ...mockAnnotation, tags: ['person:John'] }] }); // getAnnotationById

      const result = await annotationService.createAnnotation(100, 1, {
        title: 'Test Annotation',
        description: 'Test description',
        tags: ['person:John']
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Annotation');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(
        annotationService.createAnnotation(100, 1, { title: 'Test' })
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('updateAnnotation', () => {
    test('should update annotation fields', async () => {
      const mockPrevious = {
        id: 1,
        asset_id: 100,
        title: 'Old Title',
        description: 'Old description',
        tags: [],
        metadata: {}
      };

      const mockUpdated = {
        id: 1,
        asset_id: 100,
        title: 'New Title',
        description: 'New description',
        tags: ['updated:tag'],
        metadata: {}
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ ...mockPrevious, tags: [], created_at: new Date(), updated_at: new Date() }] }) // getAnnotationById (previous)
        .mockResolvedValueOnce({ rows: [mockUpdated] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // DELETE tags
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT tag
        .mockResolvedValueOnce({ rows: [] }) // INSERT annotation_tags
        .mockResolvedValueOnce({ rows: [{ ...mockUpdated, created_at: new Date(), updated_at: new Date() }] }) // getAnnotationById (updated)
        .mockResolvedValueOnce({ rows: [] }) // INSERT history
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await annotationService.updateAnnotation(1, 1, {
        title: 'New Title',
        description: 'New description',
        tags: ['updated:tag']
      });

      expect(result.title).toBe('New Title');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should handle partial updates', async () => {
      const mockAnnotation = {
        id: 1,
        title: 'Updated Title',
        tags: [],
        created_at: new Date(),
        updated_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockAnnotation] }) // getAnnotationById (previous)
        .mockResolvedValueOnce({ rows: [mockAnnotation] }) // UPDATE
        .mockResolvedValueOnce({ rows: [mockAnnotation] }) // getAnnotationById (updated)
        .mockResolvedValueOnce({ rows: [] }) // INSERT history
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await annotationService.updateAnnotation(1, 1, {
        title: 'Updated Title'
      });

      expect(result.title).toBe('Updated Title');
    });
  });

  describe('deleteAnnotation', () => {
    test('should delete annotation and log history', async () => {
      const mockAnnotation = {
        id: 1,
        title: 'To Delete',
        tags: [],
        created_at: new Date(),
        updated_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockAnnotation] }) // getAnnotationById
        .mockResolvedValueOnce({ rows: [] }) // INSERT history
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await annotationService.deleteAnnotation(1, 1);

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('addRegion', () => {
    test('should add box region to annotation', async () => {
      const mockRegion = {
        id: 1,
        annotation_id: 1,
        shape_type: 'box',
        coordinates: { x: 10, y: 20, width: 100, height: 50 },
        style: { color: '#ff0000', strokeWidth: 2 },
        created_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockRegion] }) // INSERT region
        .mockResolvedValueOnce({ rows: [] }); // UPDATE annotation timestamp

      const result = await annotationService.addRegion(1, {
        shapeType: 'BOX',
        coordinates: { x: 10, y: 20, width: 100, height: 50 },
        style: { color: '#ff0000', strokeWidth: 2 }
      });

      expect(result.shapeType).toBe('BOX');
      expect(result.coordinates.x).toBe(10);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should add point region to annotation', async () => {
      const mockRegion = {
        id: 2,
        annotation_id: 1,
        shape_type: 'point',
        coordinates: { x: 100, y: 200 },
        style: { color: '#00ff00', strokeWidth: 1 },
        created_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockRegion] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await annotationService.addRegion(1, {
        shapeType: 'POINT',
        coordinates: { x: 100, y: 200 }
      });

      expect(result.shapeType).toBe('POINT');
      expect(result.coordinates.x).toBe(100);
    });
  });

  describe('updateRegion', () => {
    test('should update region coordinates', async () => {
      const mockRegion = {
        id: 1,
        annotation_id: 1,
        shape_type: 'box',
        coordinates: { x: 20, y: 30, width: 150, height: 75 },
        style: { color: '#ff0000', strokeWidth: 2 },
        created_at: new Date()
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockRegion] }) // UPDATE region
        .mockResolvedValueOnce({ rows: [] }); // UPDATE annotation timestamp

      const result = await annotationService.updateRegion(1, {
        coordinates: { x: 20, y: 30, width: 150, height: 75 }
      });

      expect(result.coordinates.x).toBe(20);
      expect(result.coordinates.width).toBe(150);
    });

    test('should throw error if no updates provided', async () => {
      await expect(
        annotationService.updateRegion(1, {})
      ).rejects.toThrow('No updates provided');
    });

    test('should throw error if region not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        annotationService.updateRegion(999, { coordinates: { x: 1, y: 1 } })
      ).rejects.toThrow('Region not found');
    });
  });

  describe('deleteRegion', () => {
    test('should delete region and update annotation timestamp', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ annotation_id: 1 }] }) // SELECT annotation_id
        .mockResolvedValueOnce({ rows: [] }) // DELETE region
        .mockResolvedValueOnce({ rows: [] }); // UPDATE annotation

      const result = await annotationService.deleteRegion(1);

      expect(result).toBe(true);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should throw error if region not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        annotationService.deleteRegion(999)
      ).rejects.toThrow('Region not found');
    });
  });

  describe('getAnnotationById', () => {
    test('should return formatted annotation with tags', async () => {
      const mockRow = {
        id: 1,
        asset_id: 100,
        created_by: 1,
        title: 'Test',
        description: 'Test description',
        tags: ['person:John', 'location:NYC'],
        metadata: { key: 'value' },
        created_at: new Date(),
        updated_at: new Date()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await annotationService.getAnnotationById(1);

      expect(result.id).toBe(1);
      expect(result.title).toBe('Test');
      expect(result.tags).toEqual(['person:John', 'location:NYC']);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('should return null if annotation not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await annotationService.getAnnotationById(999);

      expect(result).toBeNull();
    });
  });

  describe('getAnnotationsByAssetId', () => {
    test('should return all annotations for an asset', async () => {
      const mockRows = [
        {
          id: 1,
          asset_id: 100,
          created_by: 1,
          title: 'Annotation 1',
          description: 'First',
          tags: ['tag1'],
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2,
          asset_id: 100,
          created_by: 1,
          title: 'Annotation 2',
          description: 'Second',
          tags: ['tag2'],
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const results = await annotationService.getAnnotationsByAssetId(100);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Annotation 1');
      expect(results[1].title).toBe('Annotation 2');
    });

    test('should return empty array if no annotations found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const results = await annotationService.getAnnotationsByAssetId(100);

      expect(results).toEqual([]);
    });
  });

  describe('formatAnnotation', () => {
    test('should format database row to annotation object', () => {
      const row = {
        id: 1,
        asset_id: 100,
        created_by: 1,
        title: 'Test',
        description: 'Description',
        tags: ['tag1', 'tag2'],
        metadata: { key: 'value' },
        created_at: new Date('2025-01-01'),
        updated_at: new Date('2025-01-02')
      };

      const result = annotationService.formatAnnotation(row);

      expect(result.id).toBe(1);
      expect(result.assetId).toBe(100);
      expect(result.createdBy).toBe(1);
      expect(result.title).toBe('Test');
      expect(result.tags).toEqual(['tag1', 'tag2']);
      expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z');
    });

    test('should handle null tags gracefully', () => {
      const row = {
        id: 1,
        asset_id: 100,
        created_by: 1,
        title: 'Test',
        description: 'Description',
        tags: null,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date()
      };

      const result = annotationService.formatAnnotation(row);

      expect(result.tags).toEqual([]);
    });
  });

  describe('formatRegion', () => {
    test('should format box region', () => {
      const row = {
        id: 1,
        annotation_id: 1,
        shape_type: 'box',
        coordinates: { x: 10, y: 20, width: 100, height: 50 },
        style: { color: '#ff0000', strokeWidth: 2 },
        created_at: new Date('2025-01-01')
      };

      const result = annotationService.formatRegion(row);

      expect(result.id).toBe(1);
      expect(result.shapeType).toBe('BOX');
      expect(result.coordinates.x).toBe(10);
      expect(result.style.color).toBe('#ff0000');
    });

    test('should format point region', () => {
      const row = {
        id: 2,
        annotation_id: 1,
        shape_type: 'point',
        coordinates: { x: 100, y: 200 },
        style: { color: '#00ff00' },
        created_at: new Date('2025-01-01')
      };

      const result = annotationService.formatRegion(row);

      expect(result.shapeType).toBe('POINT');
      expect(result.coordinates.x).toBe(100);
    });
  });

  describe('formatEntityLink', () => {
    test('should format entity link', () => {
      const row = {
        id: 1,
        annotation_id: 1,
        entity_id: 'person-123',
        relation_type: 'identifies',
        confidence: '0.95',
        notes: 'High confidence match',
        created_at: new Date('2025-01-01')
      };

      const result = annotationService.formatEntityLink(row);

      expect(result.id).toBe(1);
      expect(result.annotationId).toBe(1);
      expect(result.entityId).toBe('person-123');
      expect(result.relationType).toBe('identifies');
      expect(result.confidence).toBe(0.95);
      expect(result.notes).toBe('High confidence match');
    });

    test('should handle null confidence', () => {
      const row = {
        id: 1,
        annotation_id: 1,
        entity_id: 'location-456',
        relation_type: 'shows',
        confidence: null,
        notes: null,
        created_at: new Date()
      };

      const result = annotationService.formatEntityLink(row);

      expect(result.confidence).toBeNull();
      expect(result.notes).toBeNull();
    });
  });
});
