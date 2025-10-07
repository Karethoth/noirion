export const up = async (pgClient) => {
  await pgClient.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS postgis;
  `);

  await pgClient.query(`
    CREATE TYPE user_role AS ENUM ('investigator','admin','analyst','readonly');
  `);

  await pgClient.query(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text UNIQUE NOT NULL,
      email text UNIQUE NOT NULL,
      full_name text,
      password_hash text,
      role user_role NOT NULL DEFAULT 'investigator',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb DEFAULT '{}'
    );
  `);

  await pgClient.query(`
    CREATE TABLE entity_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      description text,
      attribute_defs jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await pgClient.query(`
    CREATE TABLE entities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type text NOT NULL,          -- template name
      display_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb DEFAULT '{}'
    );
  `);

  await pgClient.query(`
    CREATE TABLE entity_attributes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id uuid REFERENCES entities(id) ON DELETE CASCADE,
      attribute_name text NOT NULL,
      attribute_value jsonb NOT NULL,
      confidence numeric(5,4) DEFAULT 1.0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await pgClient.query(`
    CREATE TABLE tags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type text,
      value text NOT NULL,
      name text GENERATED ALWAYS AS (COALESCE(type,'general') || ':' || value) STORED,
      UNIQUE(type, value)
    );
  `);

  await pgClient.query(`
    CREATE TABLE entity_tags (
      entity_id uuid REFERENCES entities(id) ON DELETE CASCADE,
      tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(entity_id, tag_id)
    );
  `);

  await pgClient.query(`
    CREATE TABLE entity_attribute_tags (
      entity_attribute_id uuid REFERENCES entity_attributes(id) ON DELETE CASCADE,
      tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(entity_attribute_id, tag_id)
    );
  `);

  await pgClient.query(`
    CREATE TABLE entity_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      from_entity uuid REFERENCES entities(id) ON DELETE CASCADE,
      to_entity uuid REFERENCES entities(id) ON DELETE CASCADE,
      relation_type text NOT NULL,
      confidence numeric(5,4) DEFAULT 1.0,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id),
      metadata jsonb DEFAULT '{}'
    );
  `);

  await pgClient.query(`
    CREATE TABLE entity_link_tags (
      entity_link_id uuid REFERENCES entity_links(id) ON DELETE CASCADE,
      tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(entity_link_id, tag_id)
    );
  `);

  await pgClient.query(`
    CREATE TABLE assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      uploader_id uuid REFERENCES users(id),
      filename text NOT NULL,
      content_type text,
      size_bytes bigint NOT NULL,
      sha256 text NOT NULL,
      storage_path text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      uploaded_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      metadata jsonb DEFAULT '{}'
    );
  `);

  await pgClient.query(`
    CREATE TABLE asset_metadata_exif (
      asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
      capture_timestamp timestamptz,
      camera_make text,
      camera_model text,
      orientation int,
      width int,
      height int,
      gps geometry(Point,4326),
      altitude numeric,
      iso integer,
      aperture numeric(4,2),
      shutter_speed numeric(10,6),
      focal_length numeric(6,2),
      focal_length_35mm integer,
      flash integer,
      flash_mode text,
      exposure_program integer,
      exposure_bias numeric(4,2),
      metering_mode integer,
      white_balance integer,
      color_space integer,
      lens text,
      software text,
      copyright text,
      artist text,
      exif_raw jsonb DEFAULT '{}'
    );
  `);

  await pgClient.query(`
    CREATE TABLE asset_ocr (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id uuid REFERENCES assets(id) ON DELETE CASCADE,
      ocr_text text,
      ocr_json jsonb DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id)
    );
  `);

  await pgClient.query(`
    CREATE TABLE presences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      observed_at timestamptz NOT NULL,
      observed_by uuid REFERENCES users(id),
      source_asset uuid REFERENCES assets(id) ON DELETE SET NULL,
      source_type text,
      geom geometry(Point,4326),
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      metadata jsonb DEFAULT '{}'
    );
  `);

  await pgClient.query(`
    CREATE TABLE presence_entities (
      presence_id uuid REFERENCES presences(id) ON DELETE CASCADE,
      entity_id uuid REFERENCES entities(id) ON DELETE CASCADE,
      role text,
      confidence numeric(5,4) DEFAULT 1.0,
      PRIMARY KEY(presence_id, entity_id)
    );
  `);

  await pgClient.query(`
    CREATE INDEX idx_entities_type ON entities(entity_type);
    CREATE INDEX idx_entity_attributes_entity_id ON entity_attributes(entity_id);
    CREATE INDEX idx_entity_attributes_name ON entity_attributes(attribute_name);
    CREATE INDEX idx_entity_links_from_entity ON entity_links(from_entity);
    CREATE INDEX idx_entity_links_to_entity ON entity_links(to_entity);
    CREATE INDEX idx_assets_uploader_id ON assets(uploader_id);
    CREATE INDEX idx_assets_filename ON assets(filename);
    CREATE INDEX idx_asset_metadata_exif_camera_make ON asset_metadata_exif(camera_make);
    CREATE INDEX idx_asset_metadata_exif_camera_model ON asset_metadata_exif(camera_model);
    CREATE INDEX idx_asset_metadata_exif_capture_timestamp ON asset_metadata_exif(capture_timestamp);
    CREATE INDEX idx_asset_metadata_exif_gps ON asset_metadata_exif USING GIST(gps);
    CREATE INDEX idx_asset_metadata_exif_altitude ON asset_metadata_exif(altitude) WHERE altitude IS NOT NULL;
    CREATE INDEX idx_presences_observed_at ON presences(observed_at);
    CREATE INDEX idx_presences_geom ON presences USING GIST(geom);
  `);

  // General-purpose system log table
  await pgClient.query(`
    CREATE TABLE system_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      log_level text NOT NULL, -- e.g. 'error', 'warn', 'info', 'debug'
      event_type text,         -- e.g. 'asset_upload', 'user_login', 'db_error', etc.
      message text NOT NULL,
      details jsonb DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id)
    );
    CREATE INDEX idx_system_logs_level ON system_logs(log_level);
    CREATE INDEX idx_system_logs_event_type ON system_logs(event_type);
    CREATE INDEX idx_system_logs_created_at ON system_logs(created_at DESC);
  `);
};

export const down = async (pgClient) => {
  await pgClient.query(`DROP TABLE IF EXISTS system_logs CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS presence_entities CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS presences CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS asset_ocr CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS asset_metadata_exif CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS assets CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS entity_link_tags CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS entity_links CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS entity_attribute_tags CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS entity_tags CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS tags CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS entity_attributes CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS entities CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS entity_templates CASCADE;`);
  await pgClient.query(`DROP TABLE IF EXISTS users CASCADE;`);

  await pgClient.query(`DROP TYPE IF EXISTS user_role;`);
};