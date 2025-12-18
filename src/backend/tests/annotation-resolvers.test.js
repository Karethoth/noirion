import { describe, test, expect, beforeEach, vi } from 'vitest';
import annotationResolvers from '../src/graphql/resolvers/annotation.resolver.js';

describe('Annotation GraphQL Resolvers', () => {
  let mockContext;

  beforeEach(() => {
    // Mock context with authenticated user
    mockContext = {
      dbPool: {},
      userId: 1,
      user: {
        userId: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: 'investigator' // Has 'read' and 'write' permissions
      }
    };

    // We'll spy on the actual service creation
    // For a real test, you'd mock the service methods
  });

  describe('Query resolvers', () => {
    describe('annotations', () => {
      test('should call getAnnotationsByAssetId with correct assetId', async () => {
        const mockAnnotations = [
          {
            id: 1,
            assetId: 100,
            title: 'Test Annotation',
            description: 'Test',
            tags: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z'
          }
        ];

        // Mock the service method
        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'getAnnotationsByAssetId')
          .mockResolvedValue(mockAnnotations);

        const result = await annotationResolvers.Query.annotations(
          null,
          { assetId: 100 },
          mockContext
        );

        expect(result).toEqual(mockAnnotations);
        expect(AnnotationService.prototype.getAnnotationsByAssetId).toHaveBeenCalledWith(100);
      });
    });

    describe('annotation', () => {
      test('should call getAnnotationById with correct id', async () => {
        const mockAnnotation = {
          id: 1,
          assetId: 100,
          title: 'Test Annotation',
          description: 'Test',
          tags: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z'
        };

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'getAnnotationById')
          .mockResolvedValue(mockAnnotation);

        const result = await annotationResolvers.Query.annotation(
          null,
          { id: 1 },
          mockContext
        );

        expect(result).toEqual(mockAnnotation);
        expect(AnnotationService.prototype.getAnnotationById).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('Mutation resolvers', () => {
    describe('createAnnotation', () => {
      test('should create annotation with correct parameters', async () => {
        const input = {
          assetId: 100,
          title: 'New Annotation',
          description: 'Test description',
          tags: ['person:John']
        };

        const mockCreatedAnnotation = {
          id: 1,
          ...input,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z'
        };

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'createAnnotation')
          .mockResolvedValue(mockCreatedAnnotation);

        const result = await annotationResolvers.Mutation.createAnnotation(
          null,
          { input },
          mockContext
        );

        expect(result).toEqual(mockCreatedAnnotation);
        expect(AnnotationService.prototype.createAnnotation).toHaveBeenCalledWith(
          100,
          1,
          input
        );
      });
    });

    describe('updateAnnotation', () => {
      test('should update annotation with correct parameters', async () => {
        const input = {
          title: 'Updated Title',
          description: 'Updated description'
        };

        const mockUpdatedAnnotation = {
          id: 1,
          assetId: 100,
          ...input,
          tags: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z'
        };

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'updateAnnotation')
          .mockResolvedValue(mockUpdatedAnnotation);

        const result = await annotationResolvers.Mutation.updateAnnotation(
          null,
          { id: 1, input },
          mockContext
        );

        expect(result).toEqual(mockUpdatedAnnotation);
        expect(AnnotationService.prototype.updateAnnotation).toHaveBeenCalledWith(
          1,
          1,
          input
        );
      });
    });

    describe('deleteAnnotation', () => {
      test('should delete annotation with correct id', async () => {
        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'deleteAnnotation')
          .mockResolvedValue(true);

        const result = await annotationResolvers.Mutation.deleteAnnotation(
          null,
          { id: 1 },
          mockContext
        );

        expect(result).toBe(true);
        expect(AnnotationService.prototype.deleteAnnotation).toHaveBeenCalledWith(1, 1);
      });
    });

    describe('addAnnotationRegion', () => {
      test('should add box region to annotation', async () => {
        const input = {
          shapeType: 'BOX',
          coordinates: { x: 10, y: 20, width: 100, height: 50 },
          style: { color: '#ff0000', strokeWidth: 2 }
        };

        const mockRegion = {
          id: 1,
          annotationId: 1,
          ...input,
          createdAt: '2025-01-01T00:00:00.000Z'
        };

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'addRegion')
          .mockResolvedValue(mockRegion);

        const result = await annotationResolvers.Mutation.addAnnotationRegion(
          null,
          { annotationId: 1, input },
          mockContext
        );

        expect(result).toEqual(mockRegion);
        expect(AnnotationService.prototype.addRegion).toHaveBeenCalledWith(1, input);
      });

      test('should add point region to annotation', async () => {
        const input = {
          shapeType: 'POINT',
          coordinates: { x: 100, y: 200 },
          style: { color: '#00ff00', strokeWidth: 1 }
        };

        const mockRegion = {
          id: 2,
          annotationId: 1,
          ...input,
          createdAt: '2025-01-01T00:00:00.000Z'
        };

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'addRegion')
          .mockResolvedValue(mockRegion);

        const result = await annotationResolvers.Mutation.addAnnotationRegion(
          null,
          { annotationId: 1, input },
          mockContext
        );

        expect(result).toEqual(mockRegion);
      });
    });

    describe('analyzeAnnotation', () => {
      test('should analyze annotation via ImageAnalysisService with correct parameters', async () => {
        const mockAnalysis = {
          caption: 'a car',
          tags: ['vehicle'],
          licensePlates: ['ABC-123'],
          model: 'test-model',
          createdAt: '2025-01-01T00:00:00.000Z',
          raw: { caption: 'a car' }
        };

        const { ImageAnalysisService } = await import('../src/services/image-analysis.js');
        vi.spyOn(ImageAnalysisService.prototype, 'analyzeAnnotationById')
          .mockResolvedValue(mockAnalysis);

        const result = await annotationResolvers.Mutation.analyzeAnnotation(
          null,
          { annotationId: 123, regionId: 456, model: 'test-model', persist: false },
          mockContext
        );

        expect(result).toEqual(mockAnalysis);
        expect(ImageAnalysisService.prototype.analyzeAnnotationById).toHaveBeenCalledWith(123, {
          regionId: 456,
          model: 'test-model',
          persist: false,
          userId: 1,
        });
      });
    });

    describe('updateAnnotationRegion', () => {
      test('should update region with new coordinates', async () => {
        const input = {
          coordinates: { x: 20, y: 30, width: 150, height: 75 }
        };

        const mockRegion = {
          id: 1,
          annotationId: 1,
          shapeType: 'BOX',
          ...input,
          style: { color: '#ff0000', strokeWidth: 2 },
          createdAt: '2025-01-01T00:00:00.000Z'
        };

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'updateRegion')
          .mockResolvedValue(mockRegion);

        const result = await annotationResolvers.Mutation.updateAnnotationRegion(
          null,
          { id: 1, input },
          mockContext
        );

        expect(result).toEqual(mockRegion);
        expect(AnnotationService.prototype.updateRegion).toHaveBeenCalledWith(1, input);
      });
    });

    describe('deleteAnnotationRegion', () => {
      test('should delete region with correct id', async () => {
        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'deleteRegion')
          .mockResolvedValue(true);

        const result = await annotationResolvers.Mutation.deleteAnnotationRegion(
          null,
          { id: 1 },
          mockContext
        );

        expect(result).toBe(true);
        expect(AnnotationService.prototype.deleteRegion).toHaveBeenCalledWith(1);
      });
    });
  });

  describe('Annotation field resolvers', () => {
    describe('asset', () => {
      test('should resolve asset for annotation', async () => {
        const parent = {
          id: 1,
          assetId: 100
        };

        const mockAsset = {
          id: 100,
          filename: 'test.jpg',
          mimeType: 'image/jpeg'
        };

        const { AssetsService } = await import('../src/services/assets.js');
        vi.spyOn(AssetsService.prototype, 'getAssetById')
          .mockResolvedValue(mockAsset);

        const result = await annotationResolvers.Annotation.asset(
          parent,
          {},
          mockContext
        );

        expect(result).toEqual(mockAsset);
        expect(AssetsService.prototype.getAssetById).toHaveBeenCalledWith(100);
      });
    });

    describe('regions', () => {
      test('should resolve regions for annotation', async () => {
        const parent = {
          id: 1
        };

        const mockRegions = [
          {
            id: 1,
            annotationId: 1,
            shapeType: 'BOX',
            coordinates: { x: 10, y: 20, width: 100, height: 50 },
            style: { color: '#ff0000', strokeWidth: 2 },
            createdAt: '2025-01-01T00:00:00.000Z'
          },
          {
            id: 2,
            annotationId: 1,
            shapeType: 'POINT',
            coordinates: { x: 100, y: 200 },
            style: { color: '#00ff00', strokeWidth: 1 },
            createdAt: '2025-01-01T00:00:00.000Z'
          }
        ];

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'getRegionsByAnnotationId')
          .mockResolvedValue(mockRegions);

        const result = await annotationResolvers.Annotation.regions(
          parent,
          {},
          mockContext
        );

        expect(result).toEqual(mockRegions);
        expect(AnnotationService.prototype.getRegionsByAnnotationId).toHaveBeenCalledWith(1);
      });
    });

    describe('entityLinks', () => {
      test('should resolve entity links for annotation', async () => {
        const parent = {
          id: 1
        };

        const mockEntityLinks = [
          {
            id: 1,
            annotationId: 1,
            entityId: 'person-123',
            relationType: 'identifies',
            confidence: 0.95,
            notes: 'High confidence',
            createdAt: '2025-01-01T00:00:00.000Z'
          }
        ];

        const { AnnotationService } = await import('../src/services/annotations.js');
        vi.spyOn(AnnotationService.prototype, 'getEntityLinksByAnnotationId')
          .mockResolvedValue(mockEntityLinks);

        const result = await annotationResolvers.Annotation.entityLinks(
          parent,
          {},
          mockContext
        );

        expect(result).toEqual(mockEntityLinks);
        expect(AnnotationService.prototype.getEntityLinksByAnnotationId).toHaveBeenCalledWith(1);
      });
    });
  });
});
