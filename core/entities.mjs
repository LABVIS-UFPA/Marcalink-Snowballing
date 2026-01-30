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
