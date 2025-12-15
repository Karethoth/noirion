export const up = async (pgClient) => {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      occurred_at timestamptz NOT NULL,
      geom geometry(Point,4326),
      title text NOT NULL,
      description text,
      created_by uuid REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_events_geom ON events USING GIST(geom);
  `);
};

export const down = async (pgClient) => {
  await pgClient.query(`DROP TABLE IF EXISTS events CASCADE;`);
};
