export const up = async (pgClient) => {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS annotation_ai_analysis_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      annotation_id uuid NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
      asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      region_id uuid REFERENCES annotation_regions(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id),
      model text,
      analysis jsonb NOT NULL DEFAULT '{}',
      crop_path text,
      crop_debug jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_annotation_ai_analysis_runs_created_at ON annotation_ai_analysis_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_annotation_ai_analysis_runs_annotation_id ON annotation_ai_analysis_runs(annotation_id);
    CREATE INDEX IF NOT EXISTS idx_annotation_ai_analysis_runs_asset_id ON annotation_ai_analysis_runs(asset_id);
  `);
};

export const down = async (pgClient) => {
  await pgClient.query(`DROP TABLE IF EXISTS annotation_ai_analysis_runs CASCADE;`);
};
