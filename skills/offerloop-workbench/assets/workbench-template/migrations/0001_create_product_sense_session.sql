BEGIN;

CREATE TABLE IF NOT EXISTS product_sense_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner user_profile NOT NULL,
  active_question_id varchar(100) NOT NULL DEFAULT 'feature-retirement',
  status varchar(32) NOT NULL DEFAULT 'recommended',
  draft text NOT NULL DEFAULT '',
  followup_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  self_summary text NOT NULL DEFAULT '',
  disliked_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  archive_node_token varchar(255),
  archive_obj_token varchar(255),
  archive_url text,
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

COMMENT ON TABLE product_sense_session IS
  'Per-user Product Sense recommendation, draft, and archive state';
COMMENT ON COLUMN product_sense_session.followup_answers IS
  '@type { [questionId: string]: string }';
COMMENT ON COLUMN product_sense_session.disliked_question_ids IS
  '@type string[]';
COMMENT ON COLUMN product_sense_session.completed_question_ids IS
  '@type string[]';

CREATE UNIQUE INDEX IF NOT EXISTS uk_product_sense_session_owner
  ON product_sense_session (((owner).user_id));
CREATE INDEX IF NOT EXISTS idx_product_sense_session_status
  ON product_sense_session (status);

ALTER TABLE product_sense_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON product_sense_session
  AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "修改全部数据" ON product_sense_session
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    current_setting('app.user_id'::text)
    = ((product_sense_session.owner).user_id)::text
  )
  WITH CHECK (
    current_setting('app.user_id'::text)
    = ((product_sense_session.owner).user_id)::text
  );

CREATE POLICY "查看全部数据" ON product_sense_session
  AS PERMISSIVE FOR SELECT TO authenticated USING (
    current_setting('app.user_id'::text)
    = ((product_sense_session.owner).user_id)::text
  );

CREATE POLICY "修改本人数据" ON product_sense_session
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    current_setting('app.user_id'::text)
    = ((product_sense_session.owner).user_id)::text
  )
  WITH CHECK (
    current_setting('app.user_id'::text)
    = ((product_sense_session.owner).user_id)::text
  );

COMMIT;
