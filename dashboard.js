import {fmtDate, normalizeStr, jaccard} from './core/utils.mjs';

let state = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));


async function loadState() {
  await svatMigrateIfNeeded();
  state = await svatGetAll();
  // Ensure current iteration exists
  if (state.project.currentIterationId && !state.iterations.find(i => i.id === state.project.currentIterationId)) {
    state.iterations.push({ id: state.project.currentIterationId, type: "snowballing", mode: "both", createdAt: svatNowIso() });
    await svatSetAll(state);
  }
}

function setActiveView(view) {
  $$(".navBtn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  $$(".view").forEach(v => v.classList.toggle("hidden", v.id !== `view_${view}`));
}

function computeCounts() {
  const total = state.papers.length;
  const included = state.papers.filter(p => p.status === "included").length;
  const excluded = state.papers.filter(p => p.status === "excluded").length;
  const pending = state.papers.filter(p => p.status === "pending").length;
  const duplicate = state.papers.filter(p => p.status === "duplicate").length;
  const seed = state.papers.filter(p => p.origin === "seed").length;
  const backward = state.papers.filter(p => p.origin === "backward").length;
  const forward = state.papers.filter(p => p.origin === "forward").length;
  return { total, included, excluded, pending, duplicate, seed, backward, forward };
}

function ensureHistory(p) {
  if (!p.history || !Array.isArray(p.history)) p.history = [];
  return p.history;
}

function pushHistory(paper, action, details = {}) {
  const h = ensureHistory(paper);
  h.push({ ts: svatNowIso(), action, details });
  // Keep it bounded
  if (h.length > 200) paper.history = h.slice(h.length - 200);
}

function renderHeader() {
  $("#projectTitle").textContent = state.project.title || state.project.id || "Projeto";
  $("#projectMeta").textContent = `ID: ${state.project.id || "—"} • Pesquisador: ${state.project.researcher || "—"} • Iteração atual: ${state.project.currentIterationId || "I1"}`;
  $("#brandSub").textContent = `Iteração ${state.project.currentIterationId || "I1"}`;
}

function renderOverview() {
  const c = computeCounts();
  $("#kpi_total").textContent = c.total;
  $("#kpi_included").textContent = c.included;
  $("#kpi_excluded").textContent = c.excluded;
  $("#kpi_pending").textContent = c.pending;
  $("#kpi_duplicate").textContent = c.duplicate;
  $("#kpi_seed").textContent = c.seed;

  // Status bars
  const rows = [
    { label: "Incluídos", val: c.included },
    { label: "Excluídos", val: c.excluded },
    { label: "Pendentes", val: c.pending },
    { label: "Duplicados", val: c.duplicate },
  ];
  const max = Math.max(1, ...rows.map(r => r.val));
  const bars = $("#statusBars");
  bars.innerHTML = "";
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "barRow";
    div.innerHTML = `
      <div>${r.label}</div>
      <div class="bar"><span style="width:${(r.val / max) * 100}%"></span></div>
      <div style="text-align:right;font-variant-numeric:tabular-nums">${r.val}</div>
    `;
    bars.appendChild(div);
  }

  renderTimeline();
  renderFlow();
  renderPendingTable();
}

function renderTimeline() {
  const svg = $("#timeline");
  // Clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const years = state.papers
    .map(p => Number(p.year))
    .filter(y => Number.isFinite(y) && y > 1900 && y < 2100);
  if (!years.length) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "12");
    t.setAttribute("y", "24");
    t.setAttribute("fill", "#666");
    t.textContent = "Sem anos detectados ainda (ok — você pode adicionar manualmente na tabela).";
    svg.appendChild(t);
    return;
  }
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const counts = new Map();
  for (let y = minY; y <= maxY; y++) counts.set(y, 0);
  for (const y of years) counts.set(y, (counts.get(y) || 0) + 1);
  const entries = [...counts.entries()];
  const maxC = Math.max(...entries.map(([, v]) => v));

  const box = svg.getBoundingClientRect();
  const w = Math.max(300, box.width || 600);
  const h = 180;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const pad = { l: 24, r: 10, t: 10, b: 26 };
  const bw = (w - pad.l - pad.r) / entries.length;

  // Bars
  entries.forEach(([y, v], i) => {
    const bh = (v / maxC) * (h - pad.t - pad.b);
    const x = pad.l + i * bw;
    const y0 = h - pad.b - bh;

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x + 1);
    rect.setAttribute("y", y0);
    rect.setAttribute("width", Math.max(2, bw - 2));
    rect.setAttribute("height", bh);
    rect.setAttribute("rx", "4");
    rect.setAttribute("fill", "#111");
    rect.setAttribute("opacity", "0.85");
    rect.style.cursor = "pointer";
    rect.addEventListener("click", () => {
      setActiveView("papers");
      $("#f_iteration").value = "all";
      $("#f_status").value = "all";
      $("#f_origin").value = "all";
      $("#search").value = String(y);
      renderPapersTable();
    });
    svg.appendChild(rect);

    if (i % Math.ceil(entries.length / 8) === 0) {
      const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
      tx.setAttribute("x", x + bw / 2);
      tx.setAttribute("y", h - 10);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("font-size", "10");
      tx.setAttribute("fill", "#555");
      tx.textContent = String(y);
      svg.appendChild(tx);
    }
  });

  // Axis line
  const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  axis.setAttribute("x1", pad.l);
  axis.setAttribute("x2", w - pad.r);
  axis.setAttribute("y1", h - pad.b);
  axis.setAttribute("y2", h - pad.b);
  axis.setAttribute("stroke", "#ddd");
  svg.appendChild(axis);
}

function renderFlow() {
  const c = computeCounts();
  const duplicates = c.duplicate;
  const foundBackward = c.backward;
  const foundForward = c.forward;
  const foundSeed = c.seed;
  const screened = c.total - duplicates;
  const included = c.included;
  const excluded = c.excluded;

  const flow = $("#flow");
  flow.innerHTML = "";
  const boxes = [
    { t: "Seeds", v: foundSeed },
    { t: "Backward", v: foundBackward },
    { t: "Forward", v: foundForward },
    { t: "Duplicados", v: duplicates },
    { t: "Triados", v: screened },
    { t: "Incluídos", v: included },
  ];
  for (const b of boxes) {
    const el = document.createElement("div");
    el.className = "flowBox";
    el.innerHTML = `<div class="t">${b.t}</div><div class="v">${b.v}</div>`;
    flow.appendChild(el);
  }
}

function renderPendingTable() {
  const tbody = $("#pendingTable tbody");
  tbody.innerHTML = "";
  const pending = state.papers
    .filter(p => p.status === "pending")
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))
    .slice(0, 8);

  for (const p of pending) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.title || p.url || "(sem título)")}</td>
      <td><span class="pill">${escapeHtml(p.origin || "unknown")}</span></td>
      <td><span class="pill">${escapeHtml(p.iterationId || "-")}</span></td>
      <td>
        <button class="btn" data-act="include" data-id="${p.id}">Incluir</button>
        <button class="btn" data-act="exclude" data-id="${p.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const act = btn.getAttribute("data-act");
      const paper = state.papers.find(x => x.id === id);
      if (!paper) return;
      const prev = paper.status || "pending";
      paper.status = act === "include" ? "included" : "excluded";
      pushHistory(paper, "status_change", { from: prev, to: paper.status, via: "pendingTable" });
      paper.updatedAt = svatNowIso();
      await persist();
      renderAll();
    });
  });
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHistoryTable(targetTbody, history) {
  targetTbody.innerHTML = "";
  const rows = Array.isArray(history) ? [...history] : [];
  rows.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  for (const h of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(fmtDate(h.ts))}</td>
      <td><span class="pill">${escapeHtml(h.action || "-")}</span></td>
      <td style="color:#444">${escapeHtml(JSON.stringify(h.details || {}))}</td>
    `;
    targetTbody.appendChild(tr);
  }
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color:#666">Sem histórico para este artigo ainda.</td>`;
    targetTbody.appendChild(tr);
  }
}

function showHistory(paperId) {
  const p = state.papers.find(x => x.id === paperId);
  if (!p) return;

  // Update inline insights history table
  const inlineTbody = document.querySelector("#historyTable tbody");
  if (inlineTbody) renderHistoryTable(inlineTbody, p.history);

  // Also open modal (fallback / better UX)
  const modal = document.getElementById("historyModal");
  const title = document.getElementById("historyModalTitle");
  const modalTbody = document.querySelector("#historyModalTable tbody");
  if (title) title.textContent = `Histórico: ${(p.title || p.url || p.id).slice(0, 90)}`;
  if (modalTbody) renderHistoryTable(modalTbody, p.history);
  if (modal) modal.classList.remove("hidden");

  // Jump user to Insights so they see the audit trail section too
  setActiveView("insights");
}

function buildSummaryText() {
  const c = computeCounts();
  const iters = [...state.iterations].sort((a, b) => (a.id || "").localeCompare(b.id || ""));
  const byIter = new Map();
  for (const it of iters) {
    const papers = state.papers.filter(p => (p.iterationId || "") === it.id);
    const inc = papers.filter(p => p.status === "included").length;
    const exc = papers.filter(p => p.status === "excluded").length;
    const dup = papers.filter(p => p.status === "duplicate").length;
    const pend = papers.filter(p => (p.status || "pending") === "pending").length;
    byIter.set(it.id, { total: papers.length, inc, exc, dup, pend, mode: it.mode || "both" });
  }

  const critKeys = Object.keys(state.criteria || {}).filter(k => k).sort();
  const critCounts = critKeys.map(k => ({ k, n: state.papers.filter(p => p.criteriaId === k).length, d: state.criteria[k] || "" }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  const lines = [];
  lines.push(`Projeto: ${state.project.title || "(sem título)"} (ID: ${state.project.id || "—"})`);
  lines.push(`Pesquisador: ${state.project.researcher || "—"}`);
  lines.push("");
  lines.push("Resumo quantitativo:");
  lines.push(`- Total coletado: ${c.total}`);
  lines.push(`- Incluídos: ${c.included}`);
  lines.push(`- Excluídos: ${c.excluded}`);
  lines.push(`- Pendentes: ${c.pending}`);
  lines.push(`- Duplicados: ${c.duplicate}`);
  lines.push("");
  lines.push("Por origem (rastreamento do snowballing):");
  lines.push(`- Seeds: ${c.seed}`);
  lines.push(`- Backward: ${c.backward}`);
  lines.push(`- Forward: ${c.forward}`);
  lines.push("");
  lines.push("Por iteração:");
  for (const [id, v] of byIter.entries()) {
    lines.push(`- ${id} (${v.mode}): total=${v.total}, incluídos=${v.inc}, excluídos=${v.exc}, pendentes=${v.pend}, duplicados=${v.dup}`);
  }
  lines.push("");
  if (critCounts.length) {
    lines.push("Principais critérios de exclusão (top):");
    for (const x of critCounts) lines.push(`- ${x.k}: ${x.n}${x.d ? ` — ${x.d}` : ""}`);
    lines.push("");
  }
  lines.push("Observação: o Google Scholar não oferece API; as conexões (forward/backward) e metadados são coletados manualmente e registrados pela extensão.");
  return lines.join("\n");
}

function computeSaturationNote() {
  // Heurística simples: se a iteração atual (ou última) não trouxe novos incluídos, sinaliza.
  const iters = [...state.iterations].sort((a, b) => (a.id || "").localeCompare(b.id || ""));
  if (!iters.length) return "Sem iterações ainda.";
  const last = iters[iters.length - 1].id;
  const prev = iters.length >= 2 ? iters[iters.length - 2].id : null;

  const incLast = state.papers.filter(p => p.iterationId === last && p.status === "included").length;
  const newLast = state.papers.filter(p => p.iterationId === last).length;
  const incPrev = prev ? state.papers.filter(p => p.iterationId === prev && p.status === "included").length : null;

  if (newLast === 0) return `Iteração ${last}: nenhum artigo coletado ainda.`;
  if (incLast === 0) return `Alerta: na iteração ${last}, nenhum artigo foi incluído. Isso pode indicar saturação.`;
  if (incPrev !== null && incLast <= Math.max(1, Math.floor(incPrev * 0.2))) {
    return `Possível saturação: incluídos em ${prev} = ${incPrev}, incluídos em ${last} = ${incLast}.`;
  }
  return `Sem sinal forte de saturação na iteração ${last} (incluídos: ${incLast}).`;
}


function findDuplicatePairs(threshold = 0.85) {
  const papers = state.papers.filter(p => (p.title || "").trim().length >= 6);
  const pairs = [];
  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const a = papers[i];
      const b = papers[j];
      if (a.id === b.id) continue;
      const score = jaccard(a.title, b.title);
      if (score >= threshold) {
        pairs.push({ aId: a.id, bId: b.id, aTitle: a.title, bTitle: b.title, score });
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return pairs.slice(0, 50);
}

function renderDuplicates(pairs) {
  const tbody = document.querySelector("#dupsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const p of pairs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:800">${escapeHtml(p.aTitle || p.aId)}</div>
        <div style="margin-top:4px;color:#666">↔ ${escapeHtml(p.bTitle || p.bId)}</div>
      </td>
      <td style="font-variant-numeric:tabular-nums">${p.score.toFixed(2)}</td>
      <td>
        <button class="btn" data-dup="${p.aId}|${p.bId}">Marcar B como duplicado</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  if (!pairs.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color:#666">Nenhuma duplicata sugerida com esse limite.</td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-dup]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const [aId, bId] = btn.getAttribute("data-dup").split("|");
      const b = state.papers.find(x => x.id === bId);
      if (!b) return;
      const prev = b.status || "pending";
      b.status = "duplicate";
      pushHistory(b, "status_change", { from: prev, to: "duplicate", via: "dupe_suggestion", matchWith: aId });
      b.updatedAt = svatNowIso();
      await persist();
      renderAll();
      setActiveView("insights");
    });
  });
}

function renderInsights() {
  const sat = document.getElementById("saturationBox");
  if (sat) sat.textContent = computeSaturationNote();
}

function renderIterationFilterOptions() {
  const sel = $("#f_iteration");
  const current = sel.value;
  sel.innerHTML = `<option value="all">Iteração: todas</option>`;
  for (const it of state.iterations) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.id;
    sel.appendChild(opt);
  }
  sel.value = current && [...sel.options].some(o => o.value === current) ? current : "all";

  // Graph filter
  const gSel = $("#g_filterIteration");
  const gCur = gSel.value;
  gSel.innerHTML = `<option value="all">Iteração: todas</option>`;
  for (const it of state.iterations) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.id;
    gSel.appendChild(opt);
  }
  gSel.value = gCur && [...gSel.options].some(o => o.value === gCur) ? gCur : "all";
}

function getFilters() {
  return {
    q: normalizeStr($("#search").value),
    status: $("#f_status").value,
    origin: $("#f_origin").value,
    iteration: $("#f_iteration").value,
  };
}

function filteredPapers() {
  const f = getFilters();
  return state.papers.filter(p => {
    if (f.status !== "all" && (p.status || "pending") !== f.status) return false;
    if (f.origin !== "all" && (p.origin || "unknown") !== f.origin) return false;
    if (f.iteration !== "all" && (p.iterationId || "") !== f.iteration) return false;
    if (!f.q) return true;
    const hay = normalizeStr(`${p.title || ""} ${p.authorsRaw || ""} ${(p.tags || []).join(" ")} ${p.year || ""} ${p.url || ""}`);
    return hay.includes(f.q);
  });
}

function renderPapersTable() {
  renderIterationFilterOptions();
  const tbody = $("#papersTable tbody");
  tbody.innerHTML = "";

  const rows = filteredPapers().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  for (const p of rows) {
    const tr = document.createElement("tr");
    const tags = Array.isArray(p.tags) ? p.tags.join(";") : "";
    const critVal = p.criteriaId || "";

    tr.innerHTML = `
      <td><input type="checkbox" class="rowCheck" data-id="${p.id}" /></td>
      <td>
        <button class="linkBtn" data-show-history="${p.id}" title="Ver histórico">${escapeHtml(p.title || "(sem título)")}</button>
        <div style="color:#666;font-size:11px;margin-top:4px">${escapeHtml(p.authorsRaw || "")} • ${escapeHtml(fmtDate(p.createdAt))}</div>
      </td>
      <td><input class="cellInput" data-field="year" data-id="${p.id}" value="${escapeHtml(p.year ?? "")}" placeholder="—" style="width:64px" /></td>
      <td>
        <select class="cellSelect" data-field="origin" data-id="${p.id}">
          ${opt("seed","seed",p.origin)}
          ${opt("backward","backward",p.origin)}
          ${opt("forward","forward",p.origin)}
          ${opt("unknown","unknown",p.origin)}
        </select>
      </td>
      <td>
        <select class="cellSelect" data-field="iterationId" data-id="${p.id}">
          ${state.iterations.map(it => `<option value="${it.id}" ${it.id === (p.iterationId||state.project.currentIterationId) ? "selected" : ""}>${it.id}</option>`).join("")}
        </select>
      </td>
      <td>
        <select class="cellSelect" data-field="status" data-id="${p.id}">
          ${opt("pending","pending",p.status)}
          ${opt("included","included",p.status)}
          ${opt("excluded","excluded",p.status)}
          ${opt("duplicate","duplicate",p.status)}
        </select>
      </td>
      <td>
        <select class="cellSelect" data-field="criteriaId" data-id="${p.id}">
          <option value="" ${!critVal ? "selected" : ""}>—</option>
          ${Object.keys(state.criteria || {}).filter(k=>k).sort().map(k => `<option value="${k}" ${k === critVal ? "selected" : ""}>${k}</option>`).join("")}
        </select>
      </td>
      <td><input class="cellInput" data-field="tags" data-id="${p.id}" value="${escapeHtml(tags)}" placeholder="ex: vis;ml" /></td>
      <td><a class="link" href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">Abrir</a></td>
    `;
    tbody.appendChild(tr);
  }

  // Bind inputs
  tbody.querySelectorAll(".cellSelect").forEach(el => el.addEventListener("change", onCellChange));
  tbody.querySelectorAll(".cellInput").forEach(el => el.addEventListener("change", onCellChange));
  tbody.querySelectorAll("button[data-show-history]").forEach(b => {
    b.addEventListener("click", () => showHistory(b.getAttribute("data-show-history")));
  });
  $("#checkAll").checked = false;
}

function opt(value, label, current) {
  const cur = current || (value === "pending" ? "pending" : "unknown");
  return `<option value="${value}" ${value === cur ? "selected" : ""}>${label}</option>`;
}

async function onCellChange(e) {
  const el = e.target;
  const id = el.getAttribute("data-id");
  const field = el.getAttribute("data-field");
  const paper = state.papers.find(p => p.id === id);
  if (!paper) return;
  let val = el.value;
  const prev = paper[field];
  if (field === "year") {
    const n = Number(val);
    paper.year = Number.isFinite(n) ? n : null;
  } else if (field === "tags") {
    paper.tags = val.split(/[;,]/).map(s => s.trim()).filter(Boolean);
  } else {
    paper[field] = val;
  }
  if (field === "status") {
    pushHistory(paper, "status_change", { from: prev || "pending", to: paper.status, via: "table" });
  } else {
    pushHistory(paper, "update_field", { field, from: prev, to: paper[field] });
  }
  paper.updatedAt = svatNowIso();
  await persist();
  renderOverview();
  renderCriteria();
}

function selectedPaperIds() {
  return $$(".rowCheck:checked").map(ch => ch.getAttribute("data-id"));
}

async function bulkSet(field, value) {
  const ids = selectedPaperIds();
  if (!ids.length) {
    alert("Selecione pelo menos 1 artigo.");
    return;
  }
  for (const id of ids) {
    const p = state.papers.find(x => x.id === id);
    if (!p) continue;
    const prev = p[field];
    p[field] = value;
    if (field === "status") {
      pushHistory(p, "status_change", { from: prev || "pending", to: value, via: "bulk" });
    } else {
      pushHistory(p, "bulk_update", { field, from: prev, to: value });
    }
    p.updatedAt = svatNowIso();
  }
  await persist();
  renderAll();
}

function renderIterations() {
  const tbody = $("#iterationsTable tbody");
  tbody.innerHTML = "";
  for (const it of state.iterations) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(it.id)}</span></td>
      <td>${escapeHtml(it.type || "snowballing")}</td>
      <td>${escapeHtml(it.mode || "both")}</td>
      <td>${escapeHtml(fmtDate(it.createdAt))}</td>
      <td>
        <button class="btn" data-act="setCurrent" data-id="${it.id}">Atual</button>
        <button class="btn" data-act="del" data-id="${it.id}">Remover</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      if (act === "setCurrent") {
        state.project.currentIterationId = id;
        await persist();
        renderHeader();
        renderIterationFilterOptions();
        alert(`Iteração atual definida: ${id}`);
      }
      if (act === "del") {
        if (!confirm(`Remover iteração ${id}? (Artigos permanecem com iterationId)`)) return;
        state.iterations = state.iterations.filter(x => x.id !== id);
        if (!state.iterations.length) state.iterations.push({ id: "I1", type: "seed", mode: "seed", createdAt: svatNowIso() });
        if (!state.iterations.find(x => x.id === state.project.currentIterationId)) state.project.currentIterationId = state.iterations[0].id;
        await persist();
        renderAll();
      }
    });
  });
}

function renderCriteria() {
  // criteria table
  const tbody = $("#criteriaTable tbody");
  tbody.innerHTML = "";
  const keys = Object.keys(state.criteria || {}).filter(k => k).sort();
  for (const k of keys) {
    const desc = state.criteria[k] || "";
    const count = state.papers.filter(p => p.criteriaId === k).length;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(k)}</span></td>
      <td>${escapeHtml(desc)}</td>
      <td>${count}</td>
      <td><button class="btn" data-del="${k}">Remover</button></td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      if (!confirm(`Remover critério ${id}?`)) return;
      delete state.criteria[id];
      // clear references
      state.papers.forEach(p => { if (p.criteriaId === id) p.criteriaId = ""; });
      await persist();
      renderAll();
    });
  });

  // excluded list
  const exBody = $("#excludedTable tbody");
  exBody.innerHTML = "";
  const excluded = state.papers.filter(p => p.status === "excluded").slice(0, 200);
  for (const p of excluded) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.title || "(sem título)")}</td>
      <td><span class="pill">${escapeHtml(p.criteriaId || "—")}</span></td>
      <td><span class="pill">${escapeHtml(p.iterationId || "-")}</span></td>
      <td><a class="link" href="${escapeHtml(p.url)}" target="_blank" rel="noreferrer">Abrir</a></td>
    `;
    exBody.appendChild(tr);
  }
}

function renderCitations() {
  const fromSel = $("#c_from");
  const toSel = $("#c_to");
  const papers = [...state.papers].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const makeOpts = () => papers.map(p => `<option value="${p.id}">${escapeHtml((p.title||p.url||p.id).slice(0, 80))}</option>`).join("");
  fromSel.innerHTML = makeOpts();
  toSel.innerHTML = makeOpts();

  const tbody = $("#citationsTable tbody");
  tbody.innerHTML = "";
  for (const [idx, c] of state.citations.entries()) {
    const f = state.papers.find(p => p.id === c.fromPaperId);
    const t = state.papers.find(p => p.id === c.toPaperId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml((f?.title || c.fromPaperId).slice(0, 70))}</td>
      <td><span class="pill">${escapeHtml(c.type)}</span></td>
      <td>${escapeHtml((t?.title || c.toPaperId).slice(0, 70))}</td>
      <td><button class="btn" data-del="${idx}">Remover</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const i = Number(btn.getAttribute("data-del"));
      state.citations.splice(i, 1);
      await persist();
      renderCitations();
      renderGraph();
    });
  });
}

function buildGraphData() {
  const it = $("#g_filterIteration").value;
  const st = $("#g_filterStatus").value;

  const paperOk = (p) => {
    if (it !== "all" && (p.iterationId || "") !== it) return false;
    if (st !== "all" && (p.status || "pending") !== st) return false;
    return true;
  };

  const nodes = state.papers.filter(paperOk).map(p => ({
    id: p.id,
    title: p.title || p.url || p.id,
    url: p.url,
    status: p.status || "pending",
    origin: p.origin || "unknown",
    iterationId: p.iterationId || "",
  }));
  const nodeSet = new Set(nodes.map(n => n.id));
  const links = state.citations
    .filter(c => nodeSet.has(c.fromPaperId) && nodeSet.has(c.toPaperId))
    .map(c => ({ source: c.fromPaperId, target: c.toPaperId, type: c.type }));
  return { nodes, links };
}

function renderGraph() {
  const svg = $("#graph");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const details = $("#graphDetails");

  const { nodes, links } = buildGraphData();
  if (nodes.length === 0) {
    details.textContent = "Sem nós para mostrar (ajuste filtros ou adicione artigos).";
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", "12");
    t.setAttribute("y", "24");
    t.setAttribute("fill", "#666");
    t.textContent = "Sem dados para o grafo.";
    svg.appendChild(t);
    return;
  }
  const box = svg.getBoundingClientRect();
  const w = Math.max(600, box.width || 900);
  const h = 520;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

  // Simple force layout (Fruchterman-Reingold style)
  // Initialize positions
  const pos = new Map();
  for (const n of nodes) {
    pos.set(n.id, { x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0 });
  }

  const k = Math.sqrt((w * h) / (nodes.length + 1));
  const iters = 300;
  const dt = 0.02;
  const rep = (d) => (k * k) / Math.max(1, d);
  const att = (d) => (d * d) / k;
  const linkPairs = links.map(l => [l.source, l.target]);

  for (let step = 0; step < iters; step++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].id;
        const b = nodes[j].id;
        const pa = pos.get(a);
        const pb = pos.get(b);
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = rep(dist);
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        pa.vx += fx;
        pa.vy += fy;
        pb.vx -= fx;
        pb.vy -= fy;
      }
    }
    // Attraction
    for (const [s, t] of linkPairs) {
      const ps = pos.get(s);
      const pt = pos.get(t);
      const dx = ps.x - pt.x;
      const dy = ps.y - pt.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = att(dist);
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      ps.vx -= fx;
      ps.vy -= fy;
      pt.vx += fx;
      pt.vy += fy;
    }
    // Integrate
    for (const n of nodes) {
      const p = pos.get(n.id);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.85;
      p.vy *= 0.85;
      // Keep inside
      p.x = Math.max(16, Math.min(w - 16, p.x));
      p.y = Math.max(16, Math.min(h - 16, p.y));
    }
  }

  // Draw links
  for (const l of links) {
    const ps = pos.get(l.source);
    const pt = pos.get(l.target);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", ps.x);
    line.setAttribute("y1", ps.y);
    line.setAttribute("x2", pt.x);
    line.setAttribute("y2", pt.y);
    line.setAttribute("stroke", "#bbb");
    line.setAttribute("stroke-width", l.type === "forward" ? "2" : "1.2");
    line.setAttribute("opacity", "0.8");
    svg.appendChild(line);
  }

  // Draw nodes
  for (const n of nodes) {
    const p = pos.get(n.id);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.style.cursor = "pointer";

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", "8");
    circle.setAttribute("fill", "#111");
    circle.setAttribute("opacity", n.status === "excluded" ? "0.35" : n.status === "included" ? "0.95" : "0.7");
    g.appendChild(circle);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", p.x + 12);
    label.setAttribute("y", p.y + 4);
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#333");
    label.textContent = (n.title || "").toString().slice(0, 32);
    g.appendChild(label);

    g.addEventListener("click", () => {
      details.innerHTML = `
        <div style="font-weight:900;font-size:14px">${escapeHtml(n.title)}</div>
        <div style="margin-top:6px;color:#444">Status: <span class="pill">${escapeHtml(n.status)}</span> • Origem: <span class="pill">${escapeHtml(n.origin)}</span> • Iteração: <span class="pill">${escapeHtml(n.iterationId)}</span></div>
        <div style="margin-top:10px"><a class="link" href="${escapeHtml(n.url)}" target="_blank" rel="noreferrer">Abrir no navegador</a></div>
      `;
      if (n.url) window.open(n.url, "_blank");
    });

    svg.appendChild(g);
  }
}

async function persist() {
  await svatSetAll(state);
}

function renderAll() {
  renderHeader();
  renderOverview();
  renderInsights();
  renderPapersTable();
  renderIterations();
  renderCriteria();
  renderCitations();
  renderGraph();
}

function bindEvents() {
  // Navigation
  $$(".navBtn").forEach(btn => btn.addEventListener("click", () => setActiveView(btn.dataset.view)));

  // Top actions
  $("#btnOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#btnClear").addEventListener("click", async () => {
    if (!confirm("Isso vai apagar papers/iterações/conexões/critérios. Continuar?")) return;
    await chrome.storage.local.remove(Object.values(SVAT_KEYS));
    await loadState();
    renderAll();
  });

  $("#btnImport").addEventListener("click", () => $("#fileImport").click());
  $("#fileImport").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.project || !Array.isArray(parsed.papers)) {
      alert("JSON inválido: esperado objeto com project e papers.");
      return;
    }
    state = {
      project: parsed.project,
      papers: parsed.papers || [],
      iterations: parsed.iterations || [{ id: parsed.project.currentIterationId || "I1", type: "seed", mode: "seed", createdAt: svatNowIso() }],
      citations: parsed.citations || [],
      criteria: parsed.criteria || {},
    };
    await persist();
    renderAll();
    alert("Importado com sucesso.");
  });

  $("#btnExportJson").addEventListener("click", async () => {
    const filename = `snowballing_${(state.project.id || "project").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    svatDownload(filename, JSON.stringify(state, null, 2));
  });
  $("#btnExportCsv").addEventListener("click", async () => {
    if (!state.papers.length) return alert("Sem papers para exportar.");
    const rows = state.papers.map(p => ({
      id: p.id,
      title: p.title,
      year: p.year,
      origin: p.origin,
      iterationId: p.iterationId,
      status: p.status,
      criteriaId: p.criteriaId,
      tags: Array.isArray(p.tags) ? p.tags.join(";") : "",
      url: p.url,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    const csv = svatToCsv(rows);
    const filename = `triagem_${(state.project.id || "project").replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;
    svatDownload(filename, csv, "text/csv");
  });
  $("#btnExportBib").addEventListener("click", async () => {
    const included = state.papers.filter(p => p.status === "included");
    if (!included.length) return alert("Sem artigos incluídos.");
    const bib = svatToBibtex(included);
    const filename = `included_${(state.project.id || "project").replace(/[^a-zA-Z0-9_-]/g, "_")}.bib`;
    svatDownload(filename, bib, "application/x-bibtex");
  });

  // Insights
  const btnSum = document.getElementById("btnGenerateSummary");
  if (btnSum) btnSum.addEventListener("click", () => {
    const t = document.getElementById("summaryText");
    if (t) t.value = buildSummaryText();
  });
  const btnCopy = document.getElementById("btnCopySummary");
  if (btnCopy) btnCopy.addEventListener("click", async () => {
    const t = document.getElementById("summaryText");
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t.value || "");
      alert("Resumo copiado.");
    } catch {
      t.select();
      document.execCommand("copy");
      alert("Resumo copiado.");
    }
  });
  const btnDup = document.getElementById("btnFindDuplicates");
  if (btnDup) btnDup.addEventListener("click", () => {
    const thr = Number(document.getElementById("dupThreshold")?.value || "0.85");
    renderDuplicates(findDuplicatePairs(thr));
  });

  // History modal close
  const btnClose = document.getElementById("btnCloseHistory");
  if (btnClose) btnClose.addEventListener("click", () => document.getElementById("historyModal")?.classList.add("hidden"));
  const modal = document.getElementById("historyModal");
  if (modal) modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // Papers filters
  ["search", "f_status", "f_origin", "f_iteration"].forEach(id => {
    $("#" + id).addEventListener("input", renderPapersTable);
    $("#" + id).addEventListener("change", renderPapersTable);
  });
  $("#checkAll").addEventListener("change", (e) => {
    const checked = e.target.checked;
    $$(".rowCheck").forEach(ch => ch.checked = checked);
  });

  $("#btnBulkInclude").addEventListener("click", () => bulkSet("status", "included"));
  $("#btnBulkExclude").addEventListener("click", () => bulkSet("status", "excluded"));
  $("#btnBulkPending").addEventListener("click", () => bulkSet("status", "pending"));
  $("#btnBulkDuplicate").addEventListener("click", () => bulkSet("status", "duplicate"));

  // Iterations
  $("#btnAddIteration").addEventListener("click", async () => {
    const id = $("#newIterId").value.trim();
    const mode = $("#newIterMode").value;
    if (!id) return alert("Informe um ID (ex: I2).");
    if (state.iterations.find(i => i.id === id)) return alert("Essa iteração já existe.");
    state.iterations.push({ id, type: mode === "seed" ? "seed" : "snowballing", mode, createdAt: svatNowIso() });
    $("#newIterId").value = "";
    await persist();
    renderAll();
  });
  $("#btnSetCurrentIteration").addEventListener("click", async () => {
    const id = $("#newIterId").value.trim();
    if (!id) return alert("Digite o ID da iteração e clique em Definir como atual.");
    if (!state.iterations.find(i => i.id === id)) return alert("Essa iteração não existe (adicione primeiro).");
    state.project.currentIterationId = id;
    await persist();
    renderHeader();
    renderIterationFilterOptions();
  });

  // Criteria
  $("#btnAddCriterion").addEventListener("click", async () => {
    const id = $("#critId").value.trim();
    const desc = $("#critDesc").value.trim();
    if (!id) return alert("Informe um ID (ex: C1).");
    state.criteria = state.criteria || {};
    state.criteria[id] = desc;
    $("#critId").value = "";
    $("#critDesc").value = "";
    await persist();
    renderAll();
  });

  // Citations
  $("#btnAddCitation").addEventListener("click", async () => {
    const from = $("#c_from").value;
    const to = $("#c_to").value;
    const type = $("#c_type").value;
    if (!from || !to) return;
    if (from === to) return alert("Escolha artigos diferentes.");
    state.citations = state.citations || [];
    // Avoid duplicates
    if (state.citations.find(c => c.fromPaperId === from && c.toPaperId === to && c.type === type)) {
      return alert("Conexão já existe.");
    }
    state.citations.push({ fromPaperId: from, toPaperId: to, type });
    await persist();
    renderCitations();
    renderGraph();
  });

  // Graph filters
  ["g_filterIteration", "g_filterStatus"].forEach(id => {
    $("#" + id).addEventListener("change", renderGraph);
  });
  $("#btnGraphReset").addEventListener("click", renderGraph);
}

async function init() {
  await loadState();
  bindEvents();
  renderAll();
  setActiveView("overview");
}

init();
