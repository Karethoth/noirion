export const up = async (pgClient) => {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS project_settings (
      key text PRIMARY KEY,
      value jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_project_settings_updated_at ON project_settings(updated_at DESC);
  `);
};

export const down = async (pgClient) => {
  await pgClient.query(`DROP TABLE IF EXISTS project_settings CASCADE;`);
};
