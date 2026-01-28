async function refresh() {
  await svatMigrateIfNeeded();
  const state = await svatGetAll();

  const projEl = document.getElementById("proj");
  const title = state.project.title || state.project.id;
  const iter = state.project.currentIterationId || "I1";
  projEl.textContent = `Projeto: ${title} • Iteração: ${iter}`;

  const total = state.papers.length;
  const inc = state.papers.filter(p => p.status === "included").length;
  const exc = state.papers.filter(p => p.status === "excluded").length;
  const pen = state.papers.filter(p => p.status === "pending").length;

  document.getElementById("k_total").textContent = total;
  document.getElementById("k_inc").textContent = inc;
  document.getElementById("k_exc").textContent = exc;
  document.getElementById("k_pen").textContent = pen;

  // Active project button label
  const activeBtn = document.getElementById("activeProjectBtn");
  if (activeBtn) activeBtn.textContent = `📌 Projeto ativo: ${title}`;
}

document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openProjects").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  // focus the Projects panel
  setTimeout(() => {
    chrome.tabs.query({ url: chrome.runtime.getURL("options.html") + "*" }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("options.html#panel-projects") });
    });
  }, 100);
});

document.getElementById("activeProjectBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  setTimeout(() => {
    chrome.tabs.query({ url: chrome.runtime.getURL("options.html") + "*" }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;
      chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("options.html#panel-projects") });
    });
  }, 100);
});

document.getElementById("exportJson").addEventListener("click", async () => {
  const state = await svatGetAll();
  const filename = `snowballing_${(state.project.id || "project").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  svatDownload(filename, JSON.stringify(state, null, 2));
});

document.getElementById("importJson").addEventListener("click", () => {
  document.getElementById("file").click();
});

document.getElementById("file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== "object" || !parsed.project || !Array.isArray(parsed.papers)) {
    alert("JSON inválido: esperado objeto com project e papers.");
    return;
  }

  // Import creates a new project to avoid overwriting the current one.
  const newId = await svatCreateProject({ title: parsed.project.title || parsed.project.id || "Importado" });
  await svatSetActiveProjectId(newId);

  // keep imported meta but enforce id to match storage
  parsed.project.id = newId;
  if (!parsed.project.currentIterationId) parsed.project.currentIterationId = "I1";

  await svatSetAll({
    project: parsed.project,
    papers: parsed.papers || [],
    iterations: parsed.iterations || [{ id: parsed.project.currentIterationId || "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }],
    citations: parsed.citations || [],
    criteria: parsed.criteria || {},
  });

  await refresh();
  alert("Importado com sucesso (criado um novo projeto).");
  e.target.value = "";
});

document.getElementById("clearData").addEventListener("click", async () => {
  if (!confirm("Isso vai apagar papers/iterações/conexões/critérios do projeto ATIVO. Continuar?")) return;

  const pid = await svatGetActiveProjectId();
  const keysToRemove = [
    svatKey(SVAT_PROJECT_BASE.project, pid),
    svatKey(SVAT_PROJECT_BASE.papers, pid),
    svatKey(SVAT_PROJECT_BASE.iterations, pid),
    svatKey(SVAT_PROJECT_BASE.citations, pid),
    svatKey(SVAT_PROJECT_BASE.criteria, pid),
    svatKey(SVAT_PROJECT_BASE.categories, pid),
    svatKey(SVAT_PROJECT_BASE.highlightedLinks, pid),
  ];
  await chrome.storage.local.remove(keysToRemove);
  // re-init empty for this project
  await svatSetAll({
    project: { id: pid, title: pid, researcher: "", createdAt: svatNowIso(), currentIterationId: "I1" },
    papers: [],
    iterations: [{ id: "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }],
    citations: [],
    criteria: {},
  });

  await refresh();
});

refresh();
