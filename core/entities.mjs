class Paper {
  constructor(data = {}) {
    this.id = data.id || null;
    this.url = data.url || "";
    this.title = data.title || "";
    this.authors = Array.isArray(data.authors) ? data.authors : (data.authors || []);
    this.authorsRaw = data.authorsRaw || "";
    this.year = data.year || null;
    this.origin = data.origin || null;
    this.status = data.status || null;
    this.iterationId = data.iterationId || null;
    this.criteriaId = data.criteriaId || null;
    this.tags = Array.isArray(data.tags) ? data.tags : (data.tags || []);
    this.visited = !!data.visited;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.history = Array.isArray(data.history) ? data.history : (data.history || []);
  }


  // --- Citation helpers (wire-up happens elsewhere) ---
  // Note: these formatters are best-effort and intentionally lightweight.
  // They are meant to be used by UI helpers like "Download Citations".
  _firstAuthorLastName() {
    const a = (this.authors && this.authors[0]) ? String(this.authors[0]) : (this.authorsRaw || "");
    const cleaned = a.replace(/\s+et\s+al\.?/i, "").trim();
    const parts = cleaned.split(/[\s,]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]+/gi, "") : "paper";
  }

  _bibKey() {
    const y = this.year ? String(this.year) : "n.d.";
    return `${this._firstAuthorLastName()}${y}`.replace(/[^a-zA-Z0-9]+/g, "");
  }

  toBibTeX() {
    const key = this._bibKey() || "paper";
    const title = (this.title || "").replace(/[{}]/g, "");
    const year = this.year ? String(this.year) : "";
    const author = Array.isArray(this.authors) && this.authors.length
      ? this.authors.join(" and ")
      : (this.authorsRaw || "");
    const url = this.url || "";
    return [
      `@article{${key},`,
      `  title={${title}},`,
      author ? `  author={${author}},` : null,
      year ? `  year={${year}},` : null,
      url ? `  url={${url}},` : null,
      `}`
    ].filter(Boolean).join("\n");
  }

  toAPA() {
    const author = Array.isArray(this.authors) && this.authors.length ? this.authors.join(", ") : (this.authorsRaw || "Autor");
    const year = this.year ? `(${this.year}).` : "(s.d.).";
    const title = this.title ? `${this.title}.` : "Título.";
    const url = this.url ? ` ${this.url}` : "";
    return `${author} ${year} ${title}${url}`.trim();
  }

  toABNT() {
    // ABNT: SOBRENOME, Prenomes. Título. Ano. Disponível em: URL.
    const author = Array.isArray(this.authors) && this.authors.length ? this.authors[0] : (this.authorsRaw || "AUTOR");
    const year = this.year ? String(this.year) : "s.d.";
    const title = this.title || "Título";
    const url = this.url ? ` Disponível em: ${this.url}.` : "";
    return `${author}. ${title}. ${year}.${url}`.trim();
  }

  toEndNoteRIS() {
    // Minimal RIS (works for EndNote/Zotero/Mendeley imports)
    const lines = [
      "TY  - JOUR",
      this.title ? `TI  - ${this.title}` : null,
      this.year ? `PY  - ${this.year}` : null,
      this.url ? `UR  - ${this.url}` : null,
    ];
    if (Array.isArray(this.authors)) {
      for (const a of this.authors) lines.push(`AU  - ${a}`);
    } else if (this.authorsRaw) {
      lines.push(`AU  - ${this.authorsRaw}`);
    }
    lines.push("ER  - ");
    return lines.filter(Boolean).join("\n");
  }


  toJSON() {
    return {
      id: this.id,
      url: this.url,
      title: this.title,
      authors: this.authors,
      authorsRaw: this.authorsRaw,
      year: this.year,
      origin: this.origin,
      status: this.status,
      iterationId: this.iterationId,
      criteriaId: this.criteriaId,
      tags: this.tags,
      visited: this.visited,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      history: this.history,
    };
  }
}

class Project {
  constructor(name, projectDir, data = null) {
    this.name = name;
    this.projectDir = projectDir;
    if (data && typeof data === 'object') {
      this.project = data;
      this.papers = Array.isArray(data.papers) ? data.papers : [];
    } else {
      this.project = { papers: [] };
      this.papers = [];
    }
  }

  addPaper(paperData) {
    const p = paperData instanceof Paper ? paperData : new Paper(paperData);
    this.papers.push(p.toJSON());
    this.project.papers = this.papers;
  }

  toJSON() {
    return this.project;
  }

  static fromJSON(name, projectDir, json) {
    return new Project(name, projectDir, json);
  }
}

export { Project, Paper };
