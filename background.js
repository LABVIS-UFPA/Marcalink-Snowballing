import { hashId, inferFromCategory } from './core/utils.js';
import { storage } from './infrastructure/storage.js';
import { svatGetActiveProjectId, svatKey, SVAT_PROJECT_BASE } from './svat_storage.js';

const DEFAULT_SNOWBALLING_CATEGORIES = {
  "Seed": "#4CAF50",
  "Backward": "#2196F3",
  "Forward": "#9C27B0",
  "Included": "#2E7D32",
  "Excluded": "#D32F2F",
  "Duplicate": "#757575",
  "Pending": "#FBC02D",
};

/**
 * Garante que existam categorias padrão de Snowballing (por PROJETO).
 * Mantém o formato atual: categories é um objeto { nome: cor }.
 * Se já existir alguma categoria, apenas adiciona as que estiverem faltando.
 */
function ensureDefaultCategories(cb) {
  svatGetActiveProjectId().then((pid) => {
    const catKey = svatKey(SVAT_PROJECT_BASE.categories, pid);
    chrome.storage.local.get([catKey], (data) => {
      let categories = (data[catKey] && typeof data[catKey] === "object") ? data[catKey] : {};
      if (Array.isArray(categories)) categories = {};

      const merged = { ...DEFAULT_SNOWBALLING_CATEGORIES, ...categories };
      chrome.storage.local.set({ [catKey]: merged }, () => cb && cb());
    });
  });
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "highlightLink",
      title: "Marcar link",
      contexts: ["link"],
    });

    svatGetActiveProjectId().then((pid) => {
      const catKey = svatKey(SVAT_PROJECT_BASE.categories, pid);
      chrome.storage.local.get([catKey], (data) => {
        const categories = data[catKey] || {};
        for (const category in categories) {
          chrome.contextMenus.create({
            parentId: "highlightLink",
            id: `highlight_${category}`,
            title: category,
            contexts: ["link"],
          });
        }
      });
    });

    chrome.contextMenus.create({
      id: "removeHighlight",
      title: "Remover marcação",
      contexts: ["link"],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultCategories(() => createContextMenu());
});

// SOCKET (background manager)
class WebsocketManager {
  constructor() {
    this.socket = null;
    this._closedFinalized = false;
    this.tryAutoConnect();
    this.autoConnectionTime = 100;
  }

  buildWsUrl(url, port) {
    let u = (url || "").trim();
    let p = (port || "").toString().trim();
    if (!u) u = "ws://localhost";
    if (!p) p = "8080";
    if (!/^wss?:\/\//i.test(u)) u = "ws://" + u;
    u = u.replace(/\/+$/g, "");
    if (/:(\d+)$/.test(u)) return u;
    return `${u}:${p}`;
  }

  setStatus(status) {
    chrome.storage.local.set({ server_status: status });
  }

  appendLog(msg) {
    chrome.storage.local.get({ server_messages: [] }, (res) => {
      const msgs = Array.isArray(res.server_messages) ? res.server_messages : [];
      msgs.push({ time: Date.now(), data: msg });
      chrome.storage.local.set({ server_messages: msgs.slice(-500) });
    });
  }

  finalizeClose(logMsg = "🔌 Conexão encerrada", statusText = "Desconectado") {
    if (this._closedFinalized) return;
    this._closedFinalized = true;
    try { this.socket = null; } catch (e) { this.socket = null; }
    this.setStatus(statusText);
    this.appendLog(logMsg);
  }

  disconnect() {
    try { if (this.socket) this.socket.close(); } catch (e) {}
    this.finalizeClose("🔌 Desconectado", "Desconectado");
  }

  connect(url, port) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.appendLog("Já está conectado.");
      return;
    }

    const fullUrl = this.buildWsUrl(url, port);
    this.setStatus("Conectando...");
    this.appendLog("Conectando em " + fullUrl);
    this._closedFinalized = false;

    try {
      this.socket = new WebSocket(fullUrl);
    } catch (e) {
      this.setStatus("Erro");
      this.appendLog("Erro ao criar WebSocket: " + (e?.message || e));
      this.socket = null;
      this._closedFinalized = true;
      return;
    }

    this.socket.onopen = () => {
      this.setStatus("Conectado");
      this.appendLog("✅ Conectado");
      this.autoConnectionTime = 100;
    };

    this.socket.onmessage = (e) => {
      this.appendLog("MSG: " + e.data);
    };

    this.socket.onerror = () => {
      this.setStatus("Erro");
      this.appendLog("❌ Erro na conexão");
    };

    this.socket.onclose = () => {
      this.finalizeClose("🔌 Conexão encerrada", "Desconectado");
      setTimeout(() => this.tryAutoConnect(), this.autoConnectionTime);
      this.autoConnectionTime *= 2;
      if (this.autoConnectionTime > 60000) this.autoConnectionTime = 60000;
    };
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
      this.appendLog("➡️ " + (typeof data === 'string' ? data : JSON.stringify(data)));
      return true;
    }
    return false;
  }

  tryAutoConnect() {
    chrome.storage.local.get(["server_url", "server_port"], (data) => {
      if (!data.server_url) {
        data.server_url = "ws://localhost";
        data.server_port = "8080";
        chrome.storage.local.set(data);
      }
      const u = data.server_url;
      const p = data.server_port;
      if (u) this.connect(u, p);
    });
  }
}

const wsManager = new WebsocketManager();

chrome.runtime.onStartup.addListener(() => {
  wsManager.tryAutoConnect();
});

// Allow options page to trigger menu rebuild + socket controls
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.action === "updateContextMenu") {
    createContextMenu();
    return;
  }

  // FIX: primeiro cria/mescla categorias, depois recria o menu
  if (msg && msg.action === "seedDefaultCategories") {
    ensureDefaultCategories(() => createContextMenu());
    return;
  }

  if (msg && msg.action === "socket_get_state") {
    chrome.storage.local.get(["server_url", "server_port", "server_messages"], (res) => {
      let status = "Desconectado";
      try {
        const s = wsManager.socket;
        if (s) {
          switch (s.readyState) {
            case WebSocket.CONNECTING: status = "Conectando..."; break;
            case WebSocket.OPEN: status = "Conectado"; break;
            case WebSocket.CLOSING: status = "Fechando"; break;
            case WebSocket.CLOSED: status = "Desconectado"; break;
            default: status = "Desconectado";
          }
        }
      } catch (e) {
        status = "Desconectado";
      }

      const messages = Array.isArray(res.server_messages) ? res.server_messages : [];
      const url = res.server_url || '';
      const port = res.server_port || '';
      sendResponse && sendResponse({ ok: true, url, port, status, messages });
    });
    return true;
  }

  if (msg && msg.action === "socket_connect") {
    const url = msg.url;
    const port = msg.port;
    if (url) chrome.storage.local.set({ server_url: url, server_port: port });
    wsManager.connect(url || undefined, port || undefined);
    sendResponse && sendResponse({ ok: true });
    return true;
  }

  if (msg && msg.action === "socket_disconnect") {
    wsManager.disconnect();
    sendResponse && sendResponse({ ok: true });
    return true;
  }

  if (msg && msg.action === "socket_send") {
    try {
      const ok = wsManager.send(msg.data);
      sendResponse && sendResponse(ok ? { ok: true } : { ok: false, error: 'socket_not_connected' });
    } catch (e) {
      sendResponse && sendResponse({ ok: false, error: e?.message || e });
    }
    return true;
  }
});

// Rebuild do menu quando:
// - troca projeto ativo
// - muda categories__<pid>
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const keys = Object.keys(changes || {});
  if (
    keys.includes("svat_active_project_id") ||
    keys.some((k) => k.startsWith("categories__"))
  ) {
    createContextMenu();
  }
});

function nowIso() {
  return new Date().toISOString();
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const pid = await svatGetActiveProjectId();
  const catKey = svatKey(SVAT_PROJECT_BASE.categories, pid);
  const hlKey = svatKey(SVAT_PROJECT_BASE.highlightedLinks, pid);
  const papersKey = svatKey(SVAT_PROJECT_BASE.papers, pid);
  const projectKey = svatKey(SVAT_PROJECT_BASE.project, pid);

  if (typeof info.menuItemId === "string" && info.menuItemId.startsWith("highlight_")) {
    const category = info.menuItemId.replace("highlight_", "");

    chrome.storage.local.get([catKey, hlKey, projectKey, papersKey], async (data) => {
      const categories = data[catKey] || {};
      const color = categories[category] || "yellow";

      const url = (info.linkUrl || "").replace(/[\?|\&]casa\_token=\S+/i, "");

      const highlightedLinks = data[hlKey] || {};
      highlightedLinks[url] = color;
      chrome.storage.local.set({ [hlKey]: highlightedLinks });

      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: highlightLink,
          args: [url, color],
        });
      }

      const project = data[projectKey] || { id: pid, title: pid, researcher: "", createdAt: nowIso(), currentIterationId: "I1" };
      const papers = Array.isArray(data[papersKey]) ? data[papersKey] : [];

      const id = hashId(url);
      const { origin, status } = inferFromCategory(category);

      let meta = { title: url, authorsRaw: "", year: null };
      try {
        if (tab?.id) {
          meta = await chrome.tabs.sendMessage(tab.id, { type: "SVAT_EXTRACT_METADATA", linkUrl: url })
            .then(r => (r && r.ok ? r.meta : meta))
            .catch(() => meta);
        }
      } catch {}

      const idx = papers.findIndex(p => p.id === id);
      const prev = idx >= 0 ? (papers[idx].status || "pending") : "new";

      const base = {
        id,
        url,
        title: meta.title || url,
        authors: [],
        authorsRaw: meta.authorsRaw || "",
        year: meta.year || null,
        origin,
        status,
        iterationId: project.currentIterationId || "I1",
        criteriaId: null,
        tags: [category],
        visited: true,
        updatedAt: nowIso(),
      };

      if (idx >= 0) {
        const history = Array.isArray(papers[idx].history) ? papers[idx].history : [];
        history.push({ ts: nowIso(), action: "mark", details: { category, origin, status, prevStatus: prev } });
        papers[idx] = { ...papers[idx], ...base, history };
      } else {
        papers.push({
          ...base,
          createdAt: nowIso(),
          history: [{ ts: nowIso(), action: "mark", details: { category, origin, status, prevStatus: prev } }],
        });
      }

      chrome.storage.local.set({ [projectKey]: project, [papersKey]: papers });
    });

    return;
  }

  if (info.menuItemId === "removeHighlight") {
    chrome.storage.local.get([hlKey, papersKey], (data) => {
      const url = (info.linkUrl || "").replace(/[\?|\&]casa\_token=\S+/i, "");

      const highlightedLinks = data[hlKey] || {};
      delete highlightedLinks[url];

      const papers = Array.isArray(data[papersKey]) ? data[papersKey] : [];
      const filtered = papers.filter(p => (p?.url || "").replace(/[\?|\&]casa\_token=\S+/i, "") !== url);

      chrome.storage.local.set({ [hlKey]: highlightedLinks, [papersKey]: filtered });

      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: removeHighlight,
          args: [url],
        });
      }
    });
  }
});

function highlightLink(linkUrl, color) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.style.backgroundColor = color;
  });
}

function removeHighlight(linkUrl) {
  document.querySelectorAll(`a[href^='${linkUrl}']`).forEach(link => {
    link.style.backgroundColor = "";
  });
}
