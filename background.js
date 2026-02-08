import {hashId, inferFromCategory} from './core/utils.mjs';
import {storage} from './infrastructure/storage.mjs';
import { wsManager } from './infrastructure/socketManager.mjs';

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
  // Remove existing menus and recreate safely (ignore duplicate-id race warnings)
  chrome.contextMenus.removeAll(() => {
    const safeCreate = (opts) => {
      try {
        chrome.contextMenus.create(opts, () => {
          if (chrome.runtime.lastError) {
            const msg = String(chrome.runtime.lastError.message || "").toLowerCase();
            if (msg.includes('duplicate id') || msg.includes('cannot create item with duplicate id')) {
              // ignore duplicate menu creation race
              return;
            }
            console.error('contextMenus.create error', chrome.runtime.lastError);
          }
        });
      } catch (e) {
        console.warn('safeCreate failed', e);
      }
    };

    safeCreate({ id: "highlightLink", title: "Marcar link", contexts: ["link"] });

    chrome.storage.local.get(["categories"], (data) => {
      const categories = data.categories || {};
      for (const category in categories) {
        safeCreate({ parentId: "highlightLink", id: `highlight_${category}`, title: category, contexts: ["link"] });
      }
    });

    safeCreate({ id: "removeHighlight", title: "Remover marcação", contexts: ["link"] });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultCategories(() => createContextMenu());
});

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