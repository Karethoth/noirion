/**
 * Utility functions for formatting EXIF data into human-readable strings
 */

/**
 * Format shutter speed as a fraction (e.g., "1/250")
 * @param {number} shutterSpeed - Shutter speed in seconds
 * @returns {string} Formatted shutter speed
 */
export function formatShutterSpeed(shutterSpeed) {
  if (!shutterSpeed) return null;
  
  if (shutterSpeed >= 1) {
    return `${shutterSpeed.toFixed(1)}s`;
  }
  
  // Convert to fraction
  const denominator = Math.round(1 / shutterSpeed);
  return `1/${denominator}`;
}

/**
 * Format aperture as f-number (e.g., "f/2.8")
 * @param {number} aperture - Aperture value
 * @returns {string} Formatted aperture
 */
export function formatAperture(aperture) {
  if (!aperture) return null;
  return `f/${aperture.toFixed(1)}`;
}

/**
 * Format focal length (e.g., "50mm" or "50mm (75mm equiv.)")
 * @param {number} focalLength - Focal length in mm
 * @param {number} focalLength35mm - 35mm equivalent focal length
 * @returns {string} Formatted focal length
 */
export function formatFocalLength(focalLength, focalLength35mm) {
  if (!focalLength) return null;
  
  const fl = `${Math.round(focalLength)}mm`;
  
  if (focalLength35mm && focalLength35mm !== Math.round(focalLength)) {
    return `${fl} (${focalLength35mm}mm equiv.)`;
  }
  
  return fl;
}

/**
 * Format ISO value (e.g., "ISO 100")
 * @param {number} iso - ISO value
 * @returns {string} Formatted ISO
 */
export function formatISO(iso) {
  if (!iso) return null;
  return `ISO ${iso}`;
}

/**
 * Format exposure bias (e.g., "+1.3 EV" or "-0.7 EV")
 * @param {number} exposureBias - Exposure compensation value
 * @returns {string} Formatted exposure bias
 */
export function formatExposureBias(exposureBias) {
  if (exposureBias === null || exposureBias === undefined) return null;
  
  const sign = exposureBias >= 0 ? '+' : '';
  return `${sign}${exposureBias.toFixed(1)} EV`;
}

/**
 * Format altitude (e.g., "123.5m" or "405ft")
 * @param {number} altitude - Altitude in meters
 * @param {boolean} imperial - Use feet instead of meters
 * @returns {string} Formatted altitude
 */
export function formatAltitude(altitude, imperial = false) {
  if (!altitude) return null;
  
  if (imperial) {
    const feet = altitude * 3.28084;
    return `${Math.round(feet)}ft`;
  }
  
  return `${altitude.toFixed(1)}m`;
}

/**
 * Get human-readable exposure program name
 * @param {number} exposureProgram - Exposure program code
 * @returns {string} Program name
 */
export function getExposureProgramName(exposureProgram) {
  const programs = {
    0: 'Not defined',
    1: 'Manual',
    2: 'Program AE',
    3: 'Aperture Priority',
    4: 'Shutter Priority',
    5: 'Creative Program',
    6: 'Action Program',
    7: 'Portrait Mode',
    8: 'Landscape Mode'
  };
  
  return programs[exposureProgram] || 'Unknown';
}

/**
 * Get human-readable metering mode name
 * @param {number} meteringMode - Metering mode code
 * @returns {string} Metering mode name
 */
export function getMeteringModeName(meteringMode) {
  const modes = {
    0: 'Unknown',
    1: 'Average',
    2: 'Center-weighted average',
    3: 'Spot',
    4: 'Multi-spot',
    5: 'Multi-segment',
    6: 'Partial',
    255: 'Other'
  };
  
  return modes[meteringMode] || 'Unknown';
}

/**
 * Get human-readable white balance name
 * @param {number} whiteBalance - White balance code
 * @returns {string} White balance name
 */
export function getWhiteBalanceName(whiteBalance) {
  const modes = {
    0: 'Auto',
    1: 'Manual',
    2: 'One-push auto'
  };
  
  return modes[whiteBalance] || 'Unknown';
}

/**
 * Get human-readable flash mode
 * @param {number} flash - Flash code
 * @returns {string} Flash description
 */
export function getFlashDescription(flash) {
  if (flash === null || flash === undefined) return null;
  
  // Flash is a bitfield
  const fired = (flash & 0x01) !== 0;
  const mode = (flash >> 3) & 0x03;
  const returned = (flash >> 1) & 0x03;
  
  if (!fired) return 'Flash did not fire';
  
  const modes = ['Unknown', 'Compulsory', 'Suppressed', 'Auto'];
  const modeStr = modes[mode] || 'Unknown';
  
  return `Flash fired (${modeStr})`;
}

/**
 * Get human-readable orientation
 * @param {number} orientation - Orientation code (1-8)
 * @returns {string} Orientation description
 */
export function getOrientationName(orientation) {
  const orientations = {
    1: 'Normal',
    2: 'Flip horizontal',
    3: 'Rotate 180°',
    4: 'Flip vertical',
    5: 'Transpose',
    6: 'Rotate 90° CW',
    7: 'Transverse',
    8: 'Rotate 270° CW'
  };
  
  return orientations[orientation] || 'Unknown';
}

/**
 * Format complete camera settings string
 * @param {Object} exifData - EXIF data object
 * @returns {string} Complete camera settings
 */
export function formatCameraSettings(exifData) {
  const parts = [];
  
  if (exifData.iso) {
    parts.push(formatISO(exifData.iso));
  }
  
  if (exifData.aperture) {
    parts.push(formatAperture(exifData.aperture));
  }
  
  if (exifData.shutterSpeed) {
    parts.push(formatShutterSpeed(exifData.shutterSpeed));
  }
  
  if (exifData.focalLength) {
    parts.push(formatFocalLength(exifData.focalLength, exifData.focalLength35mm));
  }
  
  if (exifData.exposureBias) {
    parts.push(formatExposureBias(exifData.exposureBias));
  }
  
  return parts.join(' • ');
}

/**
 * Format complete camera info string
 * @param {Object} exifData - EXIF data object
 * @returns {string} Complete camera info
 */
export function formatCameraInfo(exifData) {
  const parts = [];
  
  if (exifData.cameraMake && exifData.cameraModel) {
    parts.push(`${exifData.cameraMake} ${exifData.cameraModel}`);
  } else if (exifData.cameraModel) {
    parts.push(exifData.cameraModel);
  }
  
  if (exifData.lens) {
    parts.push(exifData.lens);
  }
  
  return parts.join(' with ');
}

/**
 * Format GPS coordinates in DMS (Degrees, Minutes, Seconds) format
 * @param {number} latitude - Latitude
 * @param {number} longitude - Longitude
 * @returns {string} Formatted coordinates
 */
export function formatGPSCoordinates(latitude, longitude) {
  if (!latitude || !longitude) return null;
  
  const formatDMS = (coord, isLat) => {
    const absolute = Math.abs(coord);
    const degrees = Math.floor(absolute);
    const minutesDecimal = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);
    
    const direction = isLat 
      ? (coord >= 0 ? 'N' : 'S')
      : (coord >= 0 ? 'E' : 'W');
    
    return `${degrees}°${minutes}'${seconds}"${direction}`;
  };
  
  return `${formatDMS(latitude, true)} ${formatDMS(longitude, false)}`;
}

/**
 * Get a summary of all important EXIF data
 * @param {Object} imageData - Complete image data object
 * @returns {Object} Formatted EXIF summary
 */
export function getEXIFSummary(imageData) {
  return {
    camera: formatCameraInfo(imageData),
    settings: formatCameraSettings(imageData),
    location: imageData.latitude && imageData.longitude 
      ? formatGPSCoordinates(imageData.latitude, imageData.longitude)
      : null,
    altitude: formatAltitude(imageData.altitude),
    timestamp: imageData.captureTimestamp 
      ? new Date(imageData.captureTimestamp).toLocaleString()
      : null,
    orientation: getOrientationName(imageData.orientation),
    exposureProgram: getExposureProgramName(imageData.exposureProgram),
    meteringMode: getMeteringModeName(imageData.meteringMode),
    whiteBalance: getWhiteBalanceName(imageData.whiteBalance),
    flash: getFlashDescription(imageData.flash),
    software: imageData.software,
    copyright: imageData.copyright,
    artist: imageData.artist
  };
}
