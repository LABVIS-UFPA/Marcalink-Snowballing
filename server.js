const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`✅ WebSocket rodando em ws://localhost:${PORT}`);

wss.on("connection", (ws) => {
  console.log("🔌 Cliente conectou!");

  // mensagem inicial
  ws.send(JSON.stringify({ act: "connected", status: "ok", message: "Connection established" }));

  // recebe mensagens do client (espera JSON com um atributo principal: "act")
  ws.on("message", (msg) => {
    const text = msg.toString();
    console.log("📩 Recebido:", text);

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      ws.send(JSON.stringify({ act: "error", status: "error", message: "Invalid JSON" }));
      return;
    }

    const act = payload.act;
    if (!act) {
      ws.send(JSON.stringify({ act: "error", status: "error", message: "Missing act attribute" }));
      return;
    }

    // const sanitize = (n) => (typeof n === "string" ? n.replace(/[^a-zA-Z0-9._-]/g, "_") : "");
    // const projectName = sanitize(payload.name || payload.projectName || payload.project || "");
    // const respond = (obj) => ws.send(JSON.stringify(obj));

    if(messageHandler[act] instanceof Function) {
      const response = messageHandler[act](payload.payload);
      if (response) {
        ws.send(JSON.stringify(response));
      }
    }else{
      ws.send(JSON.stringify({ act: "unknown", status: "error", message: "Unknown act" }));
      console.warn(`⚠️ Ação desconhecida recebida: ${act}`);
    }
    
  });

  ws.on("close", () => {
    console.log("❌ Cliente desconectou.");
  });
});

function verifyName(payload) {
  if (!payload || !payload.name){
    return { status: "error", message: "Missing project name. Please provide a name with variable 'name'." };
  }else if(!/^[a-zA-Z0-9._-]+$/.test(payload.name)){
    return { status: "error", message: "Invalid project name. Use only letters, numbers, dots, underscores, and hyphens." };
  }else{
    payload.name = payload.name.trim();
    if (payload.name.length === 0){
      return { status: "error", message: "Project name cannot be empty." };
    }
  }
}
const messageHandler = {
  "new_project": (payload) => {
    return verifyName(payload) || projectManager.createProject(payload.name);
  },
  "open_project": (payload) => {
    return verifyName(payload) || projectManager.openProject(payload.name);
  },
  "list_project": () => {
    return { act: "list_project", payload: projectManager.listProjects() };
  },
  "delete_project": (payload) => {
    return verifyName(payload) || projectManager.deleteProject(payload.name);
  },
  "archive_project": (payload) => {
    return verifyName(payload) || projectManager.archiveProject(payload.name);
  },
}


class ProjectManager {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.activeProject = null;

    // cria a pasta base se não existir
    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
        console.log(`📁 Pasta criada: ${baseDir}`);
      } else {
        console.log(`📁 Pasta existe: ${baseDir}`);
      }
    } catch (err) {
      console.error("Erro ao criar/verificar pasta user_data:", err);
      process.exit(1);
    }

    //cria o json de configuração se não existir
    const configPath = path.join(baseDir, "config.json"); 
    if (!fs.existsSync(configPath)) {
      this.config = { projects: [] };
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
      console.log(`⚙️ Configuração criada: ${configPath}`);
    } else {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        this.config = JSON.parse(raw);
      } catch (err) {
        this.config = { projects: [] };
        console.warn(`⚠️ Falha ao ler config.json, recriando: ${err.message}`);
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
      }
    }
  }

  saveConfig() {
    const configPath = path.join(this.baseDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf8');
  }

  // retorna lista de projetos conhecidos
  listProjects() {
    return (this.config && Array.isArray(this.config.projects)) ? this.config.projects.map(p => p.name) : [];
  }

  openProject(projectName) {
    const project = this.config.projects.find(p => p.name === projectName);
    if (!project) {
      return { status: "error", message: "Project not found in config." };
    }
    this.activeProject = new Project(projectName, path.join(this.baseDir, projectName));
    return { status: "ok", message: `Project ${projectName} opened.` };
  }

  removeFromConfig(projectName) {
    if (!this.config || !Array.isArray(this.config.projects)) return;
    if (!this.config.projects.some(p => p.name === projectName)) return { status: "error", message: "Project not found" };
    this.config.projects = this.config.projects.filter(p => p.name !== projectName);
    this.saveConfig();
  }

  deleteProject(projectName) {
    const error =  this.removeFromConfig(projectName);
    if (error) return error;

    // Se o projeto existir remove toda a pasta do projeto
    const projectDir = path.join(this.baseDir, projectName);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
      console.log(`🗑️ Projeto removido: ${projectName}`);
      return { status: "ok", message: "Project removed." };
    } else {
      return { status: "ok", message: "Project not found." };
    }
  }

  archiveProject(projectName) {
    return this.removeFromConfig(projectName) || { status: "ok", message: "Project archived." } ;
  }

  createProject(projectName) {
    //Verifica se o nome do projeto está sanitizado, senão retorna erro
    projectName = projectName.trim();
    const error = verifyName({ name: projectName });
    if (error) return error;


    //Verifica se o projeto está na lista de projetos
    const existingProject = this.config.projects.find(p => p.name === projectName);
    if (existingProject) {
      return { status: "error", message: "Project already exists." };
    }

    //Verifica se o projeto já existe, caso exista reativa o projeto
    const projectDir = path.join(this.baseDir, projectName);
    let message = "";
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir);
      console.log(`📁 Projeto criado: ${projectName}`);
      message = "Project created.";
    } else {
      console.log(`📁 Projeto já existe, reativando: ${projectName}`);
      message = "Project reactivated.";
    };
    
    
    this.activeProject = new Project(projectName, projectDir);
    this.config.projects.push({ name: projectName });
    this.saveConfig();
    
    return { status: "ok", message, project: projectName };
  }
}

class Project{
  constructor(name, projectDir){
    this.projectDir = projectDir;
    this.name = name;
    this.papers = [];

    // cria o json do projeto se não existir
    const projectPath = path.join(projectDir, "project.json"); 
    if (!fs.existsSync(projectPath)) {
      this.project = { papers: [] };
      fs.writeFileSync(projectPath, JSON.stringify(this.project, null, 2), 'utf8');
      console.log(`🗂️ Projeto criado: ${projectPath}`);
    } else {
      try {
        const raw = fs.readFileSync(projectPath, 'utf8');
        this.project = JSON.parse(raw);
      } catch (err) {
        this.project = { papers: [] };
        console.warn(`⚠️ Falha ao ler project.json, recriando: ${err.message}`);
        fs.writeFileSync(projectPath, JSON.stringify(this.project, null, 2), 'utf8');
      }
    }
  }
}

// instancia o gerenciador agora que as classes estão definidas
const projectManager = new ProjectManager(path.join(__dirname, "user_data"));