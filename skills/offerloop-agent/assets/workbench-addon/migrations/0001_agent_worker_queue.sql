BEGIN;

CREATE TABLE agent_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner user_profile NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'queued',
  message text NOT NULL,
  route varchar(128) NOT NULL DEFAULT 'auto',
  confirmed boolean NOT NULL DEFAULT false,
  session_id varchar(255),
  progress text NOT NULL DEFAULT '等待本机 Agent 领取任务',
  result text,
  error text,
  worker_id varchar(128),
  lease_expires_at TIMESTAMP(3) WITH TIME ZONE,
  started_at TIMESTAMP(3) WITH TIME ZONE,
  completed_at TIMESTAMP(3) WITH TIME ZONE,
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

ALTER TABLE agent_run ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON agent_run
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY authenticated_owner_policy ON agent_run
  FOR ALL TO authenticated
  USING (
    current_setting('app.user_id'::text, true) =
    ((owner).user_id)::text
  )
  WITH CHECK (
    current_setting('app.user_id'::text, true) =
    ((owner).user_id)::text
  );

CREATE INDEX idx_agent_run_status_created
  ON agent_run (status, _created_at);

CREATE INDEX idx_agent_run_owner_created
  ON agent_run (((owner).user_id), _created_at DESC);

COMMENT ON TABLE agent_run IS
  'OfferLoop workbench tasks claimed by the local Codex worker';

CREATE TABLE agent_worker (
  id varchar(128) PRIMARY KEY,
  owner user_profile NOT NULL,
  display_name varchar(255) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'offline',
  codex_available boolean NOT NULL DEFAULT false,
  version varchar(64),
  last_seen_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
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

ALTER TABLE agent_worker ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON agent_worker
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY authenticated_owner_policy ON agent_worker
  FOR ALL TO authenticated
  USING (
    current_setting('app.user_id'::text, true) =
    ((owner).user_id)::text
  )
  WITH CHECK (
    current_setting('app.user_id'::text, true) =
    ((owner).user_id)::text
  );

CREATE INDEX idx_agent_worker_last_seen
  ON agent_worker (((owner).user_id), last_seen_at DESC);

COMMENT ON TABLE agent_worker IS
  'Heartbeat state for local OfferLoop Codex workers';

COMMIT;
