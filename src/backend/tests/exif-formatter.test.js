import { describe, test, expect } from 'vitest';
import {
  formatAltitude,
  getOrientationName,
  formatGPSCoordinates
} from '../src/utils/exif-formatter.js';

describe('EXIF Formatter Utilities', () => {
  // Focus on relevant metadata: timestamps, coordinates, rotation/orientation

  describe('formatAltitude', () => {
    test('should format altitude in meters', () => {
      expect(formatAltitude(123.5)).toBe('123.5m');
      expect(formatAltitude(1500)).toBe('1500.0m');
    });

    test('should handle null/undefined', () => {
      expect(formatAltitude(null)).toBeNull();
      expect(formatAltitude(undefined)).toBeNull();
    });
  });

  describe('getOrientationName', () => {
    test('should return correct orientation names for rotation', () => {
      expect(getOrientationName(1)).toBe('Normal');
      expect(getOrientationName(3)).toBe('Rotate 180°');
      expect(getOrientationName(6)).toBe('Rotate 90° CW');
      expect(getOrientationName(8)).toBe('Rotate 270° CW');
    });

    test('should handle flip orientations', () => {
      expect(getOrientationName(2)).toBe('Flip horizontal');
      expect(getOrientationName(4)).toBe('Flip vertical');
    });

    test('should return Unknown for invalid codes', () => {
      expect(getOrientationName(99)).toBe('Unknown');
    });
  });

  describe('formatGPSCoordinates', () => {
    test('should format GPS coordinates in DMS format', () => {
      const result = formatGPSCoordinates(40.7128, -74.0060);
      expect(result).toContain('40°');
      expect(result).toContain('N');
      expect(result).toContain('74°');
      expect(result).toContain('W');
    });

    test('should format southern and eastern coordinates', () => {
      const result = formatGPSCoordinates(-33.8688, 151.2093);
      expect(result).toContain('S');
      expect(result).toContain('E');
    });

    test('should handle missing coordinates', () => {
      expect(formatGPSCoordinates(null, null)).toBeNull();
      expect(formatGPSCoordinates(40.7128, null)).toBeNull();
      expect(formatGPSCoordinates(null, -74.0060)).toBeNull();
    });
  });
});
