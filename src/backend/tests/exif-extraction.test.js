import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AssetsService } from '../src/services/assets.js';
import crypto from 'crypto';

// Mock exifr before importing AssetsService
vi.mock('exifr', () => ({
  exifr: {
    parse: vi.fn()
  }
}));

describe('AssetsService', () => {
  let assetsService;
  let mockDbPool;
  let exifr;

  beforeEach(async () => {
    mockDbPool = {
      connect: vi.fn(),
      query: vi.fn()
    };
    assetsService = new AssetsService(mockDbPool);
    
    // Get mocked exifr
    const exifrModule = await import('exifr');
    exifr = exifrModule.exifr;
  });

  describe('calculateHash', () => {
    test('should calculate SHA256 hash of buffer', async () => {
      const buffer = Buffer.from('test data');
      const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex');
      
      const hash = await assetsService.calculateHash(buffer);
      
      expect(hash).toBe(expectedHash);
      expect(hash).toHaveLength(64); // SHA256 produces 64-character hex string
    });

    test('should produce different hashes for different data', async () => {
      const buffer1 = Buffer.from('data one');
      const buffer2 = Buffer.from('data two');
      
      const hash1 = await assetsService.calculateHash(buffer1);
      const hash2 = await assetsService.calculateHash(buffer2);
      
      expect(hash1).not.toBe(hash2);
    });

    test('should produce consistent hashes for same data', async () => {
      const buffer = Buffer.from('consistent data');
      
      const hash1 = await assetsService.calculateHash(buffer);
      const hash2 = await assetsService.calculateHash(buffer);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('extractExifData', () => {
    // Focus on relevant metadata: timestamps, coordinates, orientation

    test('should extract GPS coordinates and altitude', async () => {
      const mockExifData = {
        latitude: 40.7128,
        longitude: -74.0060,
        altitude: 10,
        GPSDateStamp: '2025:10:07'
      };

      exifr.parse.mockResolvedValue(mockExifData);

      const buffer = Buffer.from('fake image data');
      const result = await assetsService.extractExifData(buffer);

      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.0060);
      expect(result.altitude).toBe(10);
      expect(result.gpsTimestamp).toBe('2025:10:07');
    });

    test('should extract orientation (rotation/angle)', async () => {
      const mockExifData = {
        Orientation: 6  // Rotate 90° CW
      };

      exifr.parse.mockResolvedValue(mockExifData);

      const buffer = Buffer.from('fake image data');
      const result = await assetsService.extractExifData(buffer);

      expect(result.orientation).toBe(6);
    });

    test('should extract timestamp information', async () => {
      const mockExifData = {
        DateTimeOriginal: '2025:10:07 12:30:45',
        DateTime: '2025:10:07 12:30:45',
        DateTimeDigitized: '2025:10:07 12:30:45'
      };

      exifr.parse.mockResolvedValue(mockExifData);

      const buffer = Buffer.from('fake image data');
      const result = await assetsService.extractExifData(buffer);

      expect(result.dateTimeOriginal).toBe('2025:10:07 12:30:45');
      expect(result.dateTime).toBe('2025:10:07 12:30:45');
      expect(result.dateTimeDigitized).toBe('2025:10:07 12:30:45');
    });

    test('should handle alternative field names for altitude', async () => {
      const mockExifData = {
        GPSAltitude: 500
      };

      exifr.parse.mockResolvedValue(mockExifData);

      const buffer = Buffer.from('fake image data');
      const result = await assetsService.extractExifData(buffer);

      expect(result.altitude).toBe(500);
    });

    test('should return empty object when no EXIF data available', async () => {
      exifr.parse.mockResolvedValue(null);

      const buffer = Buffer.from('fake image data');
      const result = await assetsService.extractExifData(buffer);

      expect(result).toEqual({});
    });

    test('should handle EXIF parsing errors gracefully', async () => {
      exifr.parse.mockRejectedValue(new Error('EXIF parsing failed'));

      const buffer = Buffer.from('fake image data');
      const result = await assetsService.extractExifData(buffer);

      expect(result).toEqual({});
    });

    test('should extract comprehensive relevant metadata', async () => {
      const mockExifData = {
        Orientation: 1,
        DateTimeOriginal: '2025:10:07 12:00:00',
        DateTime: '2025:10:07 12:00:00',
        DateTimeDigitized: '2025:10:07 12:00:00',
        latitude: 40.7128,
        longitude: -74.0060,
        altitude: 10,
        GPSDateStamp: '2025:10:07'
      };

      exifr.parse.mockResolvedValue(mockExifData);

      const buffer = Buffer.from('fake image data');
      const result = await assetsService.extractExifData(buffer);

      // Verify relevant fields are extracted: timestamps, coordinates, orientation
      expect(result.orientation).toBe(1);
      expect(result.dateTimeOriginal).toBe('2025:10:07 12:00:00');
      expect(result.latitude).toBe(40.7128);
      expect(result.longitude).toBe(-74.0060);
      expect(result.altitude).toBe(10);
      expect(result.gpsTimestamp).toBe('2025:10:07');
    });
  });
});
