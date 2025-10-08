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
