import * as mgrs from 'mgrs';

/**
 * Convert longitude and latitude to formatted MGRS coordinate string
 * @param {number} longitude - Longitude in decimal degrees
 * @param {number} latitude - Latitude in decimal degrees
 * @returns {string} Formatted MGRS coordinate (e.g., "35WLP 70743 01293")
 */
export function formatMGRS(longitude, latitude) {
  const mgrsCoord = mgrs.forward([longitude, latitude]);
  // Format: GridZone + 100km square (e.g., "35WLP") + space + easting (5 digits) + space + northing (5 digits)
  return mgrsCoord.replace(/^(\d{1,2}[A-Z]{3})(\d{5})(\d{5})$/, '$1 $2 $3');
}

/**
 * Convert an MGRS coordinate string into longitude/latitude.
 * @param {string} mgrsString - MGRS coordinate (spaces allowed)
 * @returns {{ longitude: number, latitude: number } | null}
 */
export function parseMGRS(mgrsString) {
  if (!mgrsString || typeof mgrsString !== 'string') return null;
  const normalized = mgrsString.trim().replace(/\s+/g, '');
  if (!normalized) return null;
  try {
    const point = mgrs.toPoint(normalized);
    if (!Array.isArray(point) || point.length < 2) return null;
    const [longitude, latitude] = point;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    return { longitude, latitude };
  } catch {
    return null;
  }
}
