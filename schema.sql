CREATE TABLE IF NOT EXISTS locations (
  id BIGSERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  timestamp BIGINT NOT NULL,
  accuracy REAL,
  device_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp DESC);
