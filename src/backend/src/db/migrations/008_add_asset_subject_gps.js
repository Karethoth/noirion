export const up = async (pgClient) => {
  await pgClient.query(`
    ALTER TABLE asset_metadata_manual
      ADD COLUMN IF NOT EXISTS subject_gps geometry(Point,4326);

    CREATE INDEX IF NOT EXISTS idx_asset_metadata_manual_subject_gps
      ON asset_metadata_manual
      USING GIST(subject_gps);
  `);
};

export const down = async (pgClient) => {
  await pgClient.query(`
    DROP INDEX IF EXISTS idx_asset_metadata_manual_subject_gps;

    ALTER TABLE asset_metadata_manual
      DROP COLUMN IF EXISTS subject_gps;
  `);
};
