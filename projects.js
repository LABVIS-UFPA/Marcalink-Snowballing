document.addEventListener('DOMContentLoaded', () => {
  const newProjectName = document.getElementById('newProjectName');
  const addProjectBtn = document.getElementById('addProjectBtn');
  const projectList = document.getElementById('projectList');

  function placeholder() {
    projectList.innerHTML = '';
    const li = document.createElement('li');
    li.style.opacity = '0.8';
    li.innerHTML = '<div class="left"><div class="title">Nenhum projeto encontrado</div></div>';
    projectList.appendChild(li);
  }

  function makeProjectItem(p) {
    const li = document.createElement('li');
    li.dataset.id = p.id || '';

    const left = document.createElement('div');
    left.className = 'left';

    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.style.background = p.color || 'transparent';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = p.name || '—';

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = p.id ? `id: ${p.id}` : '';

    left.appendChild(pill);
    left.appendChild(title);
    left.appendChild(sub);

    const right = document.createElement('div');
    right.className = 'right';

    const btnRename = document.createElement('button');
    btnRename.textContent = 'Renomear';
    btnRename.addEventListener('click', async () => {
      const newName = prompt('Novo nome do projeto', p.name || '');
      if (!newName) return;
      // callback placeholder — integrar com backend mais tarde
      chrome.runtime?.sendMessage?.({ action: 'projects.rename', id: p.id, name: newName });
      title.textContent = newName;
    });

    const btnSet = document.createElement('button');
    btnSet.textContent = p.isCurrent ? 'Atual' : 'Marcar atual';
    btnSet.classList.toggle('dark', !!p.isCurrent);
    btnSet.addEventListener('click', () => {
      // callback placeholder
      chrome.runtime?.sendMessage?.({ action: 'projects.setCurrent', id: p.id });
      // visual
      Array.from(projectList.querySelectorAll('li')).forEach((n) => n.querySelector('button.dark')?.classList.remove('dark'));
      btnSet.classList.add('dark');
      btnSet.textContent = 'Atual';
    });

    const btnRemove = document.createElement('button');
    btnRemove.textContent = 'Remover';
    btnRemove.addEventListener('click', () => {
      if (!confirm(`Remover o projeto "${p.name}"?`)) return;
      chrome.runtime?.sendMessage?.({ action: 'projects.remove', id: p.id });
      li.remove();
      if (!projectList.children.length) placeholder();
    });

    right.appendChild(btnRename);
    right.appendChild(btnSet);
    right.appendChild(btnRemove);

    li.appendChild(left);
    li.appendChild(right);
    return li;
  }

  addProjectBtn.addEventListener('click', () => {
    const name = (newProjectName.value || '').trim();
    if (!name) return alert('Informe um nome para o projeto.');

    // gerar id temporário; backend validará/substituirá depois
    const id = `p_${Date.now().toString(36)}`;
    const p = { id, name, isCurrent: false };

    // callback placeholder — integrar com backend mais tarde
    chrome.runtime?.sendMessage?.({ action: 'projects.create', project: p });

    // render otimista
    if (projectList.querySelector('.title') && projectList.children.length === 1 && projectList.children[0].textContent.includes('Nenhum projeto')) {
      projectList.innerHTML = '';
    }
    projectList.appendChild(makeProjectItem(p));
    newProjectName.value = '';
  });

  // inicializa lista (espera backend no futuro)
  chrome.runtime?.sendMessage?.({ action: 'projects.list' }, (resp) => {
    const items = (resp && resp.projects) ? resp.projects : [];
    projectList.innerHTML = '';
    if (!items.length) return placeholder();
    for (const it of items) projectList.appendChild(makeProjectItem(it));
  });

  // safety: se extensão não responder, mostra placeholder
  setTimeout(() => {
    if (!projectList.children.length) placeholder();
  }, 250);
});
