export const up = async (pgClient) => {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS asset_metadata_manual (
      asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
      display_name text,
      capture_timestamp timestamptz,
      gps geometry(Point,4326),
      altitude numeric,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id),
      updated_by uuid REFERENCES users(id),
      metadata jsonb DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_asset_metadata_manual_gps ON asset_metadata_manual USING GIST(gps);
    CREATE INDEX IF NOT EXISTS idx_asset_metadata_manual_capture_timestamp ON asset_metadata_manual(capture_timestamp);
  `);
};

export const down = async (pgClient) => {
  await pgClient.query(`DROP TABLE IF EXISTS asset_metadata_manual CASCADE;`);
};
