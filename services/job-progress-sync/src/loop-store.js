import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { WORKFLOWS } from "./loop-runtime.js";

const WORKFLOW_EDGES = Object.freeze({
  [WORKFLOWS.OPPORTUNITY]: Object.freeze({
    discovered: ["hard_rejected", "awaiting_confirmation", "accepted"],
    awaiting_confirmation: ["accepted", "ignored", "suppressed"],
    accepted: ["deduplicated", "written"],
    deduplicated: ["written", "terminated"],
    hard_rejected: ["terminated"],
    ignored: ["terminated"],
    suppressed: ["terminated"],
    written: ["completed"],
  }),
  [WORKFLOWS.APPLICATION_PROGRESS]: Object.freeze({
    received: ["awaiting_confirmation", "applied"],
    awaiting_confirmation: ["applied", "ignored"],
    applied: ["completed"],
    ignored: ["completed"],
  }),
});

function emptyState() {
  return {
    schema_version: 1,
    workflows: {},
    node_runs: [],
    ability_observations: {},
    tasks: {},
    approvals: {},
    idempotency_keys: {},
  };
}

export class LoopStore {
  constructor(filePath, { clock = () => new Date() } = {}) {
    if (!String(filePath ?? "").trim()) throw new Error("filePath is required");
    this.filePath = filePath;
    this.clock = clock;
    this.state = emptyState();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      this.state = { ...emptyState(), ...parsed };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.state = emptyState();
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone(this.state);
  }

  async persist() {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }

  async createWorkflow({ instance_id, workflow, initial_node, source, idempotency_key }) {
    if (!WORKFLOW_EDGES[workflow]) throw new Error("unknown workflow");
    if (!WORKFLOW_EDGES[workflow][initial_node]) throw new Error("invalid initial node");
    if (this.state.workflows[instance_id]) return this.state.workflows[instance_id];
    if (idempotency_key && this.state.idempotency_keys[idempotency_key]) {
      return this.state.workflows[this.state.idempotency_keys[idempotency_key]];
    }
    const now = this.clock().toISOString();
    const instance = {
      instance_id,
      workflow,
      current_node: initial_node,
      status: "running",
      source,
      result: null,
      next_step: null,
      created_at: now,
      updated_at: now,
    };
    this.state.workflows[instance_id] = instance;
    if (idempotency_key) this.state.idempotency_keys[idempotency_key] = instance_id;
    await this.persist();
    return structuredClone(instance);
  }

  async transition(instanceId, nextNode, { result = null, next_step = null } = {}) {
    const instance = this.state.workflows[instanceId];
    if (!instance) throw new Error("workflow instance not found");
    const allowed = WORKFLOW_EDGES[instance.workflow]?.[instance.current_node] ?? [];
    if (!allowed.includes(nextNode)) throw new Error("workflow transition is not allowed");
    const startedAt = this.clock().toISOString();
    instance.current_node = nextNode;
    instance.result = result;
    instance.next_step = next_step;
    instance.updated_at = startedAt;
    if (["completed", "terminated"].includes(nextNode)) instance.status = "completed";
    if (nextNode === "paused") instance.status = "paused";
    this.state.node_runs.push({
      instance_id: instanceId,
      node: nextNode,
      status: instance.status,
      result,
      occurred_at: startedAt,
    });
    await this.persist();
    return structuredClone(instance);
  }

  async claimAction(idempotencyKey, value) {
    if (this.state.approvals[idempotencyKey]) {
      return { claimed: false, value: structuredClone(this.state.approvals[idempotencyKey]) };
    }
    this.state.approvals[idempotencyKey] = {
      ...value,
      claimed_at: this.clock().toISOString(),
    };
    await this.persist();
    return { claimed: true, value: structuredClone(this.state.approvals[idempotencyKey]) };
  }
}

export { WORKFLOW_EDGES };
