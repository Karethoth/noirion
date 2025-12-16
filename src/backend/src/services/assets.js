import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import exifr from 'exifr';

export class AssetsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.uploadDir = path.join(process.cwd(), 'uploads');
  }

  async setAssetAiAnalysis(assetId, aiAnalysis) {
    const client = await this.dbPool.connect();
    try {
      await client.query(
        `UPDATE assets
         SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{aiAnalysis}', $2::jsonb, true)
         WHERE id = $1 AND deleted_at IS NULL`,
        [assetId, JSON.stringify(aiAnalysis || {})]
      );
      return await this.getAssetById(assetId);
    } finally {
      client.release();
    }
  }

  async updateAssetManualMetadata(
    assetId,
    { displayName, latitude, longitude, altitude, captureTimestamp } = {},
    userId = null
  ) {
    const client = await this.dbPool.connect();
    try {
      // Validate coordinates if provided
      const hasLat = latitude !== undefined && latitude !== null && latitude !== '';
      const hasLng = longitude !== undefined && longitude !== null && longitude !== '';
      if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
        throw new Error('Both latitude and longitude must be provided together');
      }

      const displayNameNorm = displayName === '' ? null : displayName;
      const altitudeNorm = altitude === '' ? null : altitude;
      const captureNorm = captureTimestamp === '' ? null : captureTimestamp;

      const params = [assetId, displayNameNorm, altitudeNorm, captureNorm, userId];
      let gpsSql = 'NULL';
      if (hasLat && hasLng) {
        params.push(Number(longitude));
        params.push(Number(latitude));
        gpsSql = 'ST_SetSRID(ST_MakePoint($6, $7), 4326)';
      }

      await client.query(
        `INSERT INTO asset_metadata_manual (
          asset_id,
          display_name,
          altitude,
          capture_timestamp,
          gps,
          created_by,
          updated_by,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, ${gpsSql}, $5, $5, now()
        )
        ON CONFLICT (asset_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          altitude = EXCLUDED.altitude,
          capture_timestamp = EXCLUDED.capture_timestamp,
          gps = EXCLUDED.gps,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()`,
        params
      );

      return await this.getAssetById(assetId);
    } finally {
      client.release();
    }
  }

  async ensureUploadDir() {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  async calculateHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async extractExifData(buffer) {
    try {
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

      if (!exifData) return {};

      // Normalize and extract key metadata
      return {
        // Camera information
        make: exifData.Make,
        model: exifData.Model,
        lens: exifData.LensModel || exifData.Lens,

        // Exposure settings
        iso: exifData.ISO || exifData.ISOSpeedRatings,
        aperture: exifData.FNumber || exifData.ApertureValue,
        shutterSpeed: exifData.ExposureTime || exifData.ShutterSpeedValue,
        exposureProgram: exifData.ExposureProgram,
        exposureBias: exifData.ExposureCompensation || exifData.ExposureBiasValue,
        meteringMode: exifData.MeteringMode,

        // Lens and focus
        focalLength: exifData.FocalLength,
        focalLength35mm: exifData.FocalLengthIn35mmFormat,

        // Flash
        flash: exifData.Flash,
        flashMode: exifData.FlashMode,

        // Image properties
        orientation: exifData.Orientation,
        colorSpace: exifData.ColorSpace,
        whiteBalance: exifData.WhiteBalance,

        // Timestamps
        dateTimeOriginal: exifData.DateTimeOriginal,
        dateTime: exifData.DateTime,
        dateTimeDigitized: exifData.DateTimeDigitized,

        // GPS data
        latitude: exifData.latitude,
        longitude: exifData.longitude,
        altitude: exifData.altitude || exifData.GPSAltitude,
        gpsTimestamp: exifData.GPSDateStamp,

        // Software/processing
        software: exifData.Software,

        // Copyright and ownership
        copyright: exifData.Copyright,
        artist: exifData.Artist,

        // Full raw data for reference
        raw: exifData
      };
    } catch (error) {
      console.warn('Failed to extract EXIF data:', error.message);
      return {};
    }
  }

  async processAsset(fileBuffer, originalName, mimeType, uploaderId = null) {
    const hash = await this.calculateHash(fileBuffer);

    // Check if asset already exists
    const existingAsset = await this.getAssetByHash(hash);
    if (existingAsset) {
      return existingAsset;
    }

    await this.ensureUploadDir();

    // Extract EXIF data
    const exifData = await this.extractExifData(fileBuffer);

    // Get image dimensions
    const metadata = await sharp(fileBuffer).metadata();
    const { width, height } = metadata;

    // Generate filename
    const ext = path.extname(originalName) || '.jpg';
    const filename = `${hash}${ext}`;
    const filePath = path.join(this.uploadDir, filename);

    // Save file
    await fs.writeFile(filePath, fileBuffer);

    // Save to database using existing assets structure
    const assetData = {
      filename,
      contentType: mimeType,
      sizeBytes: fileBuffer.length,
      sha256: hash,
      storagePath: `/uploads/${filename}`,
      uploaderId,
      exifData,
      width,
      height
    };

    return await this.createAssetRecord(assetData);
  }

  async createAssetRecord(assetData) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Insert into assets table
      const assetQuery = `
        INSERT INTO assets (
          uploader_id, filename, content_type, size_bytes, sha256, storage_path, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const assetValues = [
        assetData.uploaderId,
        assetData.filename,
        assetData.contentType,
        assetData.sizeBytes,
        assetData.sha256,
        assetData.storagePath,
        JSON.stringify({})
      ];

      const assetResult = await client.query(assetQuery, assetValues);
      const asset = assetResult.rows[0];

      // Insert EXIF data if available
      if (assetData.exifData && Object.keys(assetData.exifData).length > 0) {
        const exifData = assetData.exifData;

        // Extract GPS coordinates
        const latitude = exifData.latitude;
        const longitude = exifData.longitude;
        const altitude = exifData.altitude;

        // Helper to ensure numeric values
        const toNumber = (val) => {
          if (val === null || val === undefined) return null;
          const num = typeof val === 'number' ? val : parseFloat(val);
          return isNaN(num) ? null : num;
        };

        const exifValues = [
          asset.id,                                              // $1
          exifData.dateTimeOriginal || exifData.dateTime || null, // $2
          exifData.make || null,                                 // $3
          exifData.model || null,                                // $4
          toNumber(exifData.orientation),                        // $5 - must be integer
          assetData.width,                                       // $6
          assetData.height,                                      // $7
          toNumber(altitude),                                    // $8
          toNumber(exifData.iso),                                // $9
          toNumber(exifData.aperture),                           // $10
          toNumber(exifData.shutterSpeed),                       // $11
          toNumber(exifData.focalLength),                        // $12
          toNumber(exifData.focalLength35mm),                    // $13
          toNumber(exifData.flash),                              // $14
          exifData.flashMode || null,                            // $15 - can be string
          toNumber(exifData.exposureProgram),                    // $16
          toNumber(exifData.exposureBias),                       // $17
          toNumber(exifData.meteringMode),                       // $18
          toNumber(exifData.whiteBalance),                       // $19
          toNumber(exifData.colorSpace),                         // $20
          exifData.lens || null,                                 // $21 - string
          exifData.software || null,                             // $22 - string
          exifData.copyright || null,                            // $23 - string
          exifData.artist || null,                               // $24 - string
        ];

        let gpsClause, exifRawParam;
        if (latitude && longitude) {
          exifValues.push(longitude);                            // $25
          exifValues.push(latitude);                             // $26
          gpsClause = 'ST_SetSRID(ST_MakePoint($25, $26), 4326)';
          exifRawParam = '$27';
          exifValues.push(JSON.stringify(exifData));             // $27
        } else {
          gpsClause = 'NULL';
          exifRawParam = '$25';
          exifValues.push(JSON.stringify(exifData));             // $25
        }

        const exifQuery = `
          INSERT INTO asset_metadata_exif (
            asset_id, capture_timestamp, camera_make, camera_model,
            orientation, width, height, altitude,
            iso, aperture, shutter_speed, focal_length, focal_length_35mm,
            flash, flash_mode, exposure_program, exposure_bias,
            metering_mode, white_balance, color_space,
            lens, software, copyright, artist,
            gps, exif_raw
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
            ${gpsClause}, ${exifRawParam}
          )
        `;

        await client.query(exifQuery, exifValues);
      }

      await client.query('COMMIT');
      return await this.getAssetById(asset.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAssetByHash(hash) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(`
        SELECT a.*,
               e.capture_timestamp, e.camera_make, e.camera_model,
               e.orientation, e.width, e.height, e.altitude,
               e.iso, e.aperture, e.shutter_speed, e.focal_length, e.focal_length_35mm,
               e.flash, e.flash_mode, e.exposure_program, e.exposure_bias,
               e.metering_mode, e.white_balance, e.color_space,
               e.lens, e.software, e.copyright, e.artist,
               e.exif_raw,
               m.display_name as manual_display_name,
               m.capture_timestamp as manual_capture_timestamp,
               m.altitude as manual_altitude,
               ST_Y(COALESCE(m.gps, e.gps)) as latitude,
               ST_X(COALESCE(m.gps, e.gps)) as longitude
        FROM assets a
        LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
        LEFT JOIN asset_metadata_manual m ON a.id = m.asset_id
        WHERE a.sha256 = $1 AND a.deleted_at IS NULL
      `, [hash]);
      return result.rows[0] ? this.formatAssetResult(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getAllAssets() {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(`
        SELECT a.*,
               e.capture_timestamp, e.camera_make, e.camera_model,
               e.orientation, e.width, e.height, e.altitude,
               e.iso, e.aperture, e.shutter_speed, e.focal_length, e.focal_length_35mm,
               e.flash, e.flash_mode, e.exposure_program, e.exposure_bias,
               e.metering_mode, e.white_balance, e.color_space,
               e.lens, e.software, e.copyright, e.artist,
               e.exif_raw,
               m.display_name as manual_display_name,
               m.capture_timestamp as manual_capture_timestamp,
               m.altitude as manual_altitude,
               ST_Y(COALESCE(m.gps, e.gps)) as latitude,
               ST_X(COALESCE(m.gps, e.gps)) as longitude
        FROM assets a
        LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
        LEFT JOIN asset_metadata_manual m ON a.id = m.asset_id
        WHERE a.deleted_at IS NULL
        AND a.content_type LIKE 'image/%'
        ORDER BY a.uploaded_at DESC
      `);
      return result.rows.map(row => this.formatAssetResult(row));
    } finally {
      client.release();
    }
  }

  async getAssetById(id) {
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(`
        SELECT a.*,
               e.capture_timestamp, e.camera_make, e.camera_model,
               e.orientation, e.width, e.height, e.altitude,
               e.iso, e.aperture, e.shutter_speed, e.focal_length, e.focal_length_35mm,
               e.flash, e.flash_mode, e.exposure_program, e.exposure_bias,
               e.metering_mode, e.white_balance, e.color_space,
               e.lens, e.software, e.copyright, e.artist,
               e.exif_raw,
               m.display_name as manual_display_name,
               m.capture_timestamp as manual_capture_timestamp,
               m.altitude as manual_altitude,
               ST_Y(COALESCE(m.gps, e.gps)) as latitude,
               ST_X(COALESCE(m.gps, e.gps)) as longitude
        FROM assets a
        LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
        LEFT JOIN asset_metadata_manual m ON a.id = m.asset_id
        WHERE a.id = $1 AND a.deleted_at IS NULL
      `, [id]);
      return result.rows[0] ? this.formatAssetResult(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getAssetsInArea(bounds) {
    const { northEast, southWest } = bounds;
    const client = await this.dbPool.connect();
    try {
      const result = await client.query(`
        SELECT a.*,
               e.capture_timestamp, e.camera_make, e.camera_model,
               e.orientation, e.width, e.height, e.altitude,
               e.iso, e.aperture, e.shutter_speed, e.focal_length, e.focal_length_35mm,
               e.flash, e.flash_mode, e.exposure_program, e.exposure_bias,
               e.metering_mode, e.white_balance, e.color_space,
               e.lens, e.software, e.copyright, e.artist,
               e.exif_raw,
               m.display_name as manual_display_name,
               m.capture_timestamp as manual_capture_timestamp,
               m.altitude as manual_altitude,
               ST_Y(COALESCE(m.gps, e.gps)) as latitude,
               ST_X(COALESCE(m.gps, e.gps)) as longitude
        FROM assets a
        LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
        LEFT JOIN asset_metadata_manual m ON a.id = m.asset_id
        WHERE a.deleted_at IS NULL
        AND a.content_type LIKE 'image/%'
        AND COALESCE(m.gps, e.gps) IS NOT NULL
        AND ST_Within(
          COALESCE(m.gps, e.gps),
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )
        ORDER BY a.uploaded_at DESC
      `, [southWest.lng, southWest.lat, northEast.lng, northEast.lat]);

      return result.rows.map(row => this.formatAssetResult(row));
    } finally {
      client.release();
    }
  }

  async deleteAsset(id) {
    const client = await this.dbPool.connect();
    try {
      // Hard delete - delete associated data first due to foreign key constraints

      // Delete annotation regions first
      await client.query(
        `DELETE FROM annotation_regions WHERE annotation_id IN (
          SELECT id FROM annotations WHERE asset_id = $1
        )`,
        [id]
      );

      // Delete annotations
      await client.query(
        `DELETE FROM annotations WHERE asset_id = $1`,
        [id]
      );

      // Delete asset metadata
      await client.query(
        `DELETE FROM asset_metadata_exif WHERE asset_id = $1`,
        [id]
      );

      // Delete manual metadata
      await client.query(
        `DELETE FROM asset_metadata_manual WHERE asset_id = $1`,
        [id]
      );

      // Finally delete the asset itself
      const result = await client.query(
        `DELETE FROM assets WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error('Image not found');
      }

      return true;
    } finally {
      client.release();
    }
  }

  formatAssetResult(row) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    return {
      id: row.id,
      filename: row.filename,
      originalName: row.filename, // assets table doesn't store original name separately
      displayName: row.manual_display_name || row.filename,
      filePath: row.storage_path,
      sha256Hash: row.sha256,
      fileSize: parseInt(row.size_bytes),
      mimeType: row.content_type,
      width: row.width,
      height: row.height,
      latitude: row.latitude,
      longitude: row.longitude,
      altitude: (row.manual_altitude ?? row.altitude) !== null && (row.manual_altitude ?? row.altitude) !== undefined
        ? parseFloat(row.manual_altitude ?? row.altitude)
        : null,
      orientation: row.orientation,

      // Camera information
      cameraMake: row.camera_make,
      cameraModel: row.camera_model,
      lens: row.lens,

      // Exposure settings
      iso: row.iso,
      aperture: row.aperture ? parseFloat(row.aperture) : null,
      shutterSpeed: row.shutter_speed ? parseFloat(row.shutter_speed) : null,
      exposureProgram: row.exposure_program,
      exposureBias: row.exposure_bias ? parseFloat(row.exposure_bias) : null,
      meteringMode: row.metering_mode,

      // Lens and focus
      focalLength: row.focal_length ? parseFloat(row.focal_length) : null,
      focalLength35mm: row.focal_length_35mm,

      // Flash
      flash: row.flash,
      flashMode: row.flash_mode,

      // Image properties
      colorSpace: row.color_space,
      whiteBalance: row.white_balance,

      // Timestamps
      captureTimestamp: (row.manual_capture_timestamp || row.capture_timestamp)
        ? new Date(row.manual_capture_timestamp || row.capture_timestamp).toISOString()
        : null,
      uploadedAt: row.uploaded_at?.toISOString(),
      uploadedBy: row.uploader_id,

      // Metadata
      software: row.software,
      copyright: row.copyright,
      artist: row.artist,

      // Full EXIF data for advanced use
      exifData: row.exif_raw || {},
      metadata: metadata,
      aiAnalysis: metadata.aiAnalysis || null
    };
  }
}
