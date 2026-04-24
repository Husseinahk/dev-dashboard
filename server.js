// =============================================================================
// DevControl Dashboard — Local web UI for managing dev projects
// Author: Hussein
// Tech: Node.js + Express + WebSocket
// =============================================================================

const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { existsSync, readdirSync } = require('fs');

const CONFIG_FILE = path.join(__dirname, 'projects.json');
const EXAMPLE_FILE = path.join(__dirname, 'projects.example.json');

// First-run: copy example config if user has none yet
if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(EXAMPLE_FILE)) {
  fs.copyFileSync(EXAMPLE_FILE, CONFIG_FILE);
  console.log('First run: created projects.json from projects.example.json');
}

// ----- Config laden -----
// Merged defaultGroups aus globalSettings mit project-spezifischen Groups.
// Projekte koennen eine Default-Group ueberschreiben indem sie eine Group mit
// dem gleichen "name" definieren (z.B. eigene Git-Actions).
function loadConfig() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  const defaultGroups = (raw.globalSettings && raw.globalSettings.defaultGroups) || [];

  raw.projects = (raw.projects || []).map(project => {
    const projectGroups = project.groups || [];
    const projectGroupNames = new Set(projectGroups.map(g => g.name));

    // Projekt-Groups zuerst, dann nicht-ueberschriebene Defaults anhaengen
    const mergedGroups = [
      ...projectGroups,
      ...defaultGroups.filter(g => !projectGroupNames.has(g.name))
    ];

    return { ...project, groups: mergedGroups };
  });

  return raw;
}

let config = loadConfig();
const PORT = config.globalSettings.port || 3030;

// ----- Process-Tracking -----
// runningProcs: Map<actionKey, { proc, projectId, actionId, logs: string[] }>
// actionKey = `${projectId}::${actionId}`
const runningProcs = new Map();

// Logs aller Prozesse (auch beendete) — damit Browser-Refresh keine Output verliert
// historicalLogs: Map<actionKey, { projectId, actionId, logs: string, lastSeenAt }>
const historicalLogs = new Map();
const MAX_LOG_LENGTH = 200000; // Cap pro Tab gegen Memory-Leak

// Ready-Detection: Welche Prozesse haben "fertig"-Signal im Log gefunden?
// readyActions: Set<actionKey>
const readyActions = new Set();
const userStoppedKeys = new Set(); // Verhindert Crash-Notification bei manuellem Stop

// Patterns die signalisieren "dieser Prozess ist ready"
const READY_PATTERNS = [
  /compiled successfully/i,                          // Angular/Webpack
  /listening on:?\s*https?:\/\//i,                   // ASP.NET "Now listening on: http://..."
  /open your browser on http/i,                     // Angular CLI
  /\bready\b.*started server/i,                      // Next.js
  /server running at http/i,                         // diverse
  /local:\s+http:\/\/localhost/i                     // Vite
];

function checkReady(key, line) {
  if (readyActions.has(key)) return; // schon ready
  for (const re of READY_PATTERNS) {
    if (re.test(line)) {
      readyActions.add(key);
      broadcast({ type: 'ready', key });
      break;
    }
  }
}

function appendLog(key, projectId, actionId, line) {
  let entry = historicalLogs.get(key);
  if (!entry) {
    entry = { projectId, actionId, logs: '', lastSeenAt: Date.now() };
    historicalLogs.set(key, entry);
  }
  entry.logs += line;
  entry.lastSeenAt = Date.now();
  // Trim if too large (keep last MAX_LOG_LENGTH chars)
  if (entry.logs.length > MAX_LOG_LENGTH) {
    entry.logs = '... [truncated] ...\n' + entry.logs.slice(-MAX_LOG_LENGTH);
  }
}

function actionKey(projectId, actionId) {
  return `${projectId}::${actionId}`;
}

// ----- NVM-Version-Discovery -----
function findNodeVersionDir(versionPrefix) {
  const nvmHome = config.globalSettings.nvmHome
    || process.env.NVM_HOME
    || path.join(process.env.APPDATA || '', 'nvm');

  if (!existsSync(nvmHome)) {
    return null;
  }

  // Suche nach v{version}* Verzeichnissen
  const dirs = readdirSync(nvmHome, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('v'))
    .map(d => d.name);

  // Wenn exakte Version (z.B. "14.21.2"): finde "v14.21.2"
  // Wenn nur Major (z.B. "14"): finde alle "v14.*" und nimm höchste
  const matching = dirs.filter(d => {
    const v = d.substring(1); // remove "v"
    return v === versionPrefix || v.startsWith(versionPrefix + '.');
  });

  if (matching.length === 0) return null;

  // Sortiere nach Versionsnummer (descending), nimm höchste
  matching.sort((a, b) => {
    const aParts = a.substring(1).split('.').map(Number);
    const bParts = b.substring(1).split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aN = aParts[i] || 0;
      const bN = bParts[i] || 0;
      if (aN !== bN) return bN - aN;
    }
    return 0;
  });

  return path.join(nvmHome, matching[0]);
}

function buildEnv(project) {
  const env = { ...process.env };

  if (project && project.nodeVersion) {
    const nodeDir = findNodeVersionDir(project.nodeVersion);
    if (nodeDir) {
      // Prepend node-dir to PATH (only for this child process)
      env.PATH = `${nodeDir};${env.PATH || env.Path || ''}`;
      env.NVM_USED_VERSION = path.basename(nodeDir); // info for client
    }
  }

  return env;
}

function getActiveNodeVersion(project) {
  if (!project || !project.nodeVersion) return null;
  const dir = findNodeVersionDir(project.nodeVersion);
  return dir ? path.basename(dir) : null;
}

// ----- Express App -----
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast log line to all WS clients
function broadcast(message) {
  // Persist log lines so they survive browser refresh
  if (message.type === 'log') {
    const [projectId, actionId] = (message.key || '::').split('::');
    appendLog(message.key, projectId, actionId, message.line);
  }
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function broadcastStatus() {
  const running = [];
  runningProcs.forEach((entry, key) => {
    running.push({ key, projectId: entry.projectId, actionId: entry.actionId });
  });
  broadcast({ type: 'status', running });
}

// ----- API Endpoints -----

// GET /api/config — return merged config (defaults + project groups) for UI rendering
app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  config = cfg; // reload on each request

  // Annotate with active node version
  const enriched = {
    ...cfg,
    projects: cfg.projects.map(p => ({
      ...p,
      activeNodeVersion: getActiveNodeVersion(p)
    }))
  };

  // Annotate running status
  const running = [];
  runningProcs.forEach((entry, key) => {
    running.push({ key, projectId: entry.projectId, actionId: entry.actionId });
  });
  enriched.running = running;

  res.json(enriched);
});

// GET /api/config/raw — return raw JSON file (ohne merge) for editing in Settings
app.get('/api/config/raw', (req, res) => {
  const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
  res.type('application/json').send(raw);
});

// POST /api/config — save updated config
app.post('/api/config', (req, res) => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2), 'utf-8');
    config = req.body;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared action runner — spawns a process or opens something.
// Returns { key, running: true|false, opened: true|false, error?: string }
function runActionInternal(project, action, params = {}) {
  return new Promise((resolve, reject) => {
    const projectId = project.id;
    const actionId = action.id;
    const key = actionKey(projectId, actionId);

    // Substitute prompt params
    let command = action.command;
    if (action.promptFor && params) {
      action.promptFor.forEach(p => {
        const placeholder = `{${p.name}}`;
        const value = params[p.name] || '';
        command = command.split(placeholder).join(value);
      });
    }

    const cwd = action.cwd
      ? path.join(project.path, action.cwd)
      : project.path;

    const env = buildEnv(project);
    userStoppedKeys.delete(key);

    // "open" type
    if (action.type === 'open') {
      exec(command, { cwd, env }, (err) => {
        if (err) broadcast({ type: 'log', key, line: `[ERROR] ${err.message}\n`, level: 'error' });
      });
      broadcast({ type: 'log', key, line: `[OPEN] ${command}\n`, level: 'info' });
      resolve({ key, opened: true });
      return;
    }

    if (runningProcs.has(key)) {
      return reject(new Error('Action already running'));
    }

    broadcast({
      type: 'log',
      key,
      line: `\n========================================\n[START] ${action.label}\n  cmd: ${command}\n  cwd: ${cwd}\n  node: ${env.NVM_USED_VERSION || 'system default'}\n========================================\n`,
      level: 'info'
    });

    const proc = spawn(command, [], { cwd, env, shell: true, windowsHide: true });
    const entry = { proc, projectId, actionId, logs: [] };
    runningProcs.set(key, entry);
    broadcastStatus();

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      entry.logs.push(line);
      checkReady(key, line);
      broadcast({ type: 'log', key, line, level: 'stdout' });
    });

    proc.stderr.on('data', (data) => {
      const line = data.toString();
      entry.logs.push(line);
      checkReady(key, line);
      broadcast({ type: 'log', key, line, level: 'stderr' });
    });

    proc.on('close', (code) => {
      const label = action.label;
      const wasUserStopped = userStoppedKeys.has(key);
      userStoppedKeys.delete(key);
      readyActions.delete(key);

      broadcast({
        type: 'log',
        key,
        line: `\n[EXIT ${code}] ${label}\n`,
        level: code === 0 ? 'info' : 'error'
      });

      if (code !== 0 && !wasUserStopped && action.type === 'long-running') {
        broadcast({ type: 'crash', key, projectId, actionId, label, code });
      }
      runningProcs.delete(key);
      broadcastStatus();
    });

    proc.on('error', (err) => {
      broadcast({ type: 'log', key, line: `[ERROR] ${err.message}\n`, level: 'error' });
      runningProcs.delete(key);
      broadcastStatus();
    });

    // For long-running: resolve immediately (process runs in background)
    // For one-shot: resolve on close
    if (action.type === 'long-running') {
      setTimeout(() => resolve({ key, running: true }), 200);
    } else {
      proc.once('close', () => resolve({ key, ran: true }));
    }
  });
}

// POST /api/run — execute an action
// Body: { projectId, actionId, params?: { name: value } }
app.post('/api/run', async (req, res) => {
  const { projectId, actionId, params } = req.body;

  const project = config.projects.find(p => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const action = project.groups
    .flatMap(g => g.actions)
    .find(a => a.id === actionId);
  if (!action) return res.status(404).json({ error: 'Action not found' });

  // ----- "chain" type: startet mehrere Actions nacheinander -----
  if (action.type === 'chain') {
    const chainKey = actionKey(projectId, actionId);
    broadcast({ type: 'log', key: chainKey, line: `\n[CHAIN] ${action.label} starts...\n`, level: 'info' });

    const targetIds = action.chain || [];
    const results = [];
    for (const targetId of targetIds) {
      const targetAction = project.groups.flatMap(g => g.actions).find(a => a.id === targetId);
      if (!targetAction) {
        broadcast({ type: 'log', key: chainKey, line: `[CHAIN-ERROR] action "${targetId}" not found\n`, level: 'error' });
        continue;
      }
      // Recursive: call /api/run internally by reusing this endpoint logic
      broadcast({ type: 'log', key: chainKey, line: `[CHAIN] triggering "${targetAction.label}" (${targetAction.type})\n`, level: 'info' });
      // Fake a request body — spawn asynchronously without awaiting long-running
      try {
        await runActionInternal(project, targetAction, params || {});
        results.push({ id: targetId, ok: true });
      } catch (err) {
        results.push({ id: targetId, ok: false, error: err.message });
        broadcast({ type: 'log', key: chainKey, line: `[CHAIN-ERROR] ${err.message}\n`, level: 'error' });
      }
    }
    broadcast({ type: 'log', key: chainKey, line: `[CHAIN-DONE] ${action.label}\n`, level: 'info' });
    return res.json({ ok: true, results });
  }

  // Alle anderen Action-Typen → shared runner
  try {
    const result = await runActionInternal(project, action, params || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

// POST /api/stop — stop a running process
app.post('/api/stop', (req, res) => {
  const { projectId, actionId } = req.body;
  const key = actionKey(projectId, actionId);
  const entry = runningProcs.get(key);

  if (!entry) {
    return res.status(404).json({ error: 'Process not running' });
  }

  // Mark as user-stopped — verhindert Crash-Notification
  userStoppedKeys.add(key);

  const pid = entry.proc.pid;
  broadcast({ type: 'log', key, line: `\n[STOP-REQUEST] killing PID ${pid} and child tree...\n`, level: 'info' });

  // Windows: kill process tree using taskkill /T (tree) /F (force)
  exec(`taskkill /PID ${pid} /T /F`, (err, stdout, stderr) => {
    if (err) {
      // Sometimes process already exited — that's ok
      broadcast({ type: 'log', key, line: `[STOP-WARN] ${err.message.trim()}\n`, level: 'error' });
    }
    if (stdout) broadcast({ type: 'log', key, line: stdout, level: 'info' });
    if (stderr) broadcast({ type: 'log', key, line: stderr, level: 'error' });

    // Force-clear the entry even if taskkill errored (avoid stuck "running" state)
    if (runningProcs.has(key)) {
      runningProcs.delete(key);
      broadcast({ type: 'log', key, line: `[STOPPED] removed from running list\n`, level: 'info' });
      broadcastStatus();
    }
  });

  res.json({ ok: true });
});

// GET /api/git/:projectId — liefert aktuellen Git-Status (Branch, Dirty-Count, Ahead/Behind)
app.get('/api/git/:projectId', (req, res) => {
  const project = config.projects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const cwd = project.path;
  const run = (cmd) => new Promise((resolve) => {
    exec(cmd, { cwd, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : (stdout || '').trim());
    });
  });

  Promise.all([
    run('git rev-parse --abbrev-ref HEAD'),
    run('git status --porcelain'),
    run('git rev-list --count --left-right @{upstream}...HEAD')
  ]).then(([branch, porcelain, ahead]) => {
    const dirty = porcelain ? porcelain.split('\n').filter(Boolean).length : 0;
    // "behind\tahead" format
    const parts = (ahead || '').split(/\s+/);
    const behindCount = parseInt(parts[0] || '0', 10) || 0;
    const aheadCount = parseInt(parts[1] || '0', 10) || 0;
    res.json({
      branch: branch || '(detached)',
      dirty,
      ahead: aheadCount,
      behind: behindCount,
      isGitRepo: !!branch
    });
  });
});

// GET /api/logs/:projectId/:actionId — get historical logs (after browser refresh)
app.get('/api/logs/:projectId/:actionId', (req, res) => {
  const key = actionKey(req.params.projectId, req.params.actionId);
  const entry = historicalLogs.get(key);
  res.json({ logs: entry ? entry.logs : '' });
});

// GET /api/tabs — alle historischen Tabs (mit oder ohne aktivem Prozess)
// Wird beim Browser-Init aufgerufen um Tabs + Logs wiederherzustellen
app.get('/api/tabs', (req, res) => {
  const tabs = [];
  historicalLogs.forEach((entry, key) => {
    tabs.push({
      key,
      projectId: entry.projectId,
      actionId: entry.actionId,
      logs: entry.logs,
      lastSeenAt: entry.lastSeenAt,
      isRunning: runningProcs.has(key)
    });
  });
  // Newest first
  tabs.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  res.json({ tabs });
});

// DELETE /api/tabs/:key — Tab schliessen + Logs verwerfen
app.delete('/api/tabs/:key', (req, res) => {
  historicalLogs.delete(req.params.key);
  res.json({ ok: true });
});

// ----- Start server -----
server.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────────────────┐`);
  console.log(`│  DevControl Dashboard                   │`);
  console.log(`│  → http://localhost:${PORT}                 │`);
  console.log(`└─────────────────────────────────────────┘\n`);

  if (config.globalSettings.openBrowserOnStart) {
    setTimeout(() => {
      exec(`start http://localhost:${PORT}`);
    }, 500);
  }
});

// Graceful shutdown — kill all running children
process.on('SIGINT', () => {
  console.log('\nShutting down — killing all child processes...');
  runningProcs.forEach((entry) => {
    try { exec(`taskkill /pid ${entry.proc.pid} /T /F`); } catch (e) { }
  });
  process.exit(0);
});
