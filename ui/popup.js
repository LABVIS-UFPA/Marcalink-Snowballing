async function refresh() {
  //Provavelmente vamos remover esse script svat_storage.js.
  // await svatMigrateIfNeeded();
  // const state = await svatGetAll();
  // const projEl = document.getElementById("proj");
  // projEl.textContent = `Projeto: ${state.project.title || state.project.id} • Iteração: ${state.project.currentIterationId || "I1"}`;

  // const total = state.papers.length;
  // const inc = state.papers.filter(p => p.status === "included").length;
  // const exc = state.papers.filter(p => p.status === "excluded").length;
  // const pen = state.papers.filter(p => p.status === "pending").length;

  document.getElementById("k_total").textContent = 0;//total;
  document.getElementById("k_inc").textContent = 0;//inc;
  document.getElementById("k_exc").textContent = 0;//exc;
  document.getElementById("k_pen").textContent = 0;//pen;
}

document.getElementById("openDashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/dashboard.html") });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openProjects").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/projects.html") });
});



// File import removed — no file input in popup.html per user request.

refresh();