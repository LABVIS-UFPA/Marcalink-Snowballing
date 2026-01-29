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
    return verifyName(payload) || await storage.saveProject(payload.name, { papers: [] });
  },
  "open_project": async (payload) => {
    return verifyName(payload) || await storage.loadProject(payload.name);
  },
  "list_project": async () => {
    return { act: "list_project", payload: await storage.listProjects() };
  },
  "delete_project": async (payload) => {
    return verifyName(payload) || await storage.deleteProject(payload.name);
  },
  "archive_project": async (payload) => {
    return verifyName(payload) || await storage.archiveProject(payload.name);
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
