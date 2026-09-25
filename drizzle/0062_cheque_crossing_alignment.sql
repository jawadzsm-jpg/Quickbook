ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cheque_crossing_offset_x double precision NOT NULL DEFAULT 0;
