async function refresh() {
  await svatMigrateIfNeeded();
  const state = await svatGetAll();
  const projEl = document.getElementById("proj");
  projEl.textContent = `Projeto: ${state.project.title || state.project.id} • Iteração: ${state.project.currentIterationId || "I1"}`;

  const total = state.papers.length;
  const inc = state.papers.filter(p => p.status === "included").length;
  const exc = state.papers.filter(p => p.status === "excluded").length;
  const pen = state.papers.filter(p => p.status === "pending").length;

  document.getElementById("k_total").textContent = total;
  document.getElementById("k_inc").textContent = inc;
  document.getElementById("k_exc").textContent = exc;
  document.getElementById("k_pen").textContent = pen;
}

document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
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
  // Minimal validation
  if (!parsed || typeof parsed !== "object" || !parsed.project || !Array.isArray(parsed.papers)) {
    alert("JSON inválido: esperado objeto com project e papers.");
    return;
  }
  await svatSetAll({
    project: parsed.project,
    papers: parsed.papers || [],
    iterations: parsed.iterations || [{ id: parsed.project.currentIterationId || "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }],
    citations: parsed.citations || [],
    criteria: parsed.criteria || {},
  });
  await refresh();
  alert("Importado com sucesso.");
});

document.getElementById("clearData").addEventListener("click", async () => {
  if (!confirm("Isso vai apagar papers/iterações/conexões/critérios. Continuar?")) return;
  await chrome.storage.local.remove(Object.values(SVAT_KEYS));
  await refresh();
});

refresh();