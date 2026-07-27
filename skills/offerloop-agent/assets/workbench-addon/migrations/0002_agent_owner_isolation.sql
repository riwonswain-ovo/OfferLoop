BEGIN;

-- Worker rows are ephemeral heartbeats, so an upgrade can safely discard
-- pre-isolation rows before making the owner binding mandatory.
ALTER TABLE agent_worker
  ADD COLUMN IF NOT EXISTS owner user_profile;
DELETE FROM agent_worker WHERE owner IS NULL;
ALTER TABLE agent_worker
  ALTER COLUMN owner SET NOT NULL;

DROP POLICY IF EXISTS "修改全部数据" ON agent_run;
DROP POLICY IF EXISTS "查看全部数据" ON agent_run;
DROP POLICY IF EXISTS "修改本人数据" ON agent_run;
DROP POLICY IF EXISTS authenticated_owner_policy ON agent_run;
DROP POLICY IF EXISTS service_role_bypass_policy ON agent_run;
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

DROP POLICY IF EXISTS "修改全部数据" ON agent_worker;
DROP POLICY IF EXISTS "查看全部数据" ON agent_worker;
DROP POLICY IF EXISTS "修改本人数据" ON agent_worker;
DROP POLICY IF EXISTS authenticated_owner_policy ON agent_worker;
DROP POLICY IF EXISTS service_role_bypass_policy ON agent_worker;
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

DROP INDEX IF EXISTS idx_agent_worker_last_seen;
CREATE INDEX idx_agent_worker_last_seen
  ON agent_worker (((owner).user_id), last_seen_at DESC);

COMMIT;
