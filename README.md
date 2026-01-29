# Marcalink Snowballing
Plugin do Chrome para marcação de links — auxilia no processo de snowballing de artigos no Google Acadêmico.

---

## Novidades (atualização)
- ✅ **Página de _Meus projetos_ separada**: a interface de projetos foi movida para uma página dedicada:
  - `projects.html`, `projects.js` (apenas frontend + callbacks placeholder)
  - **Removido** o painel/entrada `Meus projetos` das `Configurações` (`options.html`).
- ✅ **Dashboard**: o link **Abrir Dashboard** foi removido das `Configurações` e permanece disponível apenas no **popup**.

> Nota: todas as alterações feitas foram apenas no frontend; os callbacks disparam mensagens via `chrome.runtime.sendMessage` e aguardam integração com o storage/backend.

---

## Mensagens (API frontend — stubs)
Os handlers em `projects.js` emitem as seguintes ações (implemente no background/storage):

- `projects.list` — responde `{ projects: [...] }`
- `projects.create` — payload `{ project: { id, name, ... } }`
- `projects.rename` — payload `{ id, name }`
- `projects.remove` — payload `{ id }`
- `projects.setCurrent` — payload `{ id }`

---

## Como testar rapidamente
1. Recarregue a extensão em `chrome://extensions` (modo desenvolvedor).  
2. Abra o popup e clique em **Meus projetos** — deve abrir a aba `projects.html`.  
3. Na página `projects.html` teste: criar / renomear / remover / marcar como atual — observe mensagens no console da extensão.

---

## Próximos passos sugeridos
- Integrar os stubs ao storage (`infrastructure/storage.mjs`).  
- Sincronizar lista entre `options.html` e `projects.html` via eventos/storage listeners.  
- Adicionar testes para o fluxo de projetos (unit + e2e).

---

Licença: veja o arquivo `LICENSE`.
