// =============================================================================
// DevControl Client (Alpine.js) — v2 mit Keyboard-Shortcuts, Toasts, Resize, etc.
// =============================================================================

function dashboard() {
  return {
    // State
    projects: [],
    activeProjectId: null,
    runningKeys: [],
    logs: {},
    logTabs: [],
    activeLogTab: null,

    // UI state
    collapsedGroups: {},      // { 'groupName': true/false }
    logSearch: '',
    autoScroll: true,
    logWidth: 600,             // resizable
    toasts: [],
    paletteOpen: false,
    paletteQuery: '',
    paletteIndex: 0,

    // Feature state
    readyKeys: [],             // actionKeys that reported ready
    gitStatus: {},             // projectId → { branch, dirty, ahead, behind }
    _gitPollTimer: null,

    // Settings
    openSettings: false,
    settingsTab: 'projects',
    settingsDirty: false,
    editConfig: { globalSettings: {}, projects: [] },
    editingProjectIdx: 0,

    prompt: { open: false, action: null, values: {} },
    ws: null,
    _resizeActive: false,

    // ----- Init -----
    async init() {
      await this.loadConfig();
      await this.restoreTabs();
      this.connectWS();
      this.restoreUiState();
      this.setupKeyboardShortcuts();
      this.setupResize();
      this.ensureNotificationPermission();
      this.startGitPolling();

      const last = localStorage.getItem('devcontrol.activeProject');
      if (last && this.projects.find(p => p.id === last)) {
        this.activeProjectId = last;
      } else if (this.projects.length > 0) {
        this.activeProjectId = this.projects[0].id;
      }

      const lastTab = localStorage.getItem('devcontrol.activeTab');
      if (lastTab && this.logTabs.includes(lastTab)) {
        this.activeLogTab = lastTab;
      }

      // Auto-scroll on logs update
      this.$watch('logs', () => {
        if (!this.autoScroll) return;
        this.$nextTick(() => {
          if (this.$refs.logBox) {
            this.$refs.logBox.scrollTop = this.$refs.logBox.scrollHeight;
          }
        });
      });

      this.$watch('activeLogTab', (val) => {
        if (val) localStorage.setItem('devcontrol.activeTab', val);
      });

      this.$watch('collapsedGroups', (val) => {
        localStorage.setItem('devcontrol.collapsedGroups', JSON.stringify(val));
      });

      this.$watch('logWidth', (val) => {
        localStorage.setItem('devcontrol.logWidth', String(val));
      });

      this.$watch('autoScroll', (val) => {
        localStorage.setItem('devcontrol.autoScroll', String(val));
      });
    },

    restoreUiState() {
      try {
        const collapsed = localStorage.getItem('devcontrol.collapsedGroups');
        if (collapsed) this.collapsedGroups = JSON.parse(collapsed);
      } catch (e) {}

      const w = parseInt(localStorage.getItem('devcontrol.logWidth') || '600', 10);
      if (w >= 300 && w <= 1400) this.logWidth = w;

      const as = localStorage.getItem('devcontrol.autoScroll');
      if (as !== null) this.autoScroll = as === 'true';
    },

    // ----- Keyboard Shortcuts -----
    setupKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Ignore when in input/textarea
        const tag = (e.target.tagName || '').toLowerCase();
        const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';

        // Ctrl+K — Command Palette
        if (e.ctrlKey && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.paletteOpen = true;
          this.paletteQuery = '';
          this.paletteIndex = 0;
          this.$nextTick(() => this.$refs.paletteInput && this.$refs.paletteInput.focus());
          return;
        }
        // Ctrl+/ — Focus Log Search
        if (e.ctrlKey && e.key === '/') {
          e.preventDefault();
          if (this.$refs.logSearchInput) this.$refs.logSearchInput.focus();
          return;
        }
        // Ctrl+Shift+S — Settings
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
          e.preventDefault();
          this.openSettingsEditor();
          return;
        }
      });
    },

    // ----- Resize Log Panel -----
    setupResize() {
      window.addEventListener('mousemove', (e) => {
        if (!this._resizeActive) return;
        const newWidth = window.innerWidth - e.clientX - 16;
        this.logWidth = Math.max(320, Math.min(1400, newWidth));
      });
      window.addEventListener('mouseup', () => {
        if (this._resizeActive) {
          this._resizeActive = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    },

    startResize(e) {
      e.preventDefault();
      this._resizeActive = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },

    // ----- Toast Notifications -----
    showToast(message, type = 'info', duration = 2500) {
      const id = Date.now() + Math.random();
      this.toasts.push({ id, message, type });
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, duration);
    },

    onProjectChange() {
      localStorage.setItem('devcontrol.activeProject', this.activeProjectId);
    },

    get activeProject() {
      return this.projects.find(p => p.id === this.activeProjectId);
    },

    // ----- Command Palette -----
    get filteredPaletteProjects() {
      const q = (this.paletteQuery || '').toLowerCase().trim();
      if (!q) return this.projects;
      return this.projects.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.path || '').toLowerCase().includes(q)
      );
    },

    selectPaletteProject() {
      const list = this.filteredPaletteProjects;
      const p = list[this.paletteIndex] || list[0];
      if (p) {
        this.activeProjectId = p.id;
        this.onProjectChange();
      }
      this.paletteOpen = false;
    },

    // ----- Group Collapse -----
    toggleGroup(name) {
      this.collapsedGroups[name] = !this.collapsedGroups[name];
      this.collapsedGroups = { ...this.collapsedGroups };
    },
    isGroupCollapsed(name) {
      return !!this.collapsedGroups[name];
    },

    // ----- Config (rendering) -----
    async loadConfig() {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      this.projects = cfg.projects;
      this.runningKeys = (cfg.running || []).map(r => r.key);
    },

    // ----- Settings Editor -----
    async openSettingsEditor() {
      const res = await fetch('/api/config/raw');
      const raw = await res.json();
      raw.globalSettings = raw.globalSettings || {};
      if (!Array.isArray(raw.globalSettings.defaultGroups)) raw.globalSettings.defaultGroups = [];
      raw.projects = Array.isArray(raw.projects) ? raw.projects : [];
      this.editConfig = raw;
      this.editingProjectIdx = raw.projects.length > 0 ? 0 : -1;
      this.settingsDirty = false;
      this.settingsTab = 'projects';
      this.openSettings = true;
    },

    cancelSettings() {
      if (this.settingsDirty) {
        if (!confirm('Unsaved changes — really cancel?')) return;
      }
      this.openSettings = false;
    },

    markDirty() { this.settingsDirty = true; },

    async saveConfig() {
      try {
        const clean = JSON.parse(JSON.stringify(this.editConfig));
        clean.projects.forEach(p => {
          if (!p.quickLinks) p.quickLinks = [];
          if (!p.groups) p.groups = [];
        });
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clean)
        });
        if (!res.ok) {
          const err = await res.json();
          this.showToast('Save failed: ' + (err.error || res.statusText), 'error');
          return;
        }
        this.settingsDirty = false;
        this.openSettings = false;
        await this.loadConfig();
        if (!this.projects.find(p => p.id === this.activeProjectId) && this.projects.length > 0) {
          this.activeProjectId = this.projects[0].id;
        }
        this.showToast('Settings gespeichert', 'success');
      } catch (err) {
        this.showToast('Save error: ' + err.message, 'error');
      }
    },

    get currentEditingProject() {
      if (this.editingProjectIdx < 0) return null;
      return this.editConfig.projects[this.editingProjectIdx] || null;
    },

    get defaultGroups() {
      if (!this.editConfig.globalSettings.defaultGroups) {
        this.editConfig.globalSettings.defaultGroups = [];
      }
      return this.editConfig.globalSettings.defaultGroups;
    },

    slugify(str) {
      return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('id-' + Date.now());
    },

    addProject() {
      const id = 'project-' + Date.now();
      this.editConfig.projects.push({ id, name: 'New Project', path: '', nodeVersion: '', groups: [], quickLinks: [] });
      this.editingProjectIdx = this.editConfig.projects.length - 1;
      this.markDirty();
    },
    deleteProject() {
      if (!this.currentEditingProject) return;
      if (!confirm(`Projekt "${this.currentEditingProject.name}" wirklich löschen?`)) return;
      this.editConfig.projects.splice(this.editingProjectIdx, 1);
      this.editingProjectIdx = this.editConfig.projects.length > 0 ? 0 : -1;
      this.markDirty();
    },
    addGroup(container) {
      if (!container.groups) container.groups = [];
      container.groups.push({ name: 'New Group', actions: [] });
      this.markDirty();
    },
    removeGroup(project, idx) {
      if (!confirm(`Group "${project.groups[idx].name}" löschen?`)) return;
      project.groups.splice(idx, 1);
      this.markDirty();
    },
    addDefaultGroup() {
      this.defaultGroups.push({ name: 'New Group', actions: [] });
      this.markDirty();
    },
    removeDefaultGroup(idx) {
      if (!confirm(`Default Group "${this.defaultGroups[idx].name}" löschen?`)) return;
      this.defaultGroups.splice(idx, 1);
      this.markDirty();
    },
    addAction(group) {
      if (!group.actions) group.actions = [];
      group.actions.push({ id: 'action-' + Date.now(), label: 'New Action', type: 'one-shot', command: '', cwd: '' });
      this.markDirty();
    },
    removeAction(group, idx) {
      group.actions.splice(idx, 1);
      this.markDirty();
    },
    addPromptField(action) {
      if (!action.promptFor) action.promptFor = [];
      action.promptFor.push({ name: 'param', label: 'Parameter', placeholder: '' });
      this.markDirty();
    },
    removePromptField(action, idx) {
      action.promptFor.splice(idx, 1);
      this.markDirty();
    },
    addQuickLink(project) {
      if (!project.quickLinks) project.quickLinks = [];
      project.quickLinks.push({ label: 'Link', url: 'http://' });
      this.markDirty();
    },
    removeQuickLink(project, idx) {
      project.quickLinks.splice(idx, 1);
      this.markDirty();
    },
    async copyJson() {
      try {
        await navigator.clipboard.writeText(JSON.stringify(this.editConfig, null, 2));
        this.showToast('JSON kopiert', 'success');
      } catch (err) {}
    },

    // ----- Tab Restore nach Refresh -----
    async restoreTabs() {
      try {
        const res = await fetch('/api/tabs');
        const { tabs } = await res.json();
        tabs.forEach(tab => {
          if (!this.logTabs.includes(tab.key)) this.logTabs.push(tab.key);
          this.logs[tab.key] = tab.logs || '';
        });
        if (!this.activeLogTab && this.logTabs.length > 0) {
          this.activeLogTab = this.logTabs[0];
        }
        this.logs = { ...this.logs };
      } catch (err) {
        console.error('Failed to restore tabs:', err);
      }
    },

    // ----- WebSocket -----
    connectWS() {
      const wsUrl = `ws://${window.location.host}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          if (!this.logs[msg.key]) this.logs[msg.key] = '';
          this.logs[msg.key] += msg.line;
          if (!this.logTabs.includes(msg.key)) this.logTabs.push(msg.key);
          if (!this.activeLogTab) this.activeLogTab = msg.key;
          this.logs = { ...this.logs };
        } else if (msg.type === 'status') {
          this.runningKeys = msg.running.map(r => r.key);
          // Remove ready-flags for actions that stopped
          this.readyKeys = this.readyKeys.filter(k => this.runningKeys.includes(k));
        } else if (msg.type === 'ready') {
          if (!this.readyKeys.includes(msg.key)) {
            this.readyKeys = [...this.readyKeys, msg.key];
            this.showToast(`${this.actionLabelFor(msg.key)} ready`, 'success');
          }
        } else if (msg.type === 'crash') {
          const label = msg.label || this.actionLabelFor(msg.key);
          this.showToast(`💥 ${label} crashed (exit ${msg.code})`, 'error', 6000);
          this.notifyBrowser(`${label} crashed`, `Exit code ${msg.code}. Check logs for details.`);
        }
      };

      this.ws.onclose = () => setTimeout(() => this.connectWS(), 1000);
    },

    // ----- Browser Notifications -----
    async ensureNotificationPermission() {
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      if (Notification.permission !== 'denied') {
        const result = await Notification.requestPermission();
        return result === 'granted';
      }
      return false;
    },

    notifyBrowser(title, body) {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      try {
        new Notification(title, { body, icon: '/favicon.ico' });
      } catch (err) { /* ignore */ }
    },

    isReady(key) {
      return this.readyKeys.includes(key);
    },

    // Zeigt grünen Puls auf Quick-Link wenn IRGENDEINE Action im Projekt "ready" ist
    // (z.B. Frontend fertig kompiliert → Frontend-Link pulst grün)
    hasReadyActionForUrl() {
      if (!this.activeProject) return false;
      return this.readyKeys.some(k => k.startsWith(this.activeProjectId + '::'));
    },

    // ----- Git Status Polling -----
    startGitPolling() {
      this.pollGitStatus(); // sofort
      this._gitPollTimer = setInterval(() => this.pollGitStatus(), 10000);
    },

    async pollGitStatus() {
      if (!this.activeProject) return;
      try {
        const res = await fetch(`/api/git/${this.activeProject.id}`);
        if (res.ok) {
          this.gitStatus[this.activeProject.id] = await res.json();
          this.gitStatus = { ...this.gitStatus };
        }
      } catch (err) { /* ignore */ }
    },

    get currentGit() {
      return this.activeProject ? this.gitStatus[this.activeProject.id] : null;
    },

    // ----- Restart Action -----
    async restartAction(key) {
      const [projectId, actionId] = key.split('::');
      const project = this.projects.find(p => p.id === projectId);
      if (!project) return;
      const action = project.groups.flatMap(g => g.actions).find(a => a.id === actionId);
      if (!action) return;

      this.showToast(`Restarting ${action.label}...`, 'info');
      // Stop (skipConfirm = true für Restart)
      await fetch('/api/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, actionId })
      });
      // Warte bis Process wirklich weg ist
      await new Promise(r => setTimeout(r, 800));
      // Start wieder
      await this.executeAction(action, {});
    },

    // ----- Actions -----
    isRunning(actionId) {
      const key = `${this.activeProjectId}::${actionId}`;
      return this.runningKeys.includes(key);
    },

    actionIcon(action) {
      switch (action.type) {
        case 'long-running': return '▶';
        case 'one-shot': return '⚡';
        case 'open': return '↗';
        case 'prompt': return '✎';
        case 'chain': return '⛓';
        default: return '•';
      }
    },

    async runAction(action) {
      if (action.type === 'long-running' && this.isRunning(action.id)) {
        const key = `${this.activeProjectId}::${action.id}`;
        await this.stopAction(key);
        return;
      }
      if (action.promptFor && action.promptFor.length > 0) {
        this.prompt.action = action;
        this.prompt.values = {};
        action.promptFor.forEach(p => { this.prompt.values[p.name] = ''; });
        this.prompt.open = true;
        return;
      }
      await this.executeAction(action, {});
    },

    async runPromptedAction() {
      const action = this.prompt.action;
      const params = { ...this.prompt.values };
      this.prompt.open = false;
      await this.executeAction(action, params);
    },

    async executeAction(action, params) {
      const key = `${this.activeProjectId}::${action.id}`;
      this.activeLogTab = key;

      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: this.activeProjectId, actionId: action.id, params })
      });

      if (!res.ok) {
        const err = await res.json();
        if (!this.logs[key]) this.logs[key] = '';
        this.logs[key] += `[CLIENT-ERROR] ${err.error}\n`;
        this.logs = { ...this.logs };
        this.showToast(err.error, 'error');
      }
    },

    async stopAction(key, skipConfirm = false) {
      const [projectId, actionId] = key.split('::');
      if (!skipConfirm) {
        if (!confirm(`"${this.actionLabelFor(key)}" wirklich stoppen?`)) return;
      }
      await fetch('/api/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, actionId })
      });
    },

    // ----- Log Tabs -----
    actionLabelFor(key) {
      const [projectId, actionId] = key.split('::');
      const project = this.projects.find(p => p.id === projectId);
      if (!project) return key;
      const action = project.groups.flatMap(g => g.actions).find(a => a.id === actionId);
      return action ? `${project.name} · ${action.label}` : key;
    },

    tabLabel(key) {
      const [projectId, actionId] = key.split('::');
      const project = this.projects.find(p => p.id === projectId);
      if (!project) return key;
      const action = project.groups.flatMap(g => g.actions).find(a => a.id === actionId);
      return action ? action.label : actionId;
    },

    async closeTab(key) {
      this.logTabs = this.logTabs.filter(t => t !== key);
      delete this.logs[key];
      this.logs = { ...this.logs };
      if (this.activeLogTab === key) this.activeLogTab = this.logTabs[0] || null;
      try { await fetch(`/api/tabs/${encodeURIComponent(key)}`, { method: 'DELETE' }); } catch (err) {}
    },

    clearActiveTab() {
      if (this.activeLogTab) {
        this.logs[this.activeLogTab] = '';
        this.logs = { ...this.logs };
      }
    },

    async copyActiveLog() {
      if (!this.activeLogTab) return;
      try {
        await navigator.clipboard.writeText(this.logs[this.activeLogTab] || '');
        this.showToast('Log in Zwischenablage kopiert', 'success');
      } catch (err) {
        this.showToast('Copy failed', 'error');
      }
    },

    // ----- Log Search -----
    get filteredLogLines() {
      if (!this.activeLogTab || !this.logSearch) return [];
      const content = this.logs[this.activeLogTab] || '';
      const q = this.logSearch.toLowerCase();
      return content.split('\n').filter(line => line.toLowerCase().includes(q));
    },

    // Returns HTML with highlights — or plain text if no search
    get highlightedLog() {
      const content = this.logs[this.activeLogTab] || '';
      if (!content) return '<span class="text-slate-500 italic">(no output yet)</span>';

      const escape = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (!this.logSearch) return escape(content);

      const q = this.logSearch;
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(${escapedQ})`, 'gi');
      return escape(content).replace(re, '<mark class="bg-yellow-500/40 text-yellow-100 rounded px-0.5">$1</mark>');
    }
  };
}
