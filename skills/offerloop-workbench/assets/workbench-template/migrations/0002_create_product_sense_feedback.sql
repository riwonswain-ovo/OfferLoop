BEGIN;

CREATE TABLE IF NOT EXISTS product_sense_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner user_profile NOT NULL,
  question_id varchar(100) NOT NULL,
  question_prompt text NOT NULL,
  company varchar(100) NOT NULL,
  sector varchar(100) NOT NULL,
  logic_type varchar(32) NOT NULL,
  scope_type varchar(32) NOT NULL,
  knowledge_level varchar(32) NOT NULL,
  reason varchar(32) NOT NULL,
  fact_anchor text NOT NULL,
  source_url text NOT NULL,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE
      WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
      ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile
    END
  )
);

COMMENT ON TABLE product_sense_feedback IS
  'Permanent per-user Product Sense dislike feedback for recommendation learning';

CREATE INDEX IF NOT EXISTS idx_product_sense_feedback_owner_created
  ON product_sense_feedback (((owner).user_id), _created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_sense_feedback_question
  ON product_sense_feedback (question_id);
CREATE INDEX IF NOT EXISTS idx_product_sense_feedback_reason
  ON product_sense_feedback (reason);

ALTER TABLE product_sense_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON product_sense_feedback
  AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "修改全部数据" ON product_sense_feedback
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    current_setting('app.user_id'::text)
    = ((product_sense_feedback.owner).user_id)::text
  )
  WITH CHECK (
    current_setting('app.user_id'::text)
    = ((product_sense_feedback.owner).user_id)::text
  );

CREATE POLICY "查看全部数据" ON product_sense_feedback
  AS PERMISSIVE FOR SELECT TO authenticated USING (
    current_setting('app.user_id'::text)
    = ((product_sense_feedback.owner).user_id)::text
  );

CREATE POLICY "修改本人数据" ON product_sense_feedback
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    current_setting('app.user_id'::text)
    = ((product_sense_feedback.owner).user_id)::text
  )
  WITH CHECK (
    current_setting('app.user_id'::text)
    = ((product_sense_feedback.owner).user_id)::text
  );

COMMIT;
