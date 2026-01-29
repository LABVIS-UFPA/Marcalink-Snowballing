import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { storage } from "./infrastructure/storage.mjs";
import { Project } from "./core/entities.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`✅ WebSocket rodando em ws://localhost:${PORT}`);

// Initialize storage with Node.js base directory
const baseDir = path.join(__dirname, "user_data");
await storage.init(baseDir);

wss.on("connection", (ws) => {
  console.log("🔌 Cliente conectou!");

  // mensagem inicial
  ws.send(JSON.stringify({ act: "connected", status: "ok", message: "Connection established" }));

  // recebe mensagens do client (espera JSON com um atributo principal: "act")
  ws.on("message", async (msg) => {
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

    if(messageHandler[act] instanceof Function) {
      const response = await messageHandler[act](payload.payload);
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
  "new_project": async (payload) => {
    return verifyName(payload) || projectManager.createProject(payload.name);
  },
  "open_project": async (payload) => {
    return verifyName(payload) || projectManager.openProject(payload.name);
  },
  "list_project": async () => {
    return { act: "list_project", payload: projectManager.listProjects() };
  },
  "delete_project": async (payload) => {
    return verifyName(payload) || projectManager.deleteProject(payload.name);
  },
  "archive_project": async (payload) => {
    return verifyName(payload) || projectManager.archiveProject(payload.name);
  },
  "save_paper": async (payload) => {
    return await storage.savePaper(payload.projectName, payload.paperId, payload.data);
  },
  "load_paper": async (payload) => {
    return await storage.loadPaper(payload.projectName, payload.paperId);
  },
  "delete_paper": async (payload) => {
    return await storage.deletePaper(payload.projectName, payload.paperId);
  },
  "list_papers": async (payload) => {
    return await storage.listPapers(payload.projectName);
  },
  "save_project": async (payload) => {
    return await storage.saveProject(payload.projectName, payload.data);
  },
  "load_project": async (payload) => {
    return await storage.loadProject(payload.projectName);
  },
  "storage_get": async (payload) => {
    const result = await storage.get(payload.keys);
    return { status: "ok", data: result };
  },
  "storage_set": async (payload) => {
    return await storage.set(payload.items);
  },
};

function verifyNameSanitized(projectName) {
  if (!projectName || !/^[a-zA-Z0-9._-]+$/.test(projectName)) {
    return { status: "error", message: "Invalid project name. Use only letters, numbers, dots, underscores, and hyphens." };
  }
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

    // carrega ou cria o json de configuração usando storage
    const cfg = storage.strategy.readJson("config.json");
    if (!cfg) {
      this.config = { projects: [] };
      storage.strategy.writeJson("config.json", this.config);
      console.log(`⚙️ Configuração criada: ${path.join(baseDir, "config.json")}`);
    } else {
      this.config = cfg;
    }
  }

  saveConfig() {
    storage.strategy.writeJson("config.json", this.config);
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
    // load project data from storage if exists
    const rel = path.join(projectName, "project.json");
    const data = storage.strategy.readJson(rel) || { papers: [] };
    this.activeProject = Project.fromJSON(projectName, path.join(this.baseDir, projectName), data);
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
    const error = verifyNameSanitized(projectName);
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
      // initialize empty project file
      storage.strategy.writeJson(path.join(projectName, "project.json"), { papers: [] });
    } else {
      console.log(`📁 Projeto já existe, reativando: ${projectName}`);
      message = "Project reactivated.";
    }

    this.activeProject = Project.fromJSON(projectName, projectDir, storage.strategy.readJson(path.join(projectName, "project.json")) || { papers: [] });
    this.config.projects.push({ name: projectName });
    this.saveConfig();
    
    return { status: "ok", message, project: projectName };
  }
}

// instancia o gerenciador agora que as classes estão definidas
const projectManager = new ProjectManager(path.join(__dirname, "user_data"));
