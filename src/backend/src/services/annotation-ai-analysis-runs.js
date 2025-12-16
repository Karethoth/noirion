import fs from 'fs/promises';
import path from 'path';

export class AnnotationAiAnalysisRunsService {
  constructor(dbPool) {
    this.dbPool = dbPool;
  }

  async createRun({
    annotationId,
    assetId,
    regionId = null,
    createdBy = null,
    model = null,
    analysis = {},
    cropBuffer = null,
    cropMimeType = 'image/jpeg',
    cropDebug = null,
  }) {
    const { rows } = await this.dbPool.query(
      `
        INSERT INTO annotation_ai_analysis_runs (
          annotation_id,
          asset_id,
          region_id,
          created_by,
          model,
          analysis,
          crop_debug
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        RETURNING id
      `,
      [
        annotationId,
        assetId,
        regionId,
        createdBy,
        model,
        JSON.stringify(analysis || {}),
        JSON.stringify(cropDebug || null),
      ]
    );

    const runId = rows[0]?.id;
    let cropPath = null;

    if (runId && cropBuffer) {
      const dir = path.join(process.cwd(), 'uploads', 'annotation-analysis');
      await fs.mkdir(dir, { recursive: true });

      const ext = cropMimeType === 'image/png' ? 'png' : 'jpg';
      const filename = `annotation_${annotationId}_run_${runId}.${ext}`;
      const abs = path.join(dir, filename);
      await fs.writeFile(abs, cropBuffer);

      cropPath = `/uploads/annotation-analysis/${filename}`;
      await this.dbPool.query(
        `UPDATE annotation_ai_analysis_runs SET crop_path = $2 WHERE id = $1`,
        [runId, cropPath]
      );
    }

    return { id: runId, cropPath };
  }

  async listRuns({ annotationId = null, limit = 20 } = {}) {
    const lim = Math.max(1, Math.min(200, Number(limit) || 20));

    if (annotationId) {
      const { rows } = await this.dbPool.query(
        `
          SELECT
            r.id,
            r.annotation_id,
            r.asset_id,
            r.region_id,
            r.created_at,
            r.created_by,
            r.model,
            r.analysis,
            r.crop_path,
            r.crop_debug,
            a.filename AS asset_filename
          FROM annotation_ai_analysis_runs r
          JOIN assets a ON a.id = r.asset_id
          WHERE r.annotation_id = $1
          ORDER BY r.created_at DESC
          LIMIT $2
        `,
        [annotationId, lim]
      );
      return rows;
    }

    const { rows } = await this.dbPool.query(
      `
        SELECT
          r.id,
          r.annotation_id,
          r.asset_id,
          r.region_id,
          r.created_at,
          r.created_by,
          r.model,
          r.analysis,
          r.crop_path,
          r.crop_debug,
          a.filename AS asset_filename
        FROM annotation_ai_analysis_runs r
        JOIN assets a ON a.id = r.asset_id
        ORDER BY r.created_at DESC
        LIMIT $1
      `,
      [lim]
    );

    return rows;
  }
}
