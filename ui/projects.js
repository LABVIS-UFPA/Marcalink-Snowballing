import { storage } from '../infrastructure/storage.mjs';
import { slugify } from '../core/utils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  const filterInput = document.getElementById('newProjectName');
  const openCreateBtn = document.getElementById('openCreateBtn');
  const createSidenav = document.getElementById('createSidenav');
  const createSidenavTitle = createSidenav && createSidenav.querySelector('h2');
  const createConfirmBtn = document.getElementById('createProjectConfirmBtn');
  const cancelCreateBtn = document.getElementById('cancelCreateBtn');
  const projectNameInput = document.getElementById('projectName');
  const projectDescriptionInput = document.getElementById('projectDescription');
  const projectResearchersInput = document.getElementById('projectResearchers');
  const projectObjectiveInput = document.getElementById('projectObjective');
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
    btnRename.textContent = 'Editar';
    btnRename.addEventListener('click', async () => {
      // Open sidenav in edit mode with project data
      const project = await storage.loadProject(p.id);
      openEditSidenav(project);
    });

    const btnSet = document.createElement('button');
    btnSet.textContent = p.active ? 'Ver' : 'Abrir';
    btnSet.addEventListener('click', async () => {
      // Ask storage to open the project (sets active project) and navigate to dashboard
      try {
        await storage.openProject(p.id);
        window.location.href = 'dashboard.html';
      } catch (e) {
        console.warn('openProject failed', e);
        alert('Falha ao abrir o projeto. Veja console.');
      }
    });

    const btnRemove = document.createElement('button');
    btnRemove.textContent = 'Arquivar';
    btnRemove.addEventListener('click', async () => {
      if (!confirm(`Arquivar o projeto "${p.name}"?`)) return;
      // remove local from list
      projects = projects.filter((x) => x.id !== p.id);
      try { await storage.archiveProject(p.id); } catch (e) { console.warn('archiveProject failed', e); }
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

  // Open the create/edit sidenav prefilled with project data
  let editMode = false;
  let editingProjectID = null;
  function openEditSidenav(project) {
    editMode = true;
    editingProjectID = project.id;
    projectNameInput.value = project.name || '';
    projectDescriptionInput.value = project.description || '';
    projectResearchersInput.value = (project.researchers || []).join(', ');
    projectObjectiveInput.value = project.objective || '';
    createConfirmBtn.textContent = 'Salvar';
    if (createSidenavTitle) createSidenavTitle.textContent = 'Edite o projeto';
    openSidenav();
  }

  // Open the create sidenav with cleared fields and proper labels
  function openCreateSidenav() {
    editMode = false;
    editingProjectID = null;
    // clear inputs
    projectNameInput.value = '';
    projectDescriptionInput.value = '';
    projectResearchersInput.value = '';
    projectObjectiveInput.value = '';
    createConfirmBtn.textContent = 'Criar projeto';
    if (createSidenavTitle) createSidenavTitle.textContent = 'Criar projeto';
    openSidenav();
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
  }

  openCreateBtn.addEventListener('click', () => {
    openCreateSidenav();
  });

  cancelCreateBtn.addEventListener('click', () => {
    closeSidenav();
  });

  createConfirmBtn.addEventListener('click', () => {
    (async () => {
      const name = (projectNameInput.value || '').trim();
    const desc = (projectDescriptionInput.value || '').trim();
    const researchers = (projectResearchersInput.value || '').trim();
    if (!name) return alert('O nome do projeto é obrigatório.');
    if (!desc) return alert('A descrição é obrigatória.');
    if (!researchers) return alert('Informe ao menos um pesquisador.');

    const objective = (projectObjectiveInput.value || '').trim();

    try {
      if (editMode && editingProjectID) {
        // Update existing project
        const idx = projects.findIndex((pr) => pr.id === editingProjectID);
        if (idx !== -1) {
          const p = projects[idx];
          p.name = name;
          p.description = desc;
          p.researchers = researchers.split(',').map((s) => s.trim()).filter(Boolean);
          p.objective = objective;
          await storage.saveProject(p.id, p);
          // renderProjects(filterInput.value || '');
        }
      } else {
        // Create new project
        const baseId = slugify(name, {
          separator: '_',
          fallback: () => `p_${Date.now().toString(36)}`,
        });
        const id = ensureUniqueId(baseId);
        const p = {
          id,
          name,
          description: desc,
          researchers: researchers.split(',').map((s) => s.trim()).filter(Boolean),
          objective,
          isCurrent: false,
        };
        await storage.saveProject(p.id, p);
        projects.push(p);
        // renderProjects(filterInput.value || '');
      }
      
      // reset edit mode and UI
      editMode = false;
      editingProjectID = null;
      createConfirmBtn.textContent = 'Criar projeto';
      closeSidenav();
      loadFromStorage();
    } catch (e) {
      console.warn('saveProject failed', e);
      alert('Falha ao salvar o projeto. Veja console.');
    }
    })();
  });

  filterInput.addEventListener('input', () => renderProjects(filterInput.value || ''));

  // initial safety placeholder
  setTimeout(() => {
    if (!projects.length) placeholder();
  }, 6000);

  // Load projects from storage
  async function loadFromStorage() {
    try {
      projects = await storage.listProjects();
      renderProjects(filterInput.value || '');
    } catch (e) {
      console.warn('Failed to load projects from storage', e);
    }
  }
  loadFromStorage();
});
