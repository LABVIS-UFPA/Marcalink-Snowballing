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
    chrome.storage.local.get("active", (data) => {
      checkOnOff.checked = !!data.active;
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
    chrome.storage.local.get("categories", (data) => {
      categoryList.innerHTML = "";
      const categories = data.categories || {};
      const names = Object.keys(categories).sort((a, b) => a.localeCompare(b));

      function removeCategory(name) {
        chrome.storage.local.get("categories", (d) => {
          const cats = d.categories || {};
          if (!cats[name]) return;
          delete cats[name];
          chrome.storage.local.set({ categories: cats }, () => {
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

      chrome.storage.local.set({ highlightedLinks, svat_papers: filteredPapers }, () => {
        done && done();
      });
    });
  }

  function loadHighlightedLinks() {
    chrome.storage.local.get(["highlightedLinks", "svat_papers"], (data) => {
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
    chrome.storage.local.set({ active: checkOnOff.checked }, function () {
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

    chrome.storage.local.get("categories", (data) => {
      const categories = data.categories || {};
      categories[name] = color;
      chrome.storage.local.set({ categories }, () => {
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
    chrome.storage.local.get(null, function (data) {
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
    });
  });

  uploadStorage.addEventListener("change", function (event) {
    if (!confirm("Tem certeza de que deseja fazer upload deste arquivo? Isso pode sobrescrever os dados existentes.")) return;

    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (event) {
        try {
          const jsonData = JSON.parse(event.target.result);
          chrome.storage.local.set(jsonData, function () {
            alert("Dados carregados no storage com sucesso!");
          });
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
  let socket = null;

  const serverUrlInput = document.getElementById("serverUrl");
  const serverPortInput = document.getElementById("serverPort");
  const connectBtn = document.getElementById("connectBtn");
  const sendPingBtn = document.getElementById("sendPingBtn");
  const serverStatus = document.getElementById("serverStatus");
  const serverLog = document.getElementById("serverLog");

  function setServerStatus(text) {
    if (serverStatus) serverStatus.textContent = text;
  }

  function appendServerLog(msg) {
    if (!serverLog) return;
    const t = new Date().toLocaleTimeString();
    serverLog.textContent += `[${t}] ${msg}\n`;
    serverLog.scrollTop = serverLog.scrollHeight;
  }

  function buildWsUrl(url, port) {
    let u = (url || "").trim();
    let p = (port || "").toString().trim();

    if (!u) u = "ws://localhost";
    if (!p) p = "8080";

    if (!/^wss?:\/\//i.test(u)) u = "ws://" + u;
    u = u.replace(/\/+$/g, "");
    if (/:(\d+)$/.test(u)) return u;
    return `${u}:${p}`;
  }

  function disconnectSocket() {
    try { socket?.close(); } catch (e) {}
    socket = null;
    setServerStatus("Desconectado");
    if (connectBtn) connectBtn.textContent = "Conectar";
  }

  function connectSocket() {
    const fullUrl = buildWsUrl(serverUrlInput?.value, serverPortInput?.value);
    setServerStatus("Conectando...");
    appendServerLog("Conectando em " + fullUrl);

    try {
      socket = new WebSocket(fullUrl);
    } catch (e) {
      setServerStatus("Erro");
      appendServerLog("Erro ao criar WebSocket: " + (e?.message || e));
      socket = null;
      return;
    }

    socket.onopen = () => {
      setServerStatus("Conectado");
      appendServerLog("✅ Conectado");
      if (connectBtn) connectBtn.textContent = "Desconectar";
    };

    socket.onmessage = (e) => {
      appendServerLog("MSG: " + e.data);

      chrome.storage.local.get({ server_messages: [] }, (res) => {
        const msgs = Array.isArray(res.server_messages) ? res.server_messages : [];
        msgs.push({ time: Date.now(), data: e.data });
        chrome.storage.local.set({ server_messages: msgs.slice(-500) });
      });
    };

    socket.onerror = () => {
      setServerStatus("Erro");
      appendServerLog("❌ Erro na conexão");
    };

    socket.onclose = () => {
      appendServerLog("🔌 Conexão encerrada");
      disconnectSocket();
    };
  }

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        appendServerLog("Desconectando...");
        disconnectSocket();
        return;
      }
      connectSocket();
    });
  }

  if (sendPingBtn) {
    sendPingBtn.addEventListener("click", () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send("ping");
        appendServerLog("➡️ PING enviado");
      } else {
        appendServerLog("⚠️ Socket não conectado");
      }
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
  // Init loads
  // =====================
  loadOnOff();
  loadCategories();
  loadHighlightedLinks();
});
