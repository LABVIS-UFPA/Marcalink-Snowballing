/**
 * Isomorphic Storage Service
 * 
 * Funciona tanto no Node.js quanto no browser (plugin).
 * Para Node.js: persiste via fs
 * Para browser: comunica com servidor via WebSocket
 * 
 * Padrão Strategy para abstrair as diferenças de persistência
 */

// ============================================================================
// STRATEGY PATTERN - Node.js Driver (fs-based)
// ============================================================================

class NodeFsStrategy {
  constructor() {
    this.fs = null;
    this.path = null;
    this.baseDir = null;
  }

  async init(baseDir) {
    const fsModule = await import('fs');
    const pathModule = await import('path');
    this.fs = fsModule.default || fsModule;
    this.path = pathModule.default || pathModule;
    this.baseDir = baseDir;
    
    // Ensure base directory exists
    if (!this.fs.existsSync(baseDir)) {
      this.fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  ensureDir(p) {
    try {
      if (!this.fs.existsSync(p)) {
        this.fs.mkdirSync(p, { recursive: true });
      }
    } catch (e) {
      throw e;
    }
  }

  readJson(relPath) {
    const full = this.path.join(this.baseDir, relPath);
    try {
      if (!this.fs.existsSync(full)) return null;
      const raw = this.fs.readFileSync(full, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  writeJson(relPath, obj) {
    const full = this.path.join(this.baseDir, relPath);
    try {
      this.ensureDir(this.path.dirname(full));
      this.fs.writeFileSync(full, JSON.stringify(obj, null, 2), 'utf8');
      return true;
    } catch (e) {
      throw e;
    }
  }

  // CRUD methods for Project
  async saveProject(projectName, projectData) {
    const relPath = this.path.join(projectName, 'project.json');
    this.writeJson(relPath, projectData);
    return { status: "ok", message: "Project saved." };
  }

  async loadProject(projectName) {
    const relPath = this.path.join(projectName, 'project.json');
    const data = this.readJson(relPath);
    return { status: "ok", data };
  }

  async deleteProject(projectName) {
    const full = this.path.join(this.baseDir, projectName);
    if (this.fs.existsSync(full)) {
      this.fs.rmSync(full, { recursive: true });
      return { status: "ok", message: "Project deleted." };
    }
    return { status: "error", message: "Project not found." };
  }

  async listProjects() {
    try {
      const entries = this.fs.readdirSync(this.baseDir, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => e.name);
      return { status: "ok", data: dirs };
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }

  // CRUD methods for Paper
  async savePaper(projectName, paperId, paperData) {
    const relPath = this.path.join(projectName, 'papers', `${paperId}.json`);
    this.writeJson(relPath, paperData);
    return { status: "ok", message: "Paper saved." };
  }

  async loadPaper(projectName, paperId) {
    const relPath = this.path.join(projectName, 'papers', `${paperId}.json`);
    const data = this.readJson(relPath);
    return { status: "ok", data };
  }

  async deletePaper(projectName, paperId) {
    const full = this.path.join(this.baseDir, projectName, 'papers', `${paperId}.json`);
    if (this.fs.existsSync(full)) {
      this.fs.unlinkSync(full);
      return { status: "ok", message: "Paper deleted." };
    }
    return { status: "error", message: "Paper not found." };
  }

  async listPapers(projectName) {
    const papersDir = this.path.join(this.baseDir, projectName, 'papers');
    try {
      if (!this.fs.existsSync(papersDir)) {
        return { status: "ok", data: [] };
      }
      const files = this.fs.readdirSync(papersDir);
      const papers = files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const id = f.replace('.json', '');
          const data = this.readJson(this.path.join(projectName, 'papers', f));
          return { id, ...data };
        });
      return { status: "ok", data: papers };
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }

  // Storage-like get/set methods (chrome.storage.local-like behavior)
  async get(keys) {
    const config = this.readJson("config.json") || {};
    const result = {};

    if (!keys || keys.length === 0) {
      return config;
    }

    // If keys is a string, wrap in array
    const keyArray = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : [];
    
    for (const key of keyArray) {
      if (key in config) {
        result[key] = config[key];
      }
    }

    return result;
  }

  async set(items) {
    if (!items || typeof items !== 'object') return;

    const config = this.readJson("config.json") || {};
    const updated = { ...config, ...items };
    this.writeJson("config.json", updated);

    return { status: "ok", message: "Data saved." };
  }

  // Check if this strategy is active and ready
  isActive() {
    return this.fs !== null && this.path !== null && this.baseDir !== null;
  }
}

// ============================================================================
// STRATEGY PATTERN - Web/Browser Driver (WebSocket-based)
// ============================================================================

class WebSocketStrategy {
  constructor() {
    this.wsManager = null;
    this.BACKUP_FLAG_KEY = '__marcalink_has_backup__';
  }

  async init() {
    const { wsManager: ws } = await import('./socketManager.mjs');
    this.wsManager = ws;

    // Register for reconnection events to sync backup data
      if (this.onOpen) {
        this.onOpen(async () => {
          await this.syncBackupData();
        });
      }
      // Check if there's backup data on startup and sync if needed
      await this.syncBackupData();
  }

  async send(act, payload) {
    return new Promise((resolve) => {
      // In a real scenario, we'd use a request-response pattern
      // For now, send via wsManager
      if (this.wsManager && this.wsManager.send) {
        this.wsManager.send(JSON.stringify({ act, payload }));
        resolve({ status: "ok" });
      } else {
        resolve({ status: "error", message: "WebSocket not connected" });
      }
    });
  }

  async saveProject(projectName, projectData) {
    return this.send('save_project', { projectName, data: projectData });
  }

  async loadProject(projectName) {
    return this.send('load_project', { projectName });
  }

  async deleteProject(projectName) {
    return this.send('delete_project', { projectName });
  }

  async listProjects() {
    return this.send('list_projects', {});
  }

  async savePaper(projectName, paperId, paperData) {
    return this.send('save_paper', { projectName, paperId, data: paperData });
  }

  async loadPaper(projectName, paperId) {
    return this.send('load_paper', { projectName, paperId });
  }

  async deletePaper(projectName, paperId) {
    return this.send('delete_paper', { projectName, paperId });
  }

  async listPapers(projectName) {
    return this.send('list_papers', { projectName });
  }

  // Storage-like get/set methods (sends via WebSocket)
  async get(keys) {
    return new Promise((resolve) => {
      this.send('storage_get', { keys }).then(resolve).catch(() => resolve({}));
    });
  }

  async set(items) {
    // If WebSocket is active, send normally
    if (this.isActive()) {
      return this.send('storage_set', { items });
    }

    // If WebSocket is inactive, backup to chrome.storage
    return this.backupToChrome(items);
  }

  // Backup data to chrome.storage when offline
  async backupToChrome(items) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve({ status: "error", message: "No storage available." });
        return;
      }

      // Mark these keys as backup
      const backupKeys = new Set();
      for (const key of Object.keys(items)) {
        backupKeys.add(key);
      }

      // Save backup data with metadata flag
      const backupData = {
        ...items,
        __backup_keys__: Array.from(backupKeys),
        __backup_timestamp__: new Date().toISOString(),
        [this.BACKUP_FLAG_KEY]: true // Flag indicating backup data exists
      };

      chrome.storage.local.set(backupData, () => {
        resolve({ status: "ok", message: "Data saved as backup (offline)." });
      });
    });
  }

  // Sync backup data when WebSocket reconnects
  async syncBackupData() {
    // Check if backup flag exists
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        resolve();
        return;
      }

      chrome.storage.local.get([this.BACKUP_FLAG_KEY, '__backup_keys__'], async (result) => {
        if (!result[this.BACKUP_FLAG_KEY]) {
          resolve(); // No backup data to sync
          return;
        }

        const backupKeys = result.__backup_keys__;
        if (backupKeys.length === 0) {
          resolve();
          return;
        }

        // Get all backup data
        chrome.storage.local.get(backupKeys, async (backupData) => {
          if (Object.keys(backupData).length === 0) {
            resolve();
            return;
          }

          try {
            // Send synced data to server via WebSocket
            await this.send('storage_set', { items: backupData });

            // Clear backup markers after successful sync
            const keysToRemove = [this.BACKUP_FLAG_KEY, '__backup_keys__', '__backup_timestamp__'];
            chrome.storage.local.remove(keysToRemove, () => {resolve();});
          } catch (e) {
            console.warn("Failed to sync backup data:", e);
            resolve();
          }
        });
      });
    });
  }

  // Check if WebSocket is active and ready
  isActive() {
    if (!this.wsManager) return false;
    
    // Check if socket exists and is in OPEN state
    const socket = this.wsManager.socket;
    if (!socket) return false;
    
    return socket.readyState === WebSocket.OPEN;
  }

  // Register callback for when WebSocket opens
  onOpen(callback) {
    if (!this.wsManager) return;
    if (typeof this.wsManager.addOnOpenListener === 'function') {
      this.wsManager.addOnOpenListener(callback);
    }
  }
}

// ============================================================================
// ISOMORPHIC STORAGE SERVICE
// ============================================================================

class StorageService {
  constructor() {
    this.strategy = null;
    this.isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    this.initialized = false;
  }

  async init(baseDir = null) {
    if (this.initialized) return;

    if (this.isNode) {
      // Node.js environment
      this.strategy = new NodeFsStrategy();
      await this.strategy.init(baseDir);
    } else {
      // Browser environment
      this.strategy = new WebSocketStrategy();
      await this.strategy.init();
    }

    this.initialized = true;
  }

  // Helper to get data from chrome.storage directly
  getFromChrome(keys) {
    return new Promise((resolve) => {
      if (!this.isNode && typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
      } else {
        resolve({});
      }
    });
  }

  // Helper to set data in chrome.storage directly
  setToChrome(items) {
    return new Promise((resolve) => {
      if (!this.isNode && typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set(items, () => resolve());
      } else {
        resolve();
      }
    });
  }

  // ========== Unified get/set with new preference order ==========

  async get(keys) {
    if (!this.initialized) await this.init();

    // 1. Try strategy first (fs for Node.js, WebSocket for browser)
    if (this.strategy && this.strategy.isActive && this.strategy.isActive()) {
      return this.strategy.get(keys);
    }

    // 2. Fallback to chrome.storage.local for browser
    return this.getFromChrome(keys);
  }

  async set(items) {
    if (!this.initialized) await this.init();

    if (!items || typeof items !== 'object') return;

    // Strategy handles backup logic internally when inactive
    // (NodeFsStrategy always active, WebSocketStrategy handles backup)
    if (this.strategy && this.strategy.set) {
      return this.strategy.set(items);
    }

    return { status: "error", message: "No storage available." };
  }

  addOnChangedListener(callback) {
    if (!this.isNode && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes, areaName) => callback(changes, areaName);
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
    return () => {};
  }

  // ========== Project CRUD ==========

  async saveProject(projectName, projectData) {
    if (!this.initialized) await this.init();
    return this.strategy.saveProject(projectName, projectData);
  }

  async loadProject(projectName) {
    if (!this.initialized) await this.init();
    return this.strategy.loadProject(projectName);
  }

  async deleteProject(projectName) {
    if (!this.initialized) await this.init();
    return this.strategy.deleteProject(projectName);
  }

  async listProjects() {
    if (!this.initialized) await this.init();
    return this.strategy.listProjects();
  }

  // ========== Paper CRUD ==========

  async savePaper(projectName, paperId, paperData) {
    if (!this.initialized) await this.init();
    return this.strategy.savePaper(projectName, paperId, paperData);
  }

  async loadPaper(projectName, paperId) {
    if (!this.initialized) await this.init();
    return this.strategy.loadPaper(projectName, paperId);
  }

  async deletePaper(projectName, paperId) {
    if (!this.initialized) await this.init();
    return this.strategy.deletePaper(projectName, paperId);
  }

  async listPapers(projectName) {
    if (!this.initialized) await this.init();
    return this.strategy.listPapers(projectName);
  }
}

// Singleton instance
export const storage = new StorageService();

// Optional: export Strategy classes for advanced use cases
export { StorageService, NodeFsStrategy, WebSocketStrategy };
