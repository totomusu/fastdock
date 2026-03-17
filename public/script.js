'use strict';

/* ── State ── */
let containers = [];
let servers = [];
let currentBaseUrl = '';
let currentContainerId = null;
let currentSort = localStorage.getItem('containerSort') || 'started';
let currentColumns = parseInt(localStorage.getItem('gridColumns'), 10);
if (!Number.isFinite(currentColumns)) currentColumns = (window.innerWidth <= 640 ? 1 : 3);
if (window.innerWidth <= 640 && currentColumns > 2) currentColumns = 1;

/* ── DOM refs ── */
const grid          = () => document.getElementById('containerGrid');
const serverSel     = () => document.getElementById('serverSelector');

/* ══════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════ */
function showNotification(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'notification' + (isError ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'notif-out 0.2s ease forwards';
    setTimeout(() => el.remove(), 200);
  }, 3000);
}

/* ══════════════════════════════════════════════
   CONTAINERS – fetch & render
══════════════════════════════════════════════ */
async function fetchContainers() {
  const g = grid();
  g.innerHTML = '<div class="state-message">Loading…</div>';
  try {
    const url = currentBaseUrl ? `${currentBaseUrl}/api/containers` : '/api/containers';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Invalid response');

    containers = data.map(c => ({
      id:         c.Id   || c.id,
      name:       (c.Names && c.Names[0].replace(/^\//, '')) || c.name,
      state:      c.State  || c.state,
      status:     c.Status || c.status,
      serverName: c.serverName || null,
    }));

    sortContainers(false);
    await renderContainers();
  } catch (err) {
    console.error(err);
    showNotification('Error fetching containers: ' + err.message, true);
    grid().innerHTML = '<div class="state-message">Failed to load containers.</div>';
  }
}

async function renderContainers(showServer = false) {
  const g = grid();
  const settings = await loadContainerSettings();

  if (!containers.length) {
    g.innerHTML = '<div class="state-message">No containers found.</div>';
    return;
  }

  g.innerHTML = '';

  containers.forEach(c => {
    if (!c || !c.id || !c.name) return;

    const cs    = settings[c.id] || {};
    const name  = cs.customName || c.name;
    const icon  = cs.iconPath   || null;
    const isRun = c.state === 'running';

    const card = document.createElement('div');
    card.className = 'container-card';
    card.dataset.id = c.id;
    card.dataset.name = name;

    /* edit button */
    const editBtn = document.createElement('button');
    editBtn.className = 'card-edit-btn';
    editBtn.title = 'Edit';
    editBtn.type = 'button';
    editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>`;
    editBtn.onclick = () => openEditModal(c.id, name);

    /* status dot */
    const dot = document.createElement('div');
    const dotState = isRun ? 'running' : (c.state === 'paused' ? 'paused' : c.state === 'restarting' ? 'restarting' : 'stopped');
    dot.className = `card-status-dot ${dotState}`;

    /* icon */
    const iconWrap = document.createElement('div');
    iconWrap.className = 'card-icon';
    if (icon) {
      const img = document.createElement('img');
      img.src = icon;
      img.alt = name;
      iconWrap.appendChild(img);
    } else {
      iconWrap.innerHTML = `<svg class="card-icon-placeholder" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`;
    }

    /* name */
    const nameEl = document.createElement('div');
    nameEl.className = 'card-name';
    nameEl.textContent = name;

    /* server label */
    const serverEl = document.createElement('div');
    serverEl.className = 'card-server';
    serverEl.textContent = c.serverName || 'Local';

    /* status text */
    const statusEl = document.createElement('div');
    statusEl.className = 'card-status-text';
    statusEl.textContent = c.status || c.state || '—';

    /* action button */
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `card-btn ${isRun ? 'stop' : 'start'}`;
    btn.innerHTML = isRun
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stop`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Start`;
    btn.onclick = () => toggleContainer(c.id, isRun);

    card.appendChild(editBtn);
    card.appendChild(dot);
    card.appendChild(iconWrap);
    card.appendChild(nameEl);
    if (showServer) card.appendChild(serverEl);
    card.appendChild(statusEl);
    card.appendChild(btn);
    g.appendChild(card);
  });
}

async function toggleContainer(id, isRunning) {
  const card = document.querySelector(`[data-id="${id}"]`);
  if (!card) return;
  const btn  = card.querySelector('.card-btn');
  const dot  = card.querySelector('.card-status-dot');
  const name = card.dataset.name;

  btn.disabled = true;

  try {
    const ep  = isRunning ? 'stop' : 'start';
    const url = currentBaseUrl
      ? `${currentBaseUrl}/api/containers/${id}/${ep}`
      : `/api/containers/${id}/${ep}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error('Request failed');

    const idx = containers.findIndex(c => c.id === id);
    if (idx !== -1) {
      containers[idx].state  = isRunning ? 'stopped' : 'running';
      containers[idx].status = isRunning ? 'Stopped'  : 'Up';
    }

    const nowRunning = !isRunning;
    btn.className = `card-btn ${nowRunning ? 'stop' : 'start'}`;
    btn.innerHTML = nowRunning
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stop`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> Start`;

    dot.className = `card-status-dot ${nowRunning ? 'running' : 'stopped'}`;
    card.querySelector('.card-status-text').textContent = nowRunning ? 'Up' : 'Stopped';

    btn.onclick = () => toggleContainer(id, nowRunning);
    showNotification(`"${name}" ${nowRunning ? 'started' : 'stopped'}`);
  } catch (err) {
    showNotification(`Failed to ${isRunning ? 'stop' : 'start'} "${name}"`, true);
  } finally {
    btn.disabled = false;
  }
}

/* ── Settings ── */
async function loadContainerSettings() {
  try {
    const res = await fetch('/api/containers/settings');
    return await res.json();
  } catch { return {}; }
}

/* ══════════════════════════════════════════════
   SORT
══════════════════════════════════════════════ */
function sortContainers(andRender = true) {
  containers.sort((a, b) => {
    const ar = a.state === 'running';
    const br = b.state === 'running';
    if (currentSort === 'started') return (br - ar);
    return (ar - br);
  });
  updateSortBtn();
  if (andRender) renderContainers();
}

function updateSortBtn() {
  const lbl = document.getElementById('sortLabel');
  if (lbl) lbl.textContent = currentSort === 'started' ? 'Running first' : 'Stopped first';
}

/* ══════════════════════════════════════════════
   COLUMNS
══════════════════════════════════════════════ */
function applyColumns() {
  const g = grid();
  g.classList.remove('cols-1','cols-2','cols-3','cols-4');
  g.classList.add(`cols-${currentColumns}`);
  const lbl = document.getElementById('columnsLabel');
  if (lbl) lbl.textContent = `${currentColumns} col${currentColumns > 1 ? 's' : ''}`;
  localStorage.setItem('gridColumns', currentColumns);
}

function cycleColumns() {
  const mobile = window.innerWidth <= 640;
  currentColumns = mobile
    ? (currentColumns === 1 ? 2 : 1)
    : (currentColumns >= 4 ? 1 : currentColumns + 1);
  applyColumns();
}

/* ══════════════════════════════════════════════
   SERVERS
══════════════════════════════════════════════ */
async function loadServerSettings() {
  try {
    const res  = await fetch('/api/app-settings');
    const data = await res.json();
    servers = data.servers || [];
    updateServerSelector();
  } catch (e) { console.error(e); }
}

function updateServerSelector() {
  const sel = serverSel();
  sel.innerHTML = '<option value="local">Local</option>';
  servers.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = s.name;
    sel.appendChild(o);
  });
  if (servers.length) {
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'All servers';
    sel.appendChild(all);
  }
}

function buildServerUrl(s) {
  try {
    const raw = String(s.address || '').trim();
    if (!raw) return null;
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const parsed = new URL(withScheme);
    const port = parseInt(s.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname;
    return `http://${host}:${port}`;
  } catch { return null; }
}

async function handleServerChange(val) {
  const editBtn   = document.getElementById('editServerBtn');
  const deleteBtn = document.getElementById('deleteServerBtn');
  editBtn.style.display   = 'none';
  deleteBtn.style.display = 'none';

  if (val === 'all') {
    const all = [];
    try {
      const localRes = await fetch('/api/containers');
      if (localRes.ok) {
        const lc = await localRes.json();
        all.push(...lc.map(c => ({ ...c, serverName: 'Local' })));
      }
    } catch {}
    for (const s of servers) {
      const base = buildServerUrl(s);
      if (!base) continue;
      try {
        const r = await fetch(`${base}/api/containers`);
        if (r.ok) {
          const rc = await r.json();
          all.push(...rc.map(c => ({ ...c, serverName: s.name })));
        }
      } catch {}
    }
    containers = all;
    renderContainers(true);
  } else if (val === 'local') {
    currentBaseUrl = '';
    fetchContainers();
  } else {
    const s = servers[parseInt(val)];
    const base = buildServerUrl(s);
    if (!base) { showNotification('Invalid server address', true); return; }
    currentBaseUrl = base;
    editBtn.style.display   = 'flex';
    deleteBtn.style.display = 'flex';
    fetchContainers();
  }
}

/* ══════════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════════ */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
}

/* ══════════════════════════════════════════════
   EDIT CONTAINER MODAL
══════════════════════════════════════════════ */
function openEditModal(id, name) {
  currentContainerId = id;
  document.getElementById('nameInput').value = name;
  document.getElementById('iconSearch').value = '';
  document.getElementById('searchResults').innerHTML = '';

  /* update preview thumb */
  const thumb = document.getElementById('iconPreviewThumb');
  thumb.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-3)"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>`;

  openModal('editContainerModal');
}

document.getElementById('iconInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const allowed = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'];
  if (!allowed.includes(file.type)) {
    showNotification('Only image files allowed', true);
    e.target.value = '';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showNotification('File must be under 2 MB', true);
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const thumb = document.getElementById('iconPreviewThumb');
    thumb.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('editContainerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData();
  const iconFile = document.getElementById('iconInput').files[0];
  const newName  = document.getElementById('nameInput').value;
  if (iconFile) formData.append('icon', iconFile);
  formData.append('name', newName);
  try {
    const res = await fetch(`/api/containers/settings/${currentContainerId}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error();
    showNotification('Container updated');
    closeModal('editContainerModal');
    fetchContainers();
  } catch {
    showNotification('Error saving settings', true);
  }
});

/* icon search */
document.getElementById('searchIconBtn').addEventListener('click', searchIcon);
document.getElementById('iconSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); searchIcon(); }
});

async function searchIcon() {
  const q = document.getElementById('iconSearch').value.trim();
  const res = document.getElementById('searchResults');
  if (!q) { res.innerHTML = ''; return; }
  res.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:4px 0;">Searching…</div>';
  try {
    const r = await fetch(`/api/search-icon/${encodeURIComponent(q)}`);
    const icons = await r.json();
    if (!icons.length) { res.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:4px 0;">No results</div>'; return; }
    res.innerHTML = '';
    icons.forEach(icon => {
      const div = document.createElement('div');
      div.className = 'icon-result-item';
      const img = document.createElement('img');
      img.src = icon.url;
      img.alt = icon.format;
      const span = document.createElement('span');
      span.textContent = icon.format + (icon.variant !== 'default' ? ` (${icon.variant})` : '');
      div.appendChild(img);
      div.appendChild(span);
      div.addEventListener('click', () => selectIcon(icon.url, div));
      res.appendChild(div);
    });
  } catch {
    showNotification('Error searching icons', true);
    res.innerHTML = '';
  }
}

async function selectIcon(url, el) {
  document.querySelectorAll('.icon-result-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  try {
    const res = await fetch('/api/download-icon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, containerId: currentContainerId }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    /* update preview */
    document.getElementById('iconPreviewThumb').innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;">`;
    showNotification('Icon updated');
    fetchContainers();
  } catch {
    showNotification('Error downloading icon', true);
  }
}

/* ══════════════════════════════════════════════
   ADD SERVER MODAL
══════════════════════════════════════════════ */
document.getElementById('addServerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    name:    document.getElementById('serverName').value,
    address: document.getElementById('serverAddress').value,
    port:    document.getElementById('serverPort').value,
  };
  try {
    const res = await fetch('/api/app-settings/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
    const result = await res.json();
    servers = result.servers;
    updateServerSelector();
    closeModal('addServerModal');
    document.getElementById('addServerForm').reset();
    showNotification('Server added');
  } catch {
    showNotification('Error adding server', true);
  }
});

/* ══════════════════════════════════════════════
   EDIT SERVER MODAL
══════════════════════════════════════════════ */
function openEditServerModal() {
  const idx = serverSel().value;
  if (idx === 'local') return;
  const s = servers[parseInt(idx)];
  document.getElementById('editServerName').value    = s.name;
  document.getElementById('editServerAddress').value = s.address;
  document.getElementById('editServerPort').value    = s.port;
  openModal('editServerModal');
}

document.getElementById('editServerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const idx = serverSel().value;
  if (idx === 'local') return;
  const data = {
    name:    document.getElementById('editServerName').value,
    address: document.getElementById('editServerAddress').value,
    port:    document.getElementById('editServerPort').value,
  };
  try {
    const res = await fetch(`/api/app-settings/servers/${idx}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
    const result = await res.json();
    servers = result.servers;
    updateServerSelector();
    closeModal('editServerModal');
    showNotification('Server updated');
  } catch {
    showNotification('Error updating server', true);
  }
});

/* ══════════════════════════════════════════════
   DELETE SERVER
══════════════════════════════════════════════ */
async function deleteCurrentServer() {
  const idx = serverSel().value;
  if (idx === 'local') return;
  if (!confirm('Delete this server?')) return;
  try {
    const res = await fetch(`/api/app-settings/servers/${idx}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showNotification('Server deleted');
    setTimeout(() => window.location.reload(), 500);
  } catch {
    showNotification('Error deleting server', true);
  }
}

/* ══════════════════════════════════════════════
   BIND EVENTS & INIT
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* server selector */
  serverSel().addEventListener('change', e => handleServerChange(e.target.value));

  /* topbar buttons */
  document.getElementById('addServerBtn').addEventListener('click',    () => openModal('addServerModal'));
  document.getElementById('editServerBtn').addEventListener('click',   openEditServerModal);
  document.getElementById('deleteServerBtn').addEventListener('click', deleteCurrentServer);

  /* modal close buttons */
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  /* close on overlay click */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  /* sort */
  document.getElementById('sortBtn').addEventListener('click', () => {
    currentSort = currentSort === 'started' ? 'stopped' : 'started';
    localStorage.setItem('containerSort', currentSort);
    sortContainers();
  });

  /* columns */
  document.getElementById('columnsBtn').addEventListener('click', cycleColumns);

  /* responsive */
  window.addEventListener('resize', () => {
    const mobile = window.innerWidth <= 640;
    if (mobile && currentColumns > 2) { currentColumns = 1; applyColumns(); }
    else if (!mobile && currentColumns === 1) { currentColumns = 3; applyColumns(); }
  });

  /* init */
  updateSortBtn();
  applyColumns();
  loadServerSettings();
  fetchContainers();
});
