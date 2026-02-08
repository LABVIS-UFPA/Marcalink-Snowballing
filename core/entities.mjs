import { checkArray, slugify, mapToJSON } from "./utils.mjs";

class Project {
  // Default project schema (matches ui/projects.html form)
  static defaults = {
    description: "",
    researchers: [],
    objective: "",
    criteria: "",
    categorias: [],
    criterios: [],
    fases: [],
    isCurrent: false,
    color: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    papers: [],
  };

  constructor(id, projectDir, data = null) {
    this.id = id;
    this.projectDir = projectDir;

    Object.assign(this, Project.defaults, data);

    if (data && typeof data === 'object') {
      // Merge provided data over defaults
      this.papers = checkArray(this.papers).map(p => Paper.fromJSON(p));
      this.categorias = checkArray(this.categorias).map(c => Categoria.fromJSON(c));
      this.criterios = checkArray(this.criterios).map(c => Criterio.fromJSON(c));
      this.fases = checkArray(this.fases).map(f => Fase.fromJSON(f));
    } else {
      Object.assign(this, Project.defaults);
      this.papers = [];
      this.categorias = [];
      this.criterios = [];
      this.fases = [];
    }
  }

  addPaper(paperData) {
    const p = paperData instanceof Paper ? paperData : Paper.fromJSON(paperData);
    this.papers.push(p);
  }

  toJSON() {
    // Keep project up-to-date with papers
    // const obj = {}
    const obj = Object.fromEntries(
      Object.entries(this).filter(([key]) => key in Project.defaults)
    );

    obj.papers = mapToJSON(this.papers);
    obj.categorias = mapToJSON(this.categorias);
    obj.criterios = mapToJSON(this.criterios);
    obj.fases = mapToJSON(this.fases);
    obj.updatedAt = new Date().toISOString();
    return obj;
  }

  static fromJSON(name, projectDir, json) {
    return new Project(name, projectDir, json);
  }
}


class Paper {
  constructor(data = {}) {
    this.id = data.id || null;
    this.url = data.url || "";
    this.title = data.title || "";
    this.authors = checkArray(data.authors);
    this.authorsRaw = data.authorsRaw || "";
    this.year = data.year || null;
    this.origin = data.origin || null;
    this.status = data.status || null;
    this.iterationId = data.iterationId || null;
    this.criteriaId = data.criteriaId || null;
    this.tags = checkArray(data.tags);
    this.visited = !!data.visited;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.history = checkArray(data.history);
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

  static fromJSON(data = {}) {
    return new Paper(data);
  }
}



class Categoria {
  constructor(data = {}) {
    this.titulo = data.titulo || "";
    this.rotulo = data.rotulo || slugify(this.titulo);
    this.descricao = data.descricao || "";
    this.cor = data.cor || null;
    this.fases = checkArray(data.fases);
    const criterios = data.criterios && typeof data.criterios === "object" ? data.criterios : {};
    this.criterios = {
      pelos_menos_um: checkArray(criterios.pelos_menos_um),
      todos: checkArray(criterios.todos),
    };
  }

  toJSON() {
    return {
      titulo: this.titulo,
      rotulo: this.rotulo,
      descricao: this.descricao,
      cor: this.cor,
      fases: this.fases,
      criterios: {
        pelos_menos_um: this.criterios.pelos_menos_um,
        todos: this.criterios.todos,
      },
    };
  }

  static fromJSON(data = {}) {
    return new Categoria(data);
  }
}

class Criterio {
  constructor(data = {}) {
    this.titulo = data.titulo || "";
    this.rotulo = data.rotulo || slugify(this.titulo);
    this.descricao = data.descricao || "";
    this.fases = checkArray(data.fases);
  }

  toJSON() {
    return {
      titulo: this.titulo,
      rotulo: this.rotulo,
      descricao: this.descricao,
      fases: this.fases,
    };
  }

  static fromJSON(data = {}) {
    return new Criterio(data);
  }
}

class Fase {
  constructor(data = {}) {
    this.titulo = data.titulo || "";
    this.rotulo = data.rotulo || slugify(this.titulo);
    this.descricao = data.descricao || "";
    this.concluida = !!data.concluida;
    this.categorias = checkArray(data.categorias);
    this.criterios = checkArray(data.criterios);
    const papers = data.papers && typeof data.papers === "object" ? data.papers : {};
    this.papers = {
      herdados: checkArray(papers.herdados),
      novos: checkArray(papers.novos),
      removidos: checkArray(papers.removidos),
      selecionados: checkArray(papers.selecionados),
    };
  }

  toJSON() {
    return {
      rotulo: this.rotulo,
      titulo: this.titulo,
      descricao: this.descricao,
      concluida: this.concluida,
      categorias: this.categorias,
      criterios: this.criterios,
      papers: {
        herdados: this.papers.herdados,
        novos: this.papers.novos,
        removidos: this.papers.removidos,
        selecionados: this.papers.selecionados,
      },
    };
  }

  static fromJSON(data = {}) {
    return new Fase(data);
  }
}

export { Project, Paper, Categoria, Criterio, Fase };
