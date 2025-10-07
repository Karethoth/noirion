import exifr from 'exifr';
import fs from 'fs/promises';
import path from 'path';

/**
 * Test script for EXIF extraction
 * Usage: node test-exif.js <image-file-path>
 */

async function extractAndDisplayEXIF(imagePath) {
  try {
    console.log(`\n📷 Reading image: ${path.basename(imagePath)}\n`);
    
    const buffer = await fs.readFile(imagePath);
    
    // Extract comprehensive EXIF data
    const exifData = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true,
      ifd1: true,
      iptc: true,
      icc: true
    });
    
    if (!exifData) {
      console.log('❌ No EXIF data found in this image');
      return;
    }
    
    console.log('✅ EXIF data extracted successfully!\n');
    
    // Display camera information
    console.log('📸 Camera Information:');
    console.log(`  Make:        ${exifData.Make || 'N/A'}`);
    console.log(`  Model:       ${exifData.Model || 'N/A'}`);
    console.log(`  Lens:        ${exifData.LensModel || exifData.Lens || 'N/A'}`);
    console.log(`  Software:    ${exifData.Software || 'N/A'}\n`);
    
    // Display exposure settings
    console.log('⚙️  Exposure Settings:');
    console.log(`  ISO:         ${exifData.ISO || exifData.ISOSpeedRatings || 'N/A'}`);
    console.log(`  Aperture:    ${exifData.FNumber ? `f/${exifData.FNumber}` : 'N/A'}`);
    console.log(`  Shutter:     ${formatShutterSpeed(exifData.ExposureTime || exifData.ShutterSpeedValue)}`);
    console.log(`  Focal Len:   ${exifData.FocalLength ? `${exifData.FocalLength}mm` : 'N/A'}`);
    console.log(`  Focal 35mm:  ${exifData.FocalLengthIn35mmFormat ? `${exifData.FocalLengthIn35mmFormat}mm` : 'N/A'}`);
    console.log(`  Exp. Bias:   ${exifData.ExposureCompensation || exifData.ExposureBiasValue || 'N/A'}`);
    console.log(`  Flash:       ${exifData.Flash !== undefined ? formatFlash(exifData.Flash) : 'N/A'}\n`);
    
    // Display GPS information
    console.log('🗺️  Location Data:');
    console.log(`  Latitude:    ${exifData.latitude || 'N/A'}`);
    console.log(`  Longitude:   ${exifData.longitude || 'N/A'}`);
    console.log(`  Altitude:    ${exifData.altitude || exifData.GPSAltitude ? `${exifData.altitude || exifData.GPSAltitude}m` : 'N/A'}\n`);
    
    // Display timestamps
    console.log('🕐 Timestamps:');
    console.log(`  Capture:     ${exifData.DateTimeOriginal || 'N/A'}`);
    console.log(`  Modified:    ${exifData.DateTime || 'N/A'}\n`);
    
    // Display image properties
    console.log('🖼️  Image Properties:');
    console.log(`  Orientation: ${exifData.Orientation || 'N/A'}`);
    console.log(`  Color Space: ${exifData.ColorSpace || 'N/A'}`);
    console.log(`  White Bal:   ${exifData.WhiteBalance !== undefined ? formatWhiteBalance(exifData.WhiteBalance) : 'N/A'}\n`);
    
    // Display copyright
    if (exifData.Copyright || exifData.Artist) {
      console.log('©️  Copyright & Ownership:');
      if (exifData.Artist) console.log(`  Artist:      ${exifData.Artist}`);
      if (exifData.Copyright) console.log(`  Copyright:   ${exifData.Copyright}`);
      console.log('');
    }
    
    // Display full EXIF keys
    console.log('📋 All EXIF Keys:');
    console.log(`  ${Object.keys(exifData).sort().join(', ')}\n`);
    
  } catch (error) {
    console.error('❌ Error extracting EXIF data:', error.message);
  }
}

function formatShutterSpeed(speed) {
  if (!speed) return 'N/A';
  if (speed >= 1) return `${speed}s`;
  return `1/${Math.round(1/speed)}`;
}

function formatFlash(flash) {
  const fired = (flash & 0x01) !== 0;
  return fired ? 'Fired' : 'Did not fire';
}

function formatWhiteBalance(wb) {
  const modes = { 0: 'Auto', 1: 'Manual' };
  return modes[wb] || wb;
}

// Get image path from command line
const imagePath = process.argv[2];

if (!imagePath) {
  console.log('Usage: node test-exif.js <image-file-path>');
  console.log('Example: node test-exif.js sample.jpg');
  process.exit(1);
}

extractAndDisplayEXIF(imagePath);
