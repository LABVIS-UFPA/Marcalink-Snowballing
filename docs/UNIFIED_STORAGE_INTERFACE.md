# Unified Storage Interface - get/set Methods

## Overview

Os métodos `get()` e `set()` agora funcionam de forma uniforme em todo o sistema, quer seja Node.js ou browser, com suporte opcional a WebSocket.

## Mudanças Realizadas

### 1. NodeFsStrategy - get/set para config.json

**get(keys)** - Lê dados do config.json
```javascript
await storage.get(["server_url", "server_port"])
// Retorna: { server_url: "ws://localhost", server_port: "8080" }
```

**set(items)** - Mescla dados no config.json
```javascript
await storage.set({ server_status: "Conectado" })
// Mescla em config.json e salva
```

### 2. WebSocketStrategy - Envia via WebSocket

**get(keys)** - Envia `storage_get` ao servidor
```javascript
// No browser, envia: { act: "storage_get", payload: { keys } }
// Servidor responde com os dados do config.json
```

**set(items)** - Envia `storage_set` ao servidor
```javascript
// No browser, envia: { act: "storage_set", payload: { items } }
// Servidor mescla no config.json
```

### 3. StorageService - Interface Unificada

```javascript
// Funciona em ambos os ambientes:
const data = await storage.get(["key1", "key2"]);
await storage.set({ key1: "value1" });
```

Prioridades:
1. Se `chrome.storage` existe e é browser → usar nativo `chrome.storage.local`
2. Senão → usar strategy (NodeFsStrategy ou WebSocketStrategy)

### 4. Server.mjs - Handlers Novos

Adicionados handlers para `storage_get` e `storage_set`:

```javascript
"storage_get": async (payload) => {
  const result = await storage.get(payload.keys);
  return { status: "ok", data: result };
},
"storage_set": async (payload) => {
  return await storage.set(payload.items);
}
```

## Fluxo de Dados

### Browser para Server (via WebSocket)

```
browser: storage.get(["key"])
    ↓
WebSocketStrategy.get(keys)
    ↓
wsManager.send({ act: "storage_get", payload: { keys } })
    ↓
server: messageHandler["storage_get"]
    ↓
NodeFsStrategy.get(keys) → lê config.json
    ↓
Retorna apenas chaves solicitadas
    ↓
ws.send(response)
```

### Browser para Server (set)

```
browser: storage.set({ server_status: "ok" })
    ↓
WebSocketStrategy.set(items)
    ↓
wsManager.send({ act: "storage_set", payload: { items } })
    ↓
server: messageHandler["storage_set"]
    ↓
NodeFsStrategy.set(items) → mescla em config.json
    ↓
ws.send(response)
```

### Server Local (no browser)

```
server: storage.get/set()
    ↓
NodeFsStrategy.get/set() (direto, sem WebSocket)
    ↓
Lê/escreve config.json via fs
```

## Estrutura de config.json

O `config.json` agora armazena dados gerais, não apenas projetos:

```json
{
  "projects": ["Project1", "Project2"],
  "server_url": "ws://localhost",
  "server_port": "8080",
  "server_status": "Conectado",
  "server_messages": [...]
}
```

## Backward Compatibility

- Código antigo que usa `storage.get()` e `storage.set()` continua funcionando
- Em browsers com `chrome.storage`, comportamento original é mantido
- Novos métodos CRUD (saveProject, savePaper) coexistem com get/set
