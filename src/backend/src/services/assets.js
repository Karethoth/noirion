import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import exifr from 'exifr';
import { logger } from '../utils/logger.js';

export class AssetsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.uploadDir = path.join(process.cwd(), 'uploads');
  }

  async getAssetsByEntityId(entityId, { limit = 200, offset = 0 } = {}) {
    const client = await this.dbPool.connect();
    try {
      const lim = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(2000, Number(limit))) : 200;
      const off = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : 0;

      const result = await client.query(
        `
          WITH connected_entities AS (
            SELECT $1::uuid AS id
            UNION
            SELECT el.from_entity AS id
            FROM entity_links el
            WHERE el.to_entity = $1::uuid
            UNION
            SELECT el.to_entity AS id
            FROM entity_links el
            WHERE el.from_entity = $1::uuid
          )
          SELECT DISTINCT a.*,
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
                   ST_X(COALESCE(m.gps, e.gps)) as longitude,
                   ST_Y(m.subject_gps) as subject_latitude,
                   ST_X(m.subject_gps) as subject_longitude
          FROM assets a
          LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
          LEFT JOIN asset_metadata_manual m ON a.id = m.asset_id
          WHERE a.deleted_at IS NULL
            AND a.content_type LIKE 'image/%'
            AND (
              EXISTS (
                SELECT 1
                FROM annotations an
                JOIN annotation_entity_links ael ON ael.annotation_id = an.id
                WHERE an.asset_id = a.id
                  AND ael.entity_id IN (SELECT id FROM connected_entities)
              )
              OR EXISTS (
                SELECT 1
                FROM presences p
                JOIN presence_entities pe ON pe.presence_id = p.id
                WHERE p.source_asset = a.id
                  AND pe.entity_id IN (SELECT id FROM connected_entities)
              )
            )
          ORDER BY a.uploaded_at DESC
          LIMIT $2 OFFSET $3
        `,
        [entityId, lim, off]
      );

      return result.rows.map((row) => this.formatAssetResult(row));
    } finally {
      client.release();
    }
  }

  async _syncAutoPresencesForAssetWithClient(client, assetId, userId = null) {
    // Build observation info using manual override first, then EXIF.
    const infoRes = await client.query(
      `
        SELECT
          a.id as asset_id,
          a.uploaded_at,
          COALESCE(m.capture_timestamp, e.capture_timestamp, a.uploaded_at) as observed_at,
          ST_Y(COALESCE(m.gps, e.gps)) as latitude,
          ST_X(COALESCE(m.gps, e.gps)) as longitude,
          ST_Y(m.subject_gps) as subject_latitude,
          ST_X(m.subject_gps) as subject_longitude,
          COALESCE(a.metadata, '{}'::jsonb) as metadata
        FROM assets a
        LEFT JOIN asset_metadata_manual m ON m.asset_id = a.id
        LEFT JOIN asset_metadata_exif e ON e.asset_id = a.id
        WHERE a.id = $1 AND a.deleted_at IS NULL
      `,
      [assetId]
    );

    if (infoRes.rows.length === 0) return;

    const info = infoRes.rows[0];
    const observedAt = info.observed_at ? new Date(info.observed_at) : null;
    const latitude = info.latitude !== null && info.latitude !== undefined ? Number(info.latitude) : null;
    const longitude = info.longitude !== null && info.longitude !== undefined ? Number(info.longitude) : null;
    const subjectLatitude = info.subject_latitude !== null && info.subject_latitude !== undefined
      ? Number(info.subject_latitude)
      : null;
    const subjectLongitude = info.subject_longitude !== null && info.subject_longitude !== undefined
      ? Number(info.subject_longitude)
      : null;

    const useSubject = Number.isFinite(subjectLatitude) && Number.isFinite(subjectLongitude);
    const presenceLat = useSubject ? subjectLatitude : latitude;
    const presenceLng = useSubject ? subjectLongitude : longitude;
    const hasPoint = Number.isFinite(presenceLat) && Number.isFinite(presenceLng);

    // Time is required for any timeline presence. If we can't determine it, bail.
    if (!observedAt || Number.isNaN(observedAt.getTime())) return;

    const ignoredIdsRaw = info?.metadata?.autoPresenceIgnoreEntityIds;
    const ignored = new Set(
      Array.isArray(ignoredIdsRaw) ? ignoredIdsRaw.map((x) => String(x)) : []
    );

    const entityRes = await client.query(
      `
        SELECT DISTINCT ael.entity_id
        FROM annotations an
        JOIN annotation_entity_links ael ON ael.annotation_id = an.id
        WHERE an.asset_id = $1
      `,
      [assetId]
    );

    for (const row of entityRes.rows) {
      const entityId = row.entity_id;
      if (!entityId) continue;

      const isIgnored = ignored.has(String(entityId));

      if (isIgnored) {
        await client.query(
          `
            DELETE FROM presences p
            USING presence_entities pe
            WHERE p.id = pe.presence_id
              AND p.source_asset = $1
              AND p.source_type = $2
              AND pe.entity_id = $3
          `,
          [assetId, 'annotation_entity_link', entityId]
        );
        continue;
      }

      const existingPresence = await client.query(
        `
          SELECT p.id
          FROM presences p
          JOIN presence_entities pe ON pe.presence_id = p.id
          WHERE p.source_asset = $1
            AND p.source_type = $2
            AND pe.entity_id = $3
          LIMIT 1
        `,
        [assetId, 'annotation_entity_link', entityId]
      );

      if (existingPresence.rows.length === 0) {
        if (!hasPoint) {
          // No coordinates: don't create any new auto-presence.
          continue;
        }
        const presenceInsert = await client.query(
          `
            INSERT INTO presences (
              observed_at,
              observed_by,
              source_asset,
              source_type,
              geom,
              notes,
              metadata
            ) VALUES (
              $1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8
            )
            RETURNING id
          `,
          [
            observedAt,
            userId || null,
            assetId,
            'annotation_entity_link',
            presenceLng,
            presenceLat,
            null,
            JSON.stringify({ autoFromAsset: true })
          ]
        );

        const presenceId = presenceInsert.rows[0].id;
        await client.query(
          `
            INSERT INTO presence_entities (presence_id, entity_id, role, confidence)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (presence_id, entity_id) DO NOTHING
          `,
          [presenceId, entityId, null, 1.0]
        );
      } else {
        // Keep any existing notes, but ensure time/geom are up to date.
        if (hasPoint) {
          await client.query(
            `
              UPDATE presences
              SET
                observed_at = $2,
                geom = ST_SetSRID(ST_MakePoint($3, $4), 4326),
                metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{autoFromAsset}', 'true'::jsonb, true)
              WHERE id = $1
            `,
            [existingPresence.rows[0].id, observedAt, presenceLng, presenceLat]
          );
        } else {
          await client.query(
            `
              UPDATE presences
              SET
                observed_at = $2,
                geom = NULL,
                metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{autoFromAsset}', 'true'::jsonb, true)
              WHERE id = $1
            `,
            [existingPresence.rows[0].id, observedAt]
          );
        }
      }
    }
  }

  async setAssetAutoPresenceIgnoredEntities(assetId, ignoredEntityIds = [], userId = null) {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      const normalized = Array.isArray(ignoredEntityIds)
        ? ignoredEntityIds.filter(Boolean).map((x) => String(x))
        : [];

      await client.query(
        `
          UPDATE assets
          SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{autoPresenceIgnoreEntityIds}',
            $2::jsonb,
            true
          )
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [assetId, JSON.stringify(normalized)]
      );

      // Sync auto-presences after ignore list update.
      await this._syncAutoPresencesForAssetWithClient(client, assetId, userId);

      await client.query('COMMIT');
      return await this.getAssetById(assetId);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('setAssetAutoPresenceIgnoredEntities failed', err);
      throw err;
    } finally {
      client.release();
    }
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
    { displayName, latitude, longitude, subjectLatitude, subjectLongitude, altitude, captureTimestamp } = {},
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

      const hasSubjectLat = subjectLatitude !== undefined && subjectLatitude !== null && subjectLatitude !== '';
      const hasSubjectLng = subjectLongitude !== undefined && subjectLongitude !== null && subjectLongitude !== '';
      if ((hasSubjectLat && !hasSubjectLng) || (!hasSubjectLat && hasSubjectLng)) {
        throw new Error('Both subjectLatitude and subjectLongitude must be provided together');
      }

      // Treat this as a PATCH:
      // - `undefined` means "no change"
      // - `''` means "clear" (stored as NULL)
      // - otherwise means "set"
      const displayNameMode = displayName === undefined ? 'keep' : (displayName === '' ? 'clear' : 'set');
      const altitudeMode = altitude === undefined ? 'keep' : (altitude === '' ? 'clear' : 'set');
      const captureMode = captureTimestamp === undefined ? 'keep' : (captureTimestamp === '' ? 'clear' : 'set');

      const displayNameNorm = displayNameMode === 'set' ? displayName : null;
      const altitudeNorm = altitudeMode === 'set' ? altitude : null;
      const captureNorm = captureMode === 'set' ? captureTimestamp : null;

      const params = [assetId, displayNameNorm, altitudeNorm, captureNorm, userId];
      const pushParam = (v) => {
        params.push(v);
        return `$${params.length}`;
      };

      const gpsMode = (hasLat && hasLng)
        ? 'set'
        : (latitude === null && longitude === null ? 'clear' : 'keep');

      let gpsSql = 'NULL';
      if (gpsMode === 'set') {
        const lngP = pushParam(Number(longitude));
        const latP = pushParam(Number(latitude));
        gpsSql = `ST_SetSRID(ST_MakePoint(${lngP}, ${latP}), 4326)`;
      }

      const subjectGpsMode = (hasSubjectLat && hasSubjectLng)
        ? 'set'
        : (subjectLatitude === null && subjectLongitude === null ? 'clear' : 'keep');

      let subjectGpsSql = 'NULL';
      if (subjectGpsMode === 'set') {
        const subjLngP = pushParam(Number(subjectLongitude));
        const subjLatP = pushParam(Number(subjectLatitude));
        subjectGpsSql = `ST_SetSRID(ST_MakePoint(${subjLngP}, ${subjLatP}), 4326)`;
      }

      const displayNameAssign = displayNameMode === 'set'
        ? 'display_name = EXCLUDED.display_name'
        : (displayNameMode === 'clear' ? 'display_name = NULL' : 'display_name = asset_metadata_manual.display_name');

      const altitudeAssign = altitudeMode === 'set'
        ? 'altitude = EXCLUDED.altitude'
        : (altitudeMode === 'clear' ? 'altitude = NULL' : 'altitude = asset_metadata_manual.altitude');

      const captureAssign = captureMode === 'set'
        ? 'capture_timestamp = EXCLUDED.capture_timestamp'
        : (captureMode === 'clear' ? 'capture_timestamp = NULL' : 'capture_timestamp = asset_metadata_manual.capture_timestamp');

      const gpsAssign = gpsMode === 'set'
        ? 'gps = EXCLUDED.gps'
        : (gpsMode === 'clear' ? 'gps = NULL' : 'gps = asset_metadata_manual.gps');

      const subjectGpsAssign = subjectGpsMode === 'set'
        ? 'subject_gps = EXCLUDED.subject_gps'
        : (subjectGpsMode === 'clear' ? 'subject_gps = NULL' : 'subject_gps = asset_metadata_manual.subject_gps');

      await client.query(
        `INSERT INTO asset_metadata_manual (
          asset_id,
          display_name,
          altitude,
          capture_timestamp,
          gps,
          subject_gps,
          created_by,
          updated_by,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, ${gpsSql}, ${subjectGpsSql}, $5, $5, now()
        )
        ON CONFLICT (asset_id) DO UPDATE SET
          ${displayNameAssign},
          ${altitudeAssign},
          ${captureAssign},
          ${gpsAssign},
          ${subjectGpsAssign},
          updated_by = EXCLUDED.updated_by,
          updated_at = now()`,
        params
      );

      // If the asset now has time+coords, ensure auto-presences exist for any linked entities.
      try {
        await this._syncAutoPresencesForAssetWithClient(client, assetId, userId);
      } catch (e) {
        // Don't block manual metadata edits if auto-presence sync fails.
        logger.warn('Auto-presence sync failed during updateAssetManualMetadata', e);
      }

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
               ST_X(COALESCE(m.gps, e.gps)) as longitude,
               ST_Y(m.subject_gps) as subject_latitude,
               ST_X(m.subject_gps) as subject_longitude
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
               ST_X(COALESCE(m.gps, e.gps)) as longitude,
               ST_Y(m.subject_gps) as subject_latitude,
               ST_X(m.subject_gps) as subject_longitude
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
               ST_X(COALESCE(m.gps, e.gps)) as longitude,
               ST_Y(m.subject_gps) as subject_latitude,
               ST_X(m.subject_gps) as subject_longitude
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
               ST_X(COALESCE(m.gps, e.gps)) as longitude,
               ST_Y(m.subject_gps) as subject_latitude,
               ST_X(m.subject_gps) as subject_longitude
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
      subjectLatitude: row.subject_latitude !== null && row.subject_latitude !== undefined ? Number(row.subject_latitude) : null,
      subjectLongitude: row.subject_longitude !== null && row.subject_longitude !== undefined ? Number(row.subject_longitude) : null,
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

  async suggestInterpolatedAssetLocations({ maxMinutes = 30 } = {}) {
    const windowMs = Math.max(1, Number(maxMinutes || 30)) * 60 * 1000;

    const client = await this.dbPool.connect();
    try {
      const { rows } = await client.query(
        `
          SELECT
            a.id,
            COALESCE(m.capture_timestamp, e.capture_timestamp) AS capture_ts,
            ST_Y(COALESCE(m.gps, e.gps)) AS latitude,
            ST_X(COALESCE(m.gps, e.gps)) AS longitude,
            e.camera_make AS camera_make,
            e.camera_model AS camera_model
          FROM assets a
          LEFT JOIN asset_metadata_manual m ON m.asset_id = a.id
          LEFT JOIN asset_metadata_exif e ON e.asset_id = a.id
          WHERE a.deleted_at IS NULL
            AND a.content_type LIKE 'image/%'
            AND COALESCE(m.capture_timestamp, e.capture_timestamp) IS NOT NULL
        `
      );

      const norm = (v) => String(v || '').trim().toLowerCase();
      const cameraKey = (make, model) => {
        const mk = norm(make);
        const md = norm(model);
        if (!mk || !md) return null;
        return `${mk}|${md}`;
      };

      const items = (rows || [])
        .map((r) => {
          const ts = r.capture_ts ? new Date(r.capture_ts) : null;
          const t = ts && !Number.isNaN(ts.getTime()) ? ts : null;
          if (!t) return null;
          const lat = r.latitude !== null && r.latitude !== undefined ? Number(r.latitude) : null;
          const lng = r.longitude !== null && r.longitude !== undefined ? Number(r.longitude) : null;
          return {
            id: String(r.id),
            t,
            lat: Number.isFinite(lat) ? lat : null,
            lng: Number.isFinite(lng) ? lng : null,
            make: r.camera_make ?? null,
            model: r.camera_model ?? null,
            key: cameraKey(r.camera_make, r.camera_model),
          };
        })
        .filter(Boolean);

      const byCamera = new Map();
      for (const it of items) {
        if (!it.key) continue; // enforce same camera model constraint
        if (!byCamera.has(it.key)) byCamera.set(it.key, []);
        byCamera.get(it.key).push(it);
      }

      const out = [];

      for (const group of byCamera.values()) {
        group.sort((a, b) => a.t.getTime() - b.t.getTime() || a.id.localeCompare(b.id));

        // Precompute indices of known-geo points for efficient nearest search.
        const knownIdx = [];
        for (let i = 0; i < group.length; i += 1) {
          if (Number.isFinite(group[i].lat) && Number.isFinite(group[i].lng)) knownIdx.push(i);
        }
        if (knownIdx.length < 2) continue;

        for (let i = 0; i < group.length; i += 1) {
          const cur = group[i];
          if (Number.isFinite(cur.lat) && Number.isFinite(cur.lng)) continue; // already has coords

          // Find nearest known before and after.
          let prev = null;
          let next = null;

          for (let k = knownIdx.length - 1; k >= 0; k -= 1) {
            const idx = knownIdx[k];
            if (idx < i) {
              prev = group[idx];
              break;
            }
          }
          for (let k = 0; k < knownIdx.length; k += 1) {
            const idx = knownIdx[k];
            if (idx > i) {
              next = group[idx];
              break;
            }
          }

          if (!prev || !next) continue;
          if (!Number.isFinite(prev.lat) || !Number.isFinite(prev.lng)) continue;
          if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) continue;

          const t0 = prev.t.getTime();
          const t1 = next.t.getTime();
          const t = cur.t.getTime();
          if (!(t0 < t && t < t1)) continue;

          const span = t1 - t0;
          if (span <= 0 || span > windowMs) continue; // enforce max span between bracket points

          const w = (t - t0) / span;
          const proposedLat = prev.lat + w * (next.lat - prev.lat);
          const proposedLng = prev.lng + w * (next.lng - prev.lng);
          if (!Number.isFinite(proposedLat) || !Number.isFinite(proposedLng)) continue;

          out.push({
            imageId: cur.id,
            captureTimestamp: cur.t.toISOString(),
            cameraMake: cur.make,
            cameraModel: cur.model,
            proposedLatitude: proposedLat,
            proposedLongitude: proposedLng,
            prevImageId: prev.id,
            prevCaptureTimestamp: prev.t.toISOString(),
            prevLatitude: prev.lat,
            prevLongitude: prev.lng,
            nextImageId: next.id,
            nextCaptureTimestamp: next.t.toISOString(),
            nextLatitude: next.lat,
            nextLongitude: next.lng,
            spanMinutes: span / 60000,
          });
        }
      }

      // Sort suggestions by time, then id for determinism.
      out.sort((a, b) =>
        String(a.captureTimestamp).localeCompare(String(b.captureTimestamp)) ||
        String(a.imageId).localeCompare(String(b.imageId))
      );

      return out;
    } finally {
      client.release();
    }
  }
}
