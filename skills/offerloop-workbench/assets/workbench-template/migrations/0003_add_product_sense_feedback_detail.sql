BEGIN;

ALTER TABLE product_sense_feedback
  ADD COLUMN IF NOT EXISTS reason_detail text;

ALTER TABLE product_sense_feedback
  ADD COLUMN IF NOT EXISTS inferred_reason varchar(32);

COMMENT ON COLUMN product_sense_feedback.reason_detail IS
  'Original user text when dislike reason is 其他原因';
COMMENT ON COLUMN product_sense_feedback.inferred_reason IS
  'Explainable normalized reason inferred from reason_detail';

COMMIT;
