export const up = async (pgClient) => {
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS event_entities (
      event_id uuid REFERENCES events(id) ON DELETE CASCADE,
      entity_id uuid REFERENCES entities(id) ON DELETE CASCADE,
      role text,
      confidence numeric(5,4) DEFAULT 1.0,
      PRIMARY KEY(event_id, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_event_entities_event_id ON event_entities(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_entities_entity_id ON event_entities(entity_id);
  `);
};

export const down = async (pgClient) => {
  await pgClient.query(`DROP TABLE IF EXISTS event_entities CASCADE;`);
};
