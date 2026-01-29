import { storage } from './infrastructure/storage.mjs';

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
    storage.get("categories").then((data) => {
      categoryList.innerHTML = "";
      const categories = (data && data.categories) ? data.categories : {};
      const names = Object.keys(categories).sort((a, b) => a.localeCompare(b));

      function removeCategory(name) {
        storage.get("categories").then(d => {
          const cats = d.categories || {};
          if (!cats[name]) return;
          delete cats[name];
          storage.set({ categories: cats }).then(() => {
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
    const target = normalizeUrl(urlToDelete);
    chrome.storage.local.get(["highlightedLinks", "svat_papers"], (data) => {
      const highlightedLinks = data.highlightedLinks || {};
      for (const k of Object.keys(highlightedLinks)) {
        const nk = normalizeUrl(k);
        if (k === urlToDelete || nk === target || nk.startsWith(target) || target.startsWith(nk)) {
          delete highlightedLinks[k];
        }
      }

      const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
      const filteredPapers = papers.filter((p) => normalizeUrl(p?.url) !== target);

      storage.set({ highlightedLinks, svat_papers: filteredPapers }).then(() => { done && done(); });
    });
  }

  function loadHighlightedLinks() {
    storage.get(["highlightedLinks", "svat_papers"]).then((data) => {
      highlightedList.innerHTML = "";
      const links = data.highlightedLinks || {};

      const papers = Array.isArray(data.svat_papers) ? data.svat_papers : [];
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

    storage.get("categories").then((data) => {
      const categories = data.categories || {};
      categories[name] = color;
      storage.set({ categories }).then(() => {
        categoryNameInput.value = "";
        loadCategories();
      });
    });
  });

  removeLinks.addEventListener("click", () => {
    if (!confirm("Tem certeza que deseja remover TODOS os links marcados?")) return;
    chrome.storage.local.set({ highlightedLinks: {}, svat_papers: [] }, () => {
      loadHighlightedLinks();
    });
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

  // Projects elements
  const projectListEl = document.getElementById('projectList');
  const newProjectNameInput = document.getElementById('newProjectName');
  const addProjectBtn = document.getElementById('addProjectBtn');

  // =====================
  // Projects
  // =====================
  function loadProjects() {
    storage.get(['svat_project','svat_projects']).then((data) => {
      const current = data.svat_project || { id: 'p_default', title: 'Projeto padrão' };
      const projects = Array.isArray(data.svat_projects) ? data.svat_projects : [current];

      projectListEl.innerHTML = '';

      for (const p of projects) {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '8px';
        li.style.padding = '6px';

        const titleWrap = document.createElement('div');
        titleWrap.style.flex = '1';
        titleWrap.style.display = 'flex';
        titleWrap.style.flexDirection = 'column';

        const title = document.createElement('div');
        title.textContent = p.title || p.name || p.id;
        title.style.fontWeight = '600';

        const meta = document.createElement('div');
        meta.textContent = `ID: ${p.id || p.name || '—'}`;
        meta.style.fontSize = '12px';
        meta.style.opacity = '0.85';

        titleWrap.appendChild(title);
        titleWrap.appendChild(meta);

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '6px';

        const btnRename = document.createElement('button');
        btnRename.textContent = 'Renomear';
        btnRename.className = 'btn';
        btnRename.addEventListener('click', () => {
          const newName = prompt('Novo nome do projeto', p.title || p.name || '');
          if (!newName) return;
          const updated = projects.map(x => x.id === p.id ? { ...x, title: newName } : x);
          // also update current project title if matches
          const updatedCurrent = (current.id === p.id) ? { ...current, title: newName } : current;
          storage.set({ svat_projects: updated, svat_project: updatedCurrent }).then(() => loadProjects());
        });

        const btnRemove = document.createElement('button');
        btnRemove.textContent = 'Remover';
        btnRemove.className = 'btn danger';
        btnRemove.addEventListener('click', () => {
          if (!confirm(`Remover projeto "${p.title || p.name}"?`)) return;
          const remaining = projects.filter(x => x.id !== p.id);
          let newCurrent = current;
          if (current.id === p.id) {
            newCurrent = remaining[0] || { id: 'p_default', title: 'Projeto padrão' };
          }
          storage.set({ svat_projects: remaining, svat_project: newCurrent }).then(() => loadProjects());
        });

        const btnMark = document.createElement('button');
        btnMark.textContent = (current.id === p.id) ? 'Atual' : 'Marcar atual';
        btnMark.className = current.id === p.id ? 'btn primary' : 'btn';
        btnMark.addEventListener('click', () => {
          if (current.id === p.id) return;
          storage.set({ svat_project: p }).then(() => loadProjects());
        });

        actions.appendChild(btnRename);
        actions.appendChild(btnRemove);
        actions.appendChild(btnMark);

        li.appendChild(titleWrap);
        li.appendChild(actions);

        projectListEl.appendChild(li);
      }
    }).catch(()=>{});
  }

  // Create new project
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
      const name = (newProjectNameInput?.value || '').trim();
      if (!name) { alert('Informe o nome do projeto.'); return; }
      const id = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9_-]/g,'') + '_' + Date.now();
      const proj = { id, title: name, createdAt: new Date().toISOString() };
      storage.get(['svat_projects']).then((data) => {
        const projects = Array.isArray(data.svat_projects) ? data.svat_projects.slice() : [];
        projects.push(proj);
        storage.set({ svat_projects: projects }).then(() => {
          if (newProjectNameInput) newProjectNameInput.value = '';
          loadProjects();
        });
      }).catch(()=>{});
    });

    // allow Enter to submit
    if (newProjectNameInput) {
      newProjectNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addProjectBtn.click();
      });
    }
  }


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
  // Init loads
  // =====================
  loadOnOff();
  loadCategories();
  loadHighlightedLinks();
  loadProjects();
});
