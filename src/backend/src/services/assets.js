import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { exifr } from 'exifr';

export class AssetsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
    this.uploadDir = path.join(process.cwd(), 'uploads');
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
      const exifData = await exifr.parse(buffer);
      return exifData || {};
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
        let latitude = null;
        let longitude = null;
        if (exifData.latitude && exifData.longitude) {
          latitude = exifData.latitude;
          longitude = exifData.longitude;
        } else if (exifData.GPS) {
          latitude = exifData.GPS.latitude;
          longitude = exifData.GPS.longitude;
        }

        const gpsClause = latitude && longitude 
          ? `ST_SetSRID(ST_MakePoint($8, $7), 4326)` 
          : 'NULL';

        const exifQuery = `
          INSERT INTO asset_metadata_exif (
            asset_id, capture_timestamp, camera_make, camera_model, 
            width, height, gps, exif_raw
          ) VALUES ($1, $2, $3, $4, $5, $6, ${gpsClause}, $9)
        `;

        const exifValues = [
          asset.id,
          exifData.DateTimeOriginal || exifData.DateTime || null,
          exifData.Make || null,
          exifData.Model || null,
          assetData.width,
          assetData.height,
          JSON.stringify(exifData)
        ];

        if (latitude && longitude) {
          exifValues.splice(6, 0, latitude, longitude);
        }

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
               e.width, e.height, e.exif_raw,
               ST_Y(e.gps) as latitude, ST_X(e.gps) as longitude
        FROM assets a
        LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
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
               e.width, e.height, e.exif_raw,
               ST_Y(e.gps) as latitude, ST_X(e.gps) as longitude
        FROM assets a
        LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
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
               e.width, e.height, e.exif_raw,
               ST_Y(e.gps) as latitude, ST_X(e.gps) as longitude
        FROM assets a
        LEFT JOIN asset_metadata_exif e ON a.id = e.asset_id
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
               e.width, e.height, e.exif_raw,
               ST_Y(e.gps) as latitude, ST_X(e.gps) as longitude
        FROM assets a
        JOIN asset_metadata_exif e ON a.id = e.asset_id
        WHERE a.deleted_at IS NULL
        AND a.content_type LIKE 'image/%'
        AND e.gps IS NOT NULL
        AND ST_Within(
          e.gps,
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )
        ORDER BY a.uploaded_at DESC
      `, [southWest.lng, southWest.lat, northEast.lng, northEast.lat]);
      
      return result.rows.map(row => this.formatAssetResult(row));
    } finally {
      client.release();
    }
  }

  formatAssetResult(row) {
    return {
      id: row.id,
      filename: row.filename,
      originalName: row.filename, // assets table doesn't store original name separately
      filePath: row.storage_path,
      sha256Hash: row.sha256,
      fileSize: parseInt(row.size_bytes),
      mimeType: row.content_type,
      width: row.width,
      height: row.height,
      latitude: row.latitude,
      longitude: row.longitude,
      exifData: row.exif_raw,
      captureTimestamp: row.capture_timestamp?.toISOString(),
      cameraMake: row.camera_make,
      cameraModel: row.camera_model,
      uploadedAt: row.uploaded_at?.toISOString(),
      uploadedBy: row.uploader_id,
      metadata: row.metadata || {}
    };
  }
}