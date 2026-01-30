# Storage Isomórfico - Documentação

## Visão Geral

O `storage.mjs` é um serviço isomórfico que funciona tanto no Node.js quanto no browser (plugin do Chrome). Usa o padrão **Strategy** para abstrair as diferenças entre os ambientes.

## Padrão Strategy

### Estratégias Disponíveis

#### 1. **NodeFsStrategy** - Para Node.js
- Persiste dados via `fs` (file system)
- Salva arquivos JSON em diretórios
- Usada automaticamente quando o código roda em Node.js

#### 2. **WebSocketStrategy** - Para Browser/Plugin
- Comunica com o servidor via WebSocket
- Importa `socketManager.mjs` dinamicamente
- Envia/recebe requisições através do `wsManager`

## Detecção de Ambiente

O serviço detecta automaticamente o ambiente:

```javascript
this.isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
```

## Imports Dinâmicos

Os imports são feitos dinamicamente no método `init()` para evitar carregar módulos desnecessários:

```javascript
// Node.js
const fsModule = await import('fs');
const pathModule = await import('path');

// Browser
const { wsManager } = await import('./socketManager.mjs');
```

## Métodos CRUD

### Para Projects

```javascript
await storage.saveProject(projectName, projectData);
await storage.loadProject(projectName);
await storage.deleteProject(projectName);
await storage.listProjects();
```

### Para Papers

```javascript
await storage.savePaper(projectName, paperId, paperData);
await storage.loadPaper(projectName, paperId);
await storage.deletePaper(projectName, paperId);
await storage.listPapers(projectName);
```

### Legacy (Backward Compatibility)

```javascript
await storage.get(keys);        // chrome.storage.local.get
await storage.set(items);       // chrome.storage.local.set
```

## Estrutura de Arquivos (Node.js)

```
user_data/
├── config.json
├── ProjectName1/
│   ├── project.json
│   └── papers/
│       ├── paper_id_1.json
│       └── paper_id_2.json
└── ProjectName2/
    ├── project.json
    └── papers/
        └── paper_id_1.json
```

## Uso no Server

```javascript
import { storage } from "./infrastructure/storage.mjs";

// Inicializar com base directory
await storage.init(path.join(__dirname, "user_data"));

// Usar CRUD methods
const result = await storage.saveProject("MyProject", { papers: [] });
```

## Uso no Plugin

```javascript
import { storage } from "./infrastructure/storage.mjs";

// Inicializar (sem baseDir para browser)
await storage.init();

// Os métodos usarão WebSocket automaticamente
const result = await storage.loadProject("MyProject");
```

## Endpoints WebSocket no Server

O servidor aceita os seguintes `act`s para operações de storage:

- `save_project` - Salvar projeto
- `load_project` - Carregar projeto
- `save_paper` - Salvar paper
- `load_paper` - Carregar paper
- `delete_paper` - Deletar paper
- `list_papers` - Listar papers de um projeto

## Benefícios

✅ **Isomorfismo**: Mesmo código funciona em Node.js e browser
✅ **Imports Dinâmicos**: Evita carregar módulos desnecessários
✅ **Padrão Strategy**: Fácil adicionar novos drivers
✅ **Backward Compatible**: Mantém suporte a `chrome.storage`
✅ **CRUD Unificado**: Interface única para persistência
