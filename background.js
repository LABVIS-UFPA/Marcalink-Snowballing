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
 * Garante que existam categorias padrão de Snowballing.
 * Mantém o formato atual do projeto: categories é um objeto { nome: cor }.
 * Se já existir alguma categoria, apenas adiciona as que estiverem faltando.
 */
function ensureDefaultCategories(cb) {
  chrome.storage.local.get(["categories"], (data) => {
    let categories = (data && typeof data.categories === "object" && data.categories) ? data.categories : {};

    // Se categories vier como array por algum motivo, converte para objeto.
    if (Array.isArray(categories)) {
      const converted = {};
      for (const item of categories) {
        if (typeof item === "string") converted[item] = DEFAULT_SNOWBALLING_CATEGORIES[item] || "yellow";
        else if (item && item.name) converted[item.name] = item.color || "yellow";
      }
      const mergedFromArray = { ...DEFAULT_SNOWBALLING_CATEGORIES, ...converted };
      chrome.storage.local.set({ categories: mergedFromArray }, () => cb && cb());
      return;
    }

    let changed = false;
    const merged = { ...categories };
    for (const [name, color] of Object.entries(DEFAULT_SNOWBALLING_CATEGORIES)) {
      if (!merged[name]) {
        merged[name] = color;
        changed = true;
      }
    }

    if (changed) {
      chrome.storage.local.set({ categories: merged }, () => cb && cb());
    } else {
      cb && cb();
    }
  });
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "highlightLink",
      title: "Marcar link",
      contexts: ["link"]
    });

    chrome.storage.local.get(["categories"], (data) => {
      const categories = data.categories || {};
      for (const category in categories) {
        chrome.contextMenus.create({
          parentId: "highlightLink",
          id: `highlight_${category}`,
          title: category,
          contexts: ["link"]
        });
      }
    });

    chrome.contextMenus.create({
      id: "removeHighlight",
      title: "Remover marcação",
      contexts: ["link"]
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultCategories(() => createContextMenu());
});
chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        console.log('Keep alive ping...');
        if(!wsManager.socket || wsManager.socket.readyState !== WebSocket.OPEN) {
          console.log('Chamou auto connect...');
          wsManager.tryAutoConnect();
        }
    }
});
// SOCKET (background manager)
class WebsocketManager {
  constructor() {
    this.socket = null;
    this._closedFinalized = false;
    this.tryAutoConnect();
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
    // ensure finalization (in case onclose doesn't fire)
    this.finalizeClose("🔌 Desconectado", "Desconectado");
  }

  connect(url, port) {

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('Já está conectado.');
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
    };

    this.socket.onmessage = (e) => {
      this.appendLog("MSG: " + e.data);
    };

    this.socket.onerror = (ev) => {
      this.setStatus("Erro");
      this.appendLog("❌ Erro na conexão");
    };

    this.socket.onclose = () => {
      this.finalizeClose("🔌 Conexão encerrada", "Desconectado");
      this.tryAutoConnect();
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
    console.log('Tentando auto conectar...');
    chrome.storage.local.get(["server_url", "server_port"], (data) => {

      if (!data.server_url) {
        //Usa porta e url padrão se não tiver nada salvo
        data.server_url = "ws://localhost";
        data.server_port = "8080";
        chrome.storage.local.set(data);
      }

      const u = data.server_url;
      const p = data.server_port;
      console.log(`Auto connect with url=${u} port=${p}`);
      if (u) this.connect(u, p);
    });
  }
}
const wsManager = new WebsocketManager();

// Try connect on startup once if configured
chrome.runtime.onStartup.addListener(() => {
  wsManager.tryAutoConnect();
});

// Allow options page to trigger menu rebuild.
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg && msg.action === "updateContextMenu") {
    createContextMenu();
    return;
  }
  if (msg && msg.action === "seedDefaultCategories") {
    createContextMenu();
    ensureDefaultCategories(() => createContextMenu());
  }
  // Socket control messages from options page
  if (msg && msg.action === "socket_get_state") {
    // Reply with the real socket state and stored server info/messages
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
      _sendResponse && _sendResponse({ ok: true, url, port, status, messages });
    });
    return true; // async response
  }

  if (msg && msg.action === "socket_connect") {
    const url = msg.url;
    const port = msg.port;
    if (url) {
      chrome.storage.local.set({ server_url: url, server_port: port });
    }
    wsManager.connect(url || undefined, port || undefined);
    _sendResponse && _sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.action === "socket_disconnect") {
    wsManager.disconnect();
    _sendResponse && _sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.action === "socket_send") {
    try {
      const ok = wsManager.send(msg.data);
      if (ok) {
        _sendResponse && _sendResponse({ ok: true });
      } else {
        _sendResponse && _sendResponse({ ok: false, error: 'socket_not_connected' });
      }
    } catch (e) {
      _sendResponse && _sendResponse({ ok: false, error: e?.message || e });
    }
    return true;
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.categories) {
    createContextMenu();
  }
});

function nowIso() {
  return new Date().toISOString();
}

function hashId(input) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return "p_" + h.toString(16).padStart(8, "0");
}

function inferFromCategory(category) {
  const c = (category || "").toLowerCase();
  const origin = c.includes("seed") || c.includes("semente") ? "seed"
    : c.includes("back") || c.includes("refer") ? "backward"
    : c.includes("forw") || c.includes("cita") ? "forward"
    : "unknown";

  const status = c.includes("incl") ? "included"
    : c.includes("excl") ? "excluded"
    : c.includes("duplic") ? "duplicate"
    : "pending";

  return { origin, status };
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId.startsWith("highlight_")) {
    const category = info.menuItemId.replace("highlight_", "");
    chrome.storage.local.get(["categories", "highlightedLinks", "svat_project", "svat_papers"], async (data) => {
      const categories = data.categories || {};
      const color = categories[category] || "yellow";
      let highlightedLinks = data.highlightedLinks || {};
      let url = (info.linkUrl || "").replace(/[\?|\&]casa\_token=\S+/i, "");
      highlightedLinks[url] = color;
      chrome.storage.local.set({ highlightedLinks });

      // Highlight visually
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: highlightLink,
        args: [url, color]
      });

      // Save SVAT paper (best-effort metadata extraction)
      const project = data.svat_project || { id: "tcc-001", title: "Meu TCC", researcher: "", createdAt: nowIso(), currentIterationId: "I1" };
      const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
      const id = hashId(url);
      const { origin, status } = inferFromCategory(category);

      let meta = { title: url, authorsRaw: "", year: null };
      try {
        if (tab?.id) {
          meta = await chrome.tabs.sendMessage(tab.id, { type: "SVAT_EXTRACT_METADATA", linkUrl: url }).then(r => (r && r.ok ? r.meta : meta)).catch(() => meta);
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
        papers.push({ ...base, createdAt: nowIso(), history: [{ ts: nowIso(), action: "mark", details: { category, origin, status, prevStatus: prev } }] });
      }
      chrome.storage.local.set({ svat_project: project, svat_papers: papers });
    });
  }

  if (info.menuItemId === "removeHighlight") {
    chrome.storage.local.get(["highlightedLinks", "svat_papers"], (data) => {
      let highlightedLinks = data.highlightedLinks || {};
      const url = (info.linkUrl || "").replace(/[\?|\&]casa\_token=\S+/i, "");
      delete highlightedLinks[info.linkUrl];
      delete highlightedLinks[url];
      chrome.storage.local.set({ highlightedLinks });

      // Keep the paper in SVAT (audit trail), but set visited=false
      const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
      const id = hashId(url);
      const idx = papers.findIndex(p => p.id === id);
      if (idx >= 0) {
        const history = Array.isArray(papers[idx].history) ? papers[idx].history : [];
        history.push({ ts: nowIso(), action: "unmark", details: { visited: false } });
        papers[idx] = { ...papers[idx], visited: false, updatedAt: nowIso(), history };
        chrome.storage.local.set({ svat_papers: papers });
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: removeHighlight,
        args: [url]
      });
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