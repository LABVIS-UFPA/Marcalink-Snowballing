import { storage } from './infrastructure/storage.js';
import {
  svatListProjects,
  svatCreateProject,
  svatDeleteProject,
  svatRenameProject,
  svatGetActiveProjectId,
  svatSetActiveProjectId,
  svatGetAll,
  svatUpsertPaper,
  svatGetCategories,
  svatSetCategories,
  svatGetHighlightedLinks,
  svatSetHighlightedLinks,
} from './svat_storage.js';

document.addEventListener("DOMContentLoaded", () => {
  const categoryNameInput = document.getElementById("categoryName");
  const categoryColorInput = document.getElementById("categoryColor");
  const addCategoryButton = document.getElementById("addCategory");
  const seedDefaultCategoriesButton = document.getElementById("seedDefaultCategories");
  const categoryList = document.getElementById("categoryList");
  const highlightedList = document.getElementById("highlightedList");
  const highlightSearch = document.getElementById("highlightSearch");
  const removeLinks = document.getElementById("removeLinks");
  const downloadStorage = document.getElementById("downloadStorage");
  const uploadStorage = document.getElementById("uploadStorage");
  const checkOnOff = document.getElementById("checkOnOff");

  // Projects
  const projectTitleInput = document.getElementById("projectTitle");
  const createProjectBtn = document.getElementById("createProject");
  const projectListEl = document.getElementById("projectList");
  const activeProjectLabel = document.getElementById("activeProjectLabel");


  // Ordem preferencial para as categorias padrão (aparece primeiro na lista)
  const DEFAULT_CATEGORY_ORDER = [
    "Seed",
    "Backward",
    "Forward",
    "Included",
    "Excluded",
    "Duplicate",
    "Pending",
  ];

// =====================
  // Helpers
  // =====================
  function loadOnOff() {
    storage.get("active").then((data) => {
      checkOnOff.checked = !!(data && data.active);
    });
  }

  function normalizeUrl(url) {
    return (url || "").replace(/[\?\&]casa\_token=\S+/i, "");
  }

  function getLuminanceFromHex(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function (m, r, g, b) {
      return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return 0;

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // =====================
  // Categories
  // =====================
  function loadCategories() {
    svatGetCategories().then((categories) => {
      categoryList.innerHTML = "";
      const names = Object.keys(categories).sort((a, b) => {
        const ia = DEFAULT_CATEGORY_ORDER.indexOf(a);
        const ib = DEFAULT_CATEGORY_ORDER.indexOf(b);
        const aIs = ia !== -1;
        const bIs = ib !== -1;
        if (aIs && bIs) return ia - ib;
        if (aIs) return -1;
        if (bIs) return 1;
        return a.localeCompare(b);
      });

      function removeCategory(name) {
        svatGetCategories().then(cats => {
          if (!cats[name]) return;
          delete cats[name];
          svatSetCategories(cats).then(() => {
            chrome.runtime.sendMessage({ action: "updateContextMenu" });
            loadCategories();
          });
        });
      }

      for (const category of names) {
        const color = categories[category];

        const li = document.createElement("li");
        li.style.backgroundColor = color;
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.style.gap = "8px";
        li.style.padding = "6px";

        const label = document.createElement("span");
        label.textContent = category;
        label.style.fontWeight = "600";
        label.style.flex = "1";
        label.style.color = getLuminanceFromHex(color) < 0.5 ? "#fff" : "#000";

        const meta = document.createElement("span");
        meta.textContent = color;
        meta.style.fontFamily = "monospace";
        meta.style.fontSize = "12px";
        meta.style.color = getLuminanceFromHex(color) < 0.5 ? "#fff" : "#000";

        const btn = document.createElement("button");
        btn.textContent = "Excluir";
        btn.addEventListener("click", () => {
          if (!confirm(`Excluir a categoria "${category}"?`)) return;
          removeCategory(category);
        });
        btn.style.color = getLuminanceFromHex(color) < 0.5 ? "#fff" : "#000";
        if (getLuminanceFromHex(color) >= 0.5) btn.classList.add("dark");

        li.appendChild(label);
        li.appendChild(meta);
        li.appendChild(btn);

        categoryList.appendChild(li);
      }

      chrome.runtime.sendMessage({ action: "updateContextMenu" });
    });
  }

  // =====================
  // Links
  // =====================
  function deleteMarkedLink(urlToDelete, done) {
    (async () => {
      const target = normalizeUrl(urlToDelete);
      const [highlightedLinks, state] = await Promise.all([svatGetHighlightedLinks(), svatGetAll()]);
      const nextHL = { ...(highlightedLinks || {}) };

      for (const k of Object.keys(nextHL)) {
        const nk = normalizeUrl(k);
        if (k === urlToDelete || nk === target || nk.startsWith(target) || target.startsWith(nk)) {
          delete nextHL[k];
        }
      }

      const papers = Array.isArray(state.papers) ? state.papers : [];
      const filteredPapers = papers.filter((p) => normalizeUrl(p?.url) !== target);

      await Promise.all([
        svatSetHighlightedLinks(nextHL),
        svatSetAll({ ...state, papers: filteredPapers }),
      ]);

      done && done();
    })();
  }

  function loadHighlightedLinks() {
    Promise.all([svatGetHighlightedLinks(), svatGetAll()]).then(([links, state]) => {
      highlightedList.innerHTML = "";
      // links already loaded per project
      links = links || {};

      const papers = Array.isArray(state.papers) ? state.papers : [];
      const titleByUrl = new Map();
      for (const p of papers) {
        const nu = normalizeUrl(p?.url);
        if (!nu) continue;
        const t = (p?.title || "").trim();
        if (t) titleByUrl.set(nu, t);
      }

      const q = (highlightSearch?.value || "").trim().toLowerCase();

      const items = Object.keys(links)
        .map((url) => {
          const nurl = normalizeUrl(url);
          const title = titleByUrl.get(nurl) || "";
          return { url, nurl, title, color: links[url] };
        })
        .filter((it) => {
          if (!q) return true;
          return (it.url || "").toLowerCase().includes(q) || (it.title || "").toLowerCase().includes(q);
        });

      removeLinks.style.display = items.length ? "inline-block" : "none";

      for (const it of items) {
        const li = document.createElement("li");
        li.style.backgroundColor = it.color;
        li.style.display = "flex";
        li.style.alignItems = "center";
        li.style.gap = "8px";
        li.style.padding = "6px";

        const linkWrap = document.createElement("div");
        linkWrap.style.flex = "1";
        linkWrap.style.display = "flex";
        linkWrap.style.flexDirection = "column";
        linkWrap.style.gap = "2px";

        const a = document.createElement("a");
        a.href = it.url;
        a.textContent = it.title ? it.title : it.url;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.style.fontWeight = it.title ? "600" : "400";
        a.style.overflowWrap = "anywhere";
        a.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";

        const urlSmall = document.createElement("div");
        if (it.title) {
          urlSmall.textContent = it.url;
          urlSmall.style.fontSize = "12px";
          urlSmall.style.opacity = "0.85";
          urlSmall.style.overflowWrap = "anywhere";
        }

        linkWrap.appendChild(a);
        if (it.title) linkWrap.appendChild(urlSmall);

        const meta = document.createElement("span");
        meta.textContent = it.color;
        meta.style.fontFamily = "monospace";
        meta.style.fontSize = "12px";
        meta.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";

        const btn = document.createElement("button");
        btn.textContent = "Excluir";
        btn.addEventListener("click", () => {
          if (!confirm("Excluir este link marcado?")) return;
          deleteMarkedLink(it.url, () => loadHighlightedLinks());
        });
        btn.style.color = getLuminanceFromHex(it.color) < 0.5 ? "#fff" : "#000";
        if (getLuminanceFromHex(it.color) >= 0.5) btn.classList.add("dark");

        li.appendChild(linkWrap);
        li.appendChild(meta);
        li.appendChild(btn);

        highlightedList.appendChild(li);
      }
    });
  }

  // =====================
  // Events: On/Off, categories, links, backup
  // =====================
  checkOnOff.addEventListener("change", () => {
    storage.set({ active: checkOnOff.checked }).then(() => {
      console.log(checkOnOff.checked ? "Ativo." : "Desativado.");
    });
  });

  if (seedDefaultCategoriesButton) {
    seedDefaultCategoriesButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "seedDefaultCategories" }, () => {
        loadCategories();
        alert("Categorias padrão de Snowballing criadas/mescladas!");
      });
    });
  }

  addCategoryButton.addEventListener("click", () => {
    const name = categoryNameInput.value.trim();
    const color = categoryColorInput.value;
    if (!name) return;

    svatGetCategories().then((categories) => {
      const cats = categories || {};
      cats[name] = color;
      svatSetCategories(cats).then(() => {
        categoryNameInput.value = "";
        loadCategories();
      });
    });
  });

  removeLinks.addEventListener("click", () => {
    if (!confirm("Tem certeza que deseja remover TODOS os links marcados do projeto ATIVO?")) return;
    (async () => {
      const state = await svatGetAll();
      await Promise.all([
        svatSetHighlightedLinks({}),
        svatSetAll({ ...state, papers: [] }),
      ]);
      loadHighlightedLinks();
    })();
  });

  if (highlightSearch) {
    highlightSearch.addEventListener("input", () => loadHighlightedLinks());
  }

  downloadStorage.addEventListener("click", () => {
    storage.get(null).then(function (data) {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "storage_backup.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch(()=>{});
  });

  uploadStorage.addEventListener("change", function (event) {
    if (!confirm("Tem certeza de que deseja fazer upload deste arquivo? Isso pode sobrescrever os dados existentes.")) return;

    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        try {
          const jsonData = JSON.parse(event.target.result);
          storage.set(jsonData).then(() => {
            alert("Dados carregados no storage com sucesso!");
          }).catch((e)=>{ alert("Erro ao salvar dados: " + e); });
        } catch (error) {
          alert("Erro ao processar o JSON: " + error);
        }
      };
      reader.readAsText(file);
    }
  });

  // =====================
  // ✅ SERVER / WEBSOCKET
  // =====================
  const serverUrlInput = document.getElementById("serverUrl");
  const serverPortInput = document.getElementById("serverPort");
  const connectBtn = document.getElementById("connectBtn");
  const sendPingBtn = document.getElementById("sendPingBtn");
  const serverStatusLabel = document.getElementById("serverStatus");
  const serverLog = document.getElementById("serverLog");
  const clearServerLogBtn = document.getElementById("clearServerLog");

  let server_status = 'Desconectado';
  function setServerStatus(text) {
    const icon = text === 'Conectado' ? '🟢' : '🔴';
    if (serverStatusLabel) serverStatusLabel.textContent = `${icon} ${text}`;
    if (connectBtn) connectBtn.textContent = (text === 'Conectado') ? 'Desconectar' : 'Conectar';
    server_status = text;
  }

  function renderServerLogFromArray(msgs) {
    if (!serverLog) return;
    serverLog.textContent = '';
    for (const m of msgs || []) {
      const t = new Date(m.time).toLocaleTimeString();
      serverLog.textContent += `[${t}] ${m.data}\n`;
    }
    serverLog.scrollTop = serverLog.scrollHeight;
  }

  
  // Load current server settings/status/messages from storage
  function refreshServerState() {
    // Request authoritative state from background instead of relying solely on local memory
    chrome.runtime.sendMessage({ action: 'socket_get_state' }, (resp) => {
      if (resp && resp.ok) {
        if (serverUrlInput) serverUrlInput.value = resp.url || '';
        if (serverPortInput) serverPortInput.value = resp.port || '';
        setServerStatus(resp.status || 'Desconectado');
        renderServerLogFromArray(Array.isArray(resp.messages) ? resp.messages : []);
        return;
      }
    });
  }

  // Initial load
  refreshServerState();

  // Listen for background updates
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.server_status) setServerStatus(changes.server_status.newValue);
    if (changes.server_messages) renderServerLogFromArray(changes.server_messages.newValue || []);
  });

  // Also refresh state when the page/tab becomes visible or focused
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshServerState();
  });
  window.addEventListener('focus', () => refreshServerState());
  window.addEventListener('pageshow', () => refreshServerState());

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      const url = serverUrlInput?.value?.trim();
      const port = serverPortInput?.value?.trim();
      if (server_status === 'Conectado') {
        chrome.runtime.sendMessage({ action: 'socket_disconnect' }, () => {});
      } else {
        chrome.runtime.sendMessage({ action: 'socket_connect', url, port }, () => {});
      }
    });
  }

  if (sendPingBtn) {
    sendPingBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: 'socket_send', data: 'ping' }, (resp) => {
        if (!resp || !resp.ok) {
          // If send failed, ensure user sees it in log
          chrome.storage.local.get({ server_messages: [] }, (res) => {
            const msgs = Array.isArray(res.server_messages) ? res.server_messages : [];
            msgs.push({ time: Date.now(), data: '⚠️ Socket não conectado (ping falhou)' });
            chrome.storage.local.set({ server_messages: msgs.slice(-500) });
          });
        }
      });
    });
  }

  if (clearServerLogBtn) {
    clearServerLogBtn.addEventListener('click', () => {
      if (!confirm('Limpar log do servidor?')) return;
      chrome.storage.local.set({ server_messages: [] }, () => {
        renderServerLogFromArray([]);
      });
    });
  }

  // =====================
  // Navegação lateral (mantém seu layout funcionando)
  // =====================
  const buttons = Array.from(document.querySelectorAll(".sideItem[data-target]"));
  const panels = Array.from(document.querySelectorAll(".panel[id]"));

  function activate(targetId) {
    panels.forEach((p) => p.classList.toggle("active", p.id === targetId));
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.target === targetId));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.target));
  });

  if (location.hash) {
    const id = location.hash.replace("#", "");
    if (panels.some((p) => p.id === id)) activate(id);
  }


  // =====================
  // Projects (CRUD + ativo)
  // =====================
  async function renderProjects() {
    if (!projectListEl) return;

    const { projects, activeProjectId } = await svatListProjects();
    const active = projects.find(p => p.id === activeProjectId);
    if (activeProjectLabel) activeProjectLabel.textContent = `Projeto ativo: ${active ? (active.title || active.id) : "—"}`;

    projectListEl.innerHTML = "";

    for (const p of projects) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "10px";
      row.style.border = "1px solid rgba(255,255,255,0.14)";
      row.style.borderRadius = "10px";
      row.style.marginBottom = "10px";
      row.style.background = "rgba(255,255,255,0.04)";

      const left = document.createElement("div");
      left.style.flex = "1";

      const name = document.createElement("div");
      name.textContent = p.title || p.id;
      name.style.fontWeight = "900";

      const meta = document.createElement("div");
      meta.textContent = p.id;
      meta.style.opacity = "0.75";
      meta.style.fontSize = "12px";

      left.appendChild(name);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";

      const btnActive = document.createElement("button");
      btnActive.className = "btn";
      btnActive.textContent = (p.id === activeProjectId) ? "Ativo" : "Ativar";
      btnActive.disabled = (p.id === activeProjectId);
      btnActive.addEventListener("click", async () => {
        await svatSetActiveProjectId(p.id);
        chrome.runtime.sendMessage({ action: "updateContextMenu" });
        await renderProjects();
        loadCategories();
        loadHighlightedLinks();
      });

      const btnRename = document.createElement("button");
      btnRename.className = "btn";
      btnRename.textContent = "Renomear";
      btnRename.addEventListener("click", async () => {
        const n = prompt("Novo nome do projeto:", p.title || p.id);
        if (!n) return;
        await svatRenameProject(p.id, n.trim());
        await renderProjects();
        // Update popup/dashboard labels fast
        chrome.runtime.sendMessage({ action: "updateContextMenu" });
      });

      const btnDel = document.createElement("button");
      btnDel.className = "btn";
      btnDel.textContent = "Excluir";
      btnDel.style.background = "var(--danger)";
      btnDel.addEventListener("click", async () => {
        if (!confirm(`Excluir o projeto "${p.title || p.id}"?\n\nIsso apaga artigos, categorias e links marcados desse projeto.`)) return;
        try {
          await svatDeleteProject(p.id);
          chrome.runtime.sendMessage({ action: "updateContextMenu" });
          await renderProjects();
          loadCategories();
          loadHighlightedLinks();
        } catch (e) {
          alert(e?.message || "Não foi possível excluir.");
        }
      });

      actions.appendChild(btnActive);
      actions.appendChild(btnRename);
      actions.appendChild(btnDel);

      if (p.id === activeProjectId) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = "ATIVO";
        pill.style.marginLeft = "8px";
        name.appendChild(pill);
      }

      row.appendChild(left);
      row.appendChild(actions);
      projectListEl.appendChild(row);
    }
  }

  if (createProjectBtn) {
    createProjectBtn.addEventListener("click", async () => {
      const title = (projectTitleInput?.value || "").trim();
      const id = await svatCreateProject({ title: title || "Novo projeto" });
      projectTitleInput.value = "";
      chrome.runtime.sendMessage({ action: "updateContextMenu" });
      await renderProjects();
      loadCategories();
      loadHighlightedLinks();
      // jump to show it
      location.hash = "#panel-projects";
    });
  }


  // =====================
  // Init loads
  // =====================
  loadOnOff();
  renderProjects();
  loadCategories();
  loadHighlightedLinks();
});
