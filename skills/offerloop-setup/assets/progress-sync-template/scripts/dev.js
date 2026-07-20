#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const readline = require('readline');

// ── Project root ──────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..');
process.chdir(PROJECT_ROOT);

// ── Load .env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
loadEnv();

// ── Configuration ─────────────────────────────────────────────────────────────
const LOG_DIR = process.env.LOG_DIR || 'logs';
const MAX_RESTART_COUNT = process.env.MAX_RESTART_COUNT != null && process.env.MAX_RESTART_COUNT !== ''
  ? parseInt(process.env.MAX_RESTART_COUNT, 10)
  : Infinity;
const RESTART_DELAY = parseInt(process.env.RESTART_DELAY, 10) || 2;
const MAX_DELAY = 8;
const SERVER_PORT = process.env.SERVER_PORT || '3000';
const CLIENT_DEV_PORT = process.env.CLIENT_DEV_PORT || '8080';

fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Logging infrastructure ────────────────────────────────────────────────────
const devStdLogPath = path.join(LOG_DIR, 'dev.std.log');
const devLogPath = path.join(LOG_DIR, 'dev.log');
const devStdLogFd = fs.openSync(devStdLogPath, 'a');
const devLogFd = fs.openSync(devLogPath, 'a');

function timestamp() {
  const now = new Date();
  return (
    now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0')
  );
}

/** Write to terminal + dev.std.log */
function writeOutput(msg) {
  try { process.stdout.write(msg); } catch {}
  try { fs.writeSync(devStdLogFd, msg); } catch {}
}

/** Structured event log → terminal + dev.std.log + dev.log */
function logEvent(level, name, message) {
  const msg = `[${timestamp()}] [${level}] [${name}] ${message}\n`;
  writeOutput(msg);
  try { fs.writeSync(devLogFd, msg); } catch {}
}

// ── Process group management ──────────────────────────────────────────────────
function killProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {}
}

function killOrphansByPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8', timeout: 5000 }).trim();
    if (pids) {
      const pidList = pids.split('\n').filter(Boolean);
      for (const p of pidList) {
        try { process.kill(parseInt(p, 10), 'SIGKILL'); } catch {}
      }
      return pidList;
    }
  } catch {}
  return [];
}

// ── Process supervision ───────────────────────────────────────────────────────
let stopping = false;
const managedProcesses = []; // { name, pid, child }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start and supervise a process with auto-restart and log piping.
 * Returns a promise that resolves when the process loop ends.
 */
function startProcess({ name, command, args, cleanupPort }) {
  const logFilePath = path.join(LOG_DIR, `${name}.std.log`);
  const logFd = fs.openSync(logFilePath, 'a');

  const entry = { name, pid: null, child: null };
  managedProcesses.push(entry);

  const run = async () => {
    let restartCount = 0;

    while (!stopping) {
      const child = spawn(command, args, {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        cwd: PROJECT_ROOT,
        env: { ...process.env },
      });

      entry.pid = child.pid;
      entry.child = child;

      const startTime = Date.now();
      logEvent('INFO', name, `Process started (PGID: ${child.pid}): ${command} ${args.join(' ')}`);

      // Pipe stdout and stderr through readline for timestamped logging
      const pipeLines = (stream) => {
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', (line) => {
          const msg = `[${timestamp()}] [${name}] ${line}\n`;
          try { fs.writeSync(logFd, msg); } catch {}
          writeOutput(msg);
        });
      };
      if (child.stdout) pipeLines(child.stdout);
      if (child.stderr) pipeLines(child.stderr);

      // Wait for the direct child to exit.
      // NOTE: must use 'exit', not 'close'. With shell:true, grandchild processes
      // (e.g. nest's server) inherit stdout pipes. 'close' won't fire until ALL
      // pipe holders exit, causing dev.js to hang when npm/nest dies but server survives.
      const exitCode = await new Promise((resolve) => {
        child.on('exit', (code) => resolve(code ?? 1));
        child.on('error', () => resolve(1));
      });

      // Kill the entire process group
      if (entry.pid) {
        killProcessGroup(entry.pid, 'SIGTERM');
        await sleep(2000);
        killProcessGroup(entry.pid, 'SIGKILL');
      }
      entry.pid = null;
      entry.child = null;

      // Port cleanup fallback
      if (cleanupPort) {
        const orphans = killOrphansByPort(cleanupPort);
        if (orphans.length > 0) {
          logEvent('WARN', name, `Killed orphan processes on port ${cleanupPort}: ${orphans.join(' ')}`);
          await sleep(500);
        }
      }

      if (stopping) break;

      const runDuration = (Date.now() - startTime) / 1000;
      if (runDuration >= 60) {
        restartCount = 0;
        logEvent('INFO', name, `Ran for ${Math.round(runDuration)}s, resetting restart counter`);
      } else {
        restartCount++;
      }
      if (restartCount >= MAX_RESTART_COUNT) {
        logEvent('ERROR', name, `Max restart count (${MAX_RESTART_COUNT}) reached, giving up`);
        break;
      }

      const delay = Math.min(RESTART_DELAY * (1 << Math.max(0, restartCount - 1)), MAX_DELAY);
      logEvent('WARN', name, `Process exited with code ${exitCode}, restarting (${restartCount}/${MAX_RESTART_COUNT}) in ${delay}s...`);
      await sleep(delay * 1000);
    }

    try { fs.closeSync(logFd); } catch {}
  };

  return run();
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
let cleanupDone = false;

async function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  stopping = true;

  logEvent('INFO', 'main', 'Shutting down all processes...');

  // Kill all managed process groups
  for (const entry of managedProcesses) {
    if (entry.pid) {
      logEvent('INFO', 'main', `Stopping process group (PGID: ${entry.pid})`);
      killProcessGroup(entry.pid, 'SIGTERM');
    }
  }

  // Wait for graceful shutdown
  await sleep(2000);

  // Force kill any remaining
  for (const entry of managedProcesses) {
    if (entry.pid) {
      logEvent('WARN', 'main', `Force killing process group (PGID: ${entry.pid})`);
      killProcessGroup(entry.pid, 'SIGKILL');
    }
  }

  // Port cleanup fallback
  killOrphansByPort(SERVER_PORT);
  killOrphansByPort(CLIENT_DEV_PORT);

  logEvent('INFO', 'main', 'All processes stopped');

  try { fs.closeSync(devStdLogFd); } catch {}
  try { fs.closeSync(devLogFd); } catch {}

  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGHUP', cleanup);

// Stale dist makes nest --watch skip missing files; watcher won't self-heal.
function cleanStaleDist() {
  const distPath = path.join(PROJECT_ROOT, 'dist');
  if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
    logEvent('INFO', 'main', 'Cleaned dist/ to force full rebuild');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  logEvent('INFO', 'main', '========== Dev session started ==========');

  cleanStaleDist();

  // Initialize action plugins
  writeOutput('\n🔌 Initializing action plugins...\n');
  try {
    execSync('fullstack-cli action-plugin init', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    writeOutput('✅ Action plugins initialized\n\n');
  } catch {
    writeOutput('⚠️  Action plugin initialization failed, continuing anyway...\n\n');
  }

  // Start server and client
  const serverPromise = startProcess({
    name: 'server',
    command: 'npm',
    args: ['run', 'dev:server'],
    cleanupPort: SERVER_PORT,
  });

  const clientPromise = startProcess({
    name: 'client',
    command: 'npm',
    args: ['run', 'dev:client'],
    cleanupPort: CLIENT_DEV_PORT,
  });

  writeOutput(`📋 Dev processes running. Press Ctrl+C to stop.\n`);
  writeOutput(`📄 Logs: ${devStdLogPath}\n\n`);

  // Wait for both (they loop until stopping or max restarts)
  await Promise.all([serverPromise, clientPromise]);

  if (!cleanupDone) {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
