document.addEventListener('DOMContentLoaded', () => {
  const filterInput = document.getElementById('newProjectName');
  const openCreateBtn = document.getElementById('openCreateBtn');
  const createSidenav = document.getElementById('createSidenav');
  const createConfirmBtn = document.getElementById('createProjectConfirmBtn');
  const cancelCreateBtn = document.getElementById('cancelCreateBtn');
  const projectNameInput = document.getElementById('projectName');
  const projectDescriptionInput = document.getElementById('projectDescription');
  const projectResearchersInput = document.getElementById('projectResearchers');
  const projectObjectiveInput = document.getElementById('projectObjective');
  const projectCriteriaInput = document.getElementById('projectCriteria');
  const projectList = document.getElementById('projectList');
  const workarea = document.querySelector('.workarea');

  let projects = [];

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
      // update local
      p.name = newName;
      title.textContent = newName;
      // callback placeholder
      chrome.runtime?.sendMessage?.({ action: 'projects.rename', id: p.id, name: newName });
    });

    const btnSet = document.createElement('button');
    btnSet.textContent = p.isCurrent ? 'Atual' : 'Marcar atual';
    btnSet.classList.toggle('dark', !!p.isCurrent);
    btnSet.addEventListener('click', () => {
      // update local state
      projects.forEach((pr) => (pr.isCurrent = pr.id === p.id));
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
      // remove local
      projects = projects.filter((x) => x.id !== p.id);
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

  function renderProjects(filter = '') {
    const q = (filter || '').toLowerCase();
    projectList.innerHTML = '';
    const items = projects.filter((p) => {
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) || (p.id || '').toLowerCase().includes(q);
    });
    if (!items.length) return placeholder();
    for (const it of items) projectList.appendChild(makeProjectItem(it));
  }

  function slugifyName(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `p_${Date.now().toString(36)}`;
  }

  function ensureUniqueId(base) {
    let id = base;
    let i = 1;
    while (projects.some((p) => p.id === id)) {
      id = `${base}_${i++}`;
    }
    return id;
  }

  function openSidenav() {
    createSidenav.classList.add('open');
    workarea.classList.add('shiftRight');
    createSidenav.setAttribute('aria-hidden', 'false');
  }

  function closeSidenav() {
    createSidenav.classList.remove('open');
    workarea.classList.remove('shiftRight');
    createSidenav.setAttribute('aria-hidden', 'true');
    // clear
    projectNameInput.value = '';
    projectDescriptionInput.value = '';
    projectResearchersInput.value = '';
    projectObjectiveInput.value = '';
    projectCriteriaInput.value = '';
  }

  openCreateBtn.addEventListener('click', () => {
    openSidenav();
  });

  cancelCreateBtn.addEventListener('click', () => {
    closeSidenav();
  });

  createConfirmBtn.addEventListener('click', () => {
    const name = (projectNameInput.value || '').trim();
    const desc = (projectDescriptionInput.value || '').trim();
    const researchers = (projectResearchersInput.value || '').trim();
    if (!name) return alert('O nome do projeto é obrigatório.');
    if (!desc) return alert('A descrição é obrigatória.');
    if (!researchers) return alert('Informe ao menos um pesquisador.');

    const baseId = slugifyName(name);
    const id = ensureUniqueId(baseId);

    const p = {
      id,
      name,
      description: desc,
      researchers: researchers.split(',').map((s) => s.trim()).filter(Boolean),
      objective: (projectObjectiveInput.value || '').trim(),
      criteria: (projectCriteriaInput.value || '').trim(),
      isCurrent: false,
    };

    projects.push(p);
    chrome.runtime?.sendMessage?.({ action: 'projects.create', project: p });
    renderProjects(filterInput.value || '');
    closeSidenav();
  });

  filterInput.addEventListener('input', () => renderProjects(filterInput.value || ''));

  // initial safety placeholder
  setTimeout(() => {
    if (!projects.length) placeholder();
  }, 150);

  // Optionally, load from backend when integrated:
  /* chrome.runtime?.sendMessage?.({ action: 'projects.list' }, (resp) => {
    const items = (resp && resp.projects) ? resp.projects : [];
    projects = items;
    renderProjects();
  }); */
});
