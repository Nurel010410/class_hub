const API_BASE = '/api';
const PROJECTS_ENDPOINT = `${API_BASE}/getProjects`;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[character]));
}

function getProjectValue(project, camelCase, snakeCase, fallback = '') {
  return project?.[camelCase] ?? project?.[snakeCase] ?? fallback;
}

async function fetchProjects() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(PROJECTS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    if (payload?.status === 'error') {
      throw new Error(payload.error || 'API returned an error');
    }

    const projects = Array.isArray(payload) ? payload : payload?.data ?? payload?.projects;
    if (!Array.isArray(projects)) throw new Error('Некорректный формат ответа API');

    return projects;
  } finally {
    clearTimeout(timeoutId);
  }
}

function renderProjects(projects, container = document.querySelector('#projectsList')) {
  if (!container) return;
  if (!Array.isArray(projects) || projects.length === 0) {
    container.innerHTML = '<div class="projects-empty">📭 Активных проектов пока нет.</div>';
    return;
  }

  container.innerHTML = projects.map(project => {
    const id = getProjectValue(project, 'projectId', 'project_id');
    const name = getProjectValue(project, 'projectName', 'project_name', 'Без названия');
    const leader = String(getProjectValue(project, 'leaderTelegramId', 'leader_tg')).replace(/^@/, '');
    const max = Number(getProjectValue(project, 'maxCapacity', 'max_capacity', 0));
    const current = Number(getProjectValue(project, 'currentCount', 'current_count', 0));
    const available = Number(getProjectValue(project, 'availableSpots', 'available_spots', Math.max(0, max - current)));
    const deadline = getProjectValue(project, 'deadline', 'deadline', '—');
    const leaderMarkup = leader
      ? `<a href="https://t.me/${encodeURIComponent(leader)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(leader)}</a>`
      : '—';

    return `<article class="project-card">
      <div class="project-card__top"><h3>${escapeHtml(name)}</h3><span>${escapeHtml(getProjectValue(project, 'subject', 'subject', '—'))}</span></div>
      <p><strong>Лидер:</strong> ${leaderMarkup}</p>
      <p><strong>Дедлайн:</strong> ${escapeHtml(deadline)}</p>
      <p><strong>Места:</strong> ${available}/${max}</p>
      <button class="project-card__join" type="button" data-project-id="${escapeHtml(id)}">Подать заявку</button>
    </article>`;
  }).join('');
}

async function loadProjects() {
  const container = document.querySelector('#projectsList');
  try {
    if (container) container.setAttribute('aria-busy', 'true');
    renderProjects(await fetchProjects(), container);
  } catch (error) {
    console.error('Ошибка загрузки проектов:', error);
    if (container) container.innerHTML = '<div class="projects-error">Не удалось загрузить проекты. Попробуйте ещё раз.</div>';
  } finally {
    if (container) container.removeAttribute('aria-busy');
  }
}

window.fetchProjects = fetchProjects;
window.renderProjects = renderProjects;
window.loadProjects = loadProjects;
