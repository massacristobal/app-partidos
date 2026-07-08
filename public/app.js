// APP Partidos — frontend
const $ = sel => document.querySelector(sel);
const POS_LABEL = { arquero: '🧤 Arquero', defensa: '🛡️ Defensa', medio: '⚙️ Medio', delantero: '🎯 Delantero' };
const POS_ICON = { arquero: '🧤', defensa: '🛡️', medio: '⚙️', delantero: '🎯' };
const FOOT_LABEL = { derecho: '🦶 Derecho', izquierdo: '🦶 Izquierdo', ambos: '🦶 Ambos' };
const TEAM_COLORS = [
  ['#d32f2f', 'Rojo'], ['#1a4fa0', 'Azul'], ['#1b5e20', 'Verde'], ['#f9a825', 'Amarillo'],
  ['#ef6c00', 'Naranjo'], ['#6a1b9a', 'Morado'], ['#212121', 'Negro'], ['#eeeeee', 'Blanco']
];
const mapsLink = place => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place);

let token = localStorage.getItem('token');
let me = null;
const cardOpen = {};      // estado abierto/cerrado por partido
let historyOpen = false;  // sección historial

// ---------- API ----------
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error del servidor');
  return data;
}

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.background = isError ? 'var(--red)' : 'var(--text)';
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function playerTag(p) {
  return `${esc(p.displayName)}${p.isGuest ? ' <span class="pill blue">invitado</span>' : ''}`;
}

// ---------- Auth ----------
document.querySelectorAll('[data-authtab]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('[data-authtab]').forEach(b => b.classList.toggle('active', b === btn));
    $('#loginForm').classList.toggle('hidden', btn.dataset.authtab !== 'login');
    $('#registerForm').classList.toggle('hidden', btn.dataset.authtab !== 'register');
    $('#authError').textContent = '';
  };
});

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const data = await api('/login', 'POST', { email: $('#loginUser').value, password: $('#loginPass').value });
    token = data.token; localStorage.setItem('token', token);
    await boot();
  } catch (err) { $('#authError').textContent = err.message; }
};

$('#registerForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const data = await api('/register', 'POST', {
      firstName: $('#regFirst').value, lastName: $('#regLast').value,
      email: $('#regEmail').value, password: $('#regPass').value,
      position: $('#regPosition').value, foot: $('#regFoot').value
    });
    token = data.token; localStorage.setItem('token', token);
    await boot();
  } catch (err) { $('#authError').textContent = err.message; }
};

$('#logoutBtn').onclick = async () => {
  try { await api('/logout', 'POST'); } catch {}
  token = null; localStorage.removeItem('token');
  location.reload();
};

// ---------- Navegación ----------
document.querySelectorAll('.navbtn').forEach(btn => {
  btn.onclick = () => showView(btn.dataset.view);
});
function showView(view) {
  document.querySelectorAll('.navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  ({
    home: renderHome, matches: renderMatches, newmatch: renderNewMatch,
    groups: renderGroups, friends: renderFriends, ranking: renderRanking,
    profile: renderProfile, admin: renderAdmin
  })[view]();
}

// ---------- Inicio ----------
async function renderHome() {
  const el = $('#view-home');
  let matchesData, friendsData, groupsData;
  try {
    [matchesData, friendsData, groupsData] = await Promise.all([api('/matches'), api('/friends'), api('/groups')]);
  } catch (err) { return toast(err.message, true); }
  const matches = matchesData.matches;
  const upcoming = matches.filter(m => !m.result);
  const played = matches.filter(m => m.result).slice(0, 3);

  const resultCard = m => {
    const tn = m.teams ? {
      nameA: m.teams.nameA || 'Equipo A', nameB: m.teams.nameB || 'Equipo B',
      colorA: m.teams.colorA || '#1b5e20', colorB: m.teams.colorB || '#1a4fa0'
    } : { nameA: 'Equipo A', nameB: 'Equipo B', colorA: '#1b5e20', colorB: '#1a4fa0' };
    return `
    <div class="card resultcard" data-goto="matches">
      <p class="muted" style="margin-bottom:6px">${esc(m.title)}</p>
      <div class="row" style="justify-content:space-around;text-align:center">
        <div><span class="cdot" style="background:${tn.colorA}"></span> ${esc(tn.nameA)}<div class="bigscore">${m.result.scoreA}</div></div>
        <span class="muted">vs</span>
        <div><span class="cdot" style="background:${tn.colorB}"></span> ${esc(tn.nameB)}<div class="bigscore">${m.result.scoreB}</div></div>
      </div>
      ${m.result.mvp && m.teams ? `<p class="muted" style="text-align:center;margin-top:4px">🏅 MVP: ${esc(([...m.teams.A, ...m.teams.B].find(p => p.id === m.result.mvp) || {}).name || '')}</p>` : ''}
    </div>`;
  };

  el.innerHTML = `
    <h2 class="hello">¡Hola, ${esc(me.displayName.split(/\s+/)[0])}! 👋</h2>
    <p class="muted" style="margin-bottom:14px">Arma equipos parejos con tus amigos</p>
    <div class="statgrid">
      <div class="stat" data-goto="friends"><span class="stat-ico">👥</span><div class="stat-n">${friendsData.friends.length}</div><div class="muted">Amigos</div></div>
      <div class="stat" data-goto="groups"><span class="stat-ico">🏟️</span><div class="stat-n">${groupsData.groups.length}</div><div class="muted">Grupos</div></div>
      <div class="stat" data-goto="matches"><span class="stat-ico">📅</span><div class="stat-n">${upcoming.length}</div><div class="muted">Por jugar</div></div>
    </div>
    <div class="cta" id="homeCreate">
      <div><strong>Crear partido</strong><br><span style="opacity:.85">Selecciona jugadores y arma los equipos</span></div>
      <span class="cta-plus">＋</span>
    </div>
    ${friendsData.pendingIn.length ? `
      <h3 class="hsec">👋 Solicitudes de amistad</h3>
      ${friendsData.pendingIn.map(p => `
        <div class="card">
          <div class="row between">
            <span><strong>${esc(p.displayName)}</strong> <span class="muted">@${esc(p.username)}</span> quiere ser tu amigo</span>
            <span class="row">
              <button class="btn small primary" data-haccept="${p.friendshipId}">Aceptar</button>
              <button class="btn small danger" data-hreject="${p.friendshipId}">Rechazar</button>
            </span>
          </div>
        </div>`).join('')}` : ''}
    ${upcoming.length ? `
      <h3 class="hsec">📅 Próximos partidos</h3>
      ${upcoming.slice(0, 3).map(m => `
        <div class="card resultcard" data-goto="matches">
          <div class="row between">
            <strong>${esc(m.title)}</strong>
            <span class="pill">${m.players.length}/${m.perSide * 2} jugadores</span>
          </div>
          <p class="muted" style="margin-top:4px">
            ${m.date ? '🗓️ ' + esc(m.date.replace('T', ' ')) + ' · ' : ''}${m.place ? '📍 ' + esc(m.place) : ''}
            ${m.costPerPerson ? ' · 💰 $' + m.costPerPerson + ' p/p' : ''}
          </p>
        </div>`).join('')}` : ''}
    ${played.length ? `<h3 class="hsec">🏆 Últimos resultados</h3>${played.map(resultCard).join('')}` : ''}`;

  $('#homeCreate').onclick = () => showView('newmatch');
  el.querySelectorAll('[data-goto]').forEach(x => x.onclick = () => showView(x.dataset.goto));
  el.querySelectorAll('[data-haccept]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    try { await api('/friends/respond', 'POST', { friendshipId: b.dataset.haccept, accept: true }); toast('¡Ahora son amigos! ⚽'); renderHome(); }
    catch (err) { toast(err.message, true); }
  });
  el.querySelectorAll('[data-hreject]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    try { await api('/friends/respond', 'POST', { friendshipId: b.dataset.hreject, accept: false }); renderHome(); }
    catch (err) { toast(err.message, true); }
  });
}

// ---------- Nuevo partido ----------
async function renderNewMatch() {
  const el = $('#view-newmatch');
  let friendsData, groupsData, matchesData;
  try {
    [friendsData, groupsData, matchesData] = await Promise.all([api('/friends'), api('/groups'), api('/matches')]);
  } catch (err) { return toast(err.message, true); }
  const friends = friendsData.friends;
  const groups = groupsData.groups;
  // Lugares usados antes, para sugerirlos primero
  const knownPlaces = [...new Set(matchesData.matches.map(m => m.place).filter(Boolean))];
  const selected = new Set();

  el.innerHTML = `
    <p><a href="#" id="nmBack" style="color:var(--green-dark);font-weight:600;text-decoration:none">← Volver</a></p>
    <h2 class="hello" style="margin-bottom:12px">Nuevo partido</h2>
    <div class="card">
      <form id="nmForm" onsubmit="return false">
        <input id="nmTitle" placeholder="Título (ej: Pichanga del viernes)" value="Partido entre amigos">
        <div class="row">
          <input id="nmDate" type="datetime-local" style="flex:1;min-width:170px">
          <select id="nmPerSide" style="flex:1">
            ${[3,4,5,6,7,8,9,10,11].map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} vs ${n}</option>`).join('')}
          </select>
        </div>
        <div style="position:relative">
          <input id="nmPlace" placeholder="Lugar (escribe para buscar 📍)" autocomplete="off">
          <div id="nmPlaceSug" class="suggestions hidden"></div>
        </div>
        <div class="row">
          <input id="nmCost" type="number" min="0" placeholder="💰 Valor por persona ($)" style="flex:1">
          <select id="nmGroup" style="flex:1">
            <option value="">Sin grupo</option>
            ${groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}
          </select>
        </div>
      </form>
    </div>
    <div class="card">
      <div class="row between"><h2>Selecciona jugadores</h2><span class="muted" id="nmCount">0 elegidos</span></div>
      <div id="nmPlayers"></div>
    </div>
    <button class="btn primary" id="nmCreate" style="width:100%;padding:14px;font-size:16px">⚽ Crear partido</button>`;

  $('#nmBack').onclick = e => { e.preventDefault(); showView('matches'); };

  // Lista de jugadores seleccionables (amigos + miembros del grupo elegido)
  function candidates() {
    const pool = [...friends];
    const gid = $('#nmGroup').value;
    if (gid) {
      const g = groups.find(x => x.id === gid);
      if (g) g.members.forEach(gm => { if (gm.id !== me.id && !pool.some(p => p.id === gm.id)) pool.push(gm); });
    }
    return pool;
  }
  function renderPlayerList() {
    const pool = candidates();
    [...selected].forEach(id => { if (!pool.some(p => p.id === id)) selected.delete(id); });
    $('#nmPlayers').innerHTML = pool.length ? pool.map(p => `
      <div class="selrow ${selected.has(p.id) ? 'on' : ''}" data-sel="${p.id}">
        <span class="selmark">${selected.has(p.id) ? '✓' : POS_ICON[p.position] || '·'}</span>
        <div>
          <strong>${esc(p.displayName)}</strong>${p.isGuest ? ' <span class="pill blue">invitado</span>' : ''}
          <div class="muted">${POS_LABEL[p.position] || p.position} · ⭐ ${p.rating}</div>
        </div>
      </div>`).join('') : '<p class="muted">No tienes amigos aún — agrégalos en la pestaña Amigos.</p>';
    $('#nmCount').textContent = selected.size + ' elegidos';
    el.querySelectorAll('[data-sel]').forEach(row => row.onclick = () => {
      const id = row.dataset.sel;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      renderPlayerList();
    });
  }
  renderPlayerList();
  $('#nmGroup').onchange = renderPlayerList;

  // Autocompletado de lugar: lugares ya usados + OpenStreetMap (se abre en Google Maps)
  const sug = $('#nmPlaceSug');
  let sugTimer = null;
  $('#nmPlace').oninput = () => {
    const q = $('#nmPlace').value.trim();
    clearTimeout(sugTimer);
    if (q.length < 3) { sug.classList.add('hidden'); return; }
    sugTimer = setTimeout(async () => {
      const known = knownPlaces.filter(p => p.toLowerCase().includes(q.toLowerCase())).slice(0, 3);
      let remote = [];
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=4&accept-language=es&q=${encodeURIComponent(q)}`);
        if (r.ok) remote = (await r.json()).map(x => x.display_name);
      } catch {}
      const opts = [...new Set([...known, ...remote])].slice(0, 6);
      if (!opts.length) { sug.classList.add('hidden'); return; }
      sug.innerHTML = opts.map(o => `<div class="sugitem">📍 ${esc(o)}</div>`).join('');
      sug.classList.remove('hidden');
      sug.querySelectorAll('.sugitem').forEach(item => item.onclick = () => {
        $('#nmPlace').value = item.textContent.replace('📍 ', '').trim();
        sug.classList.add('hidden');
      });
    }, 450);
  };
  document.addEventListener('click', e => { if (!sug.contains(e.target) && e.target !== $('#nmPlace')) sug.classList.add('hidden'); }, { once: true });

  $('#nmCreate').onclick = async () => {
    try {
      await api('/matches', 'POST', {
        title: $('#nmTitle').value, place: $('#nmPlace').value, date: $('#nmDate').value,
        perSide: $('#nmPerSide').value, groupId: $('#nmGroup').value || null,
        costPerPerson: $('#nmCost').value || null,
        playerIds: [...selected]
      });
      toast(`Partido creado con ${selected.size + 1} jugadores ⚽`);
      showView('matches');
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- Perfil ----------
async function renderProfile() {
  const el = $('#view-profile');
  el.innerHTML = `
    <div class="card">
      <h2>Mi perfil</h2>
      <form id="profileForm">
        <label>Nombre</label>
        <input id="profName" value="${esc(me.displayName)}">
        <label>Posición</label>
        <select id="profPosition">
          ${Object.entries(POS_LABEL).map(([v, l]) =>
            `<option value="${v}" ${me.position === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <label>Pie hábil</label>
        <select id="profFoot">
          ${Object.entries(FOOT_LABEL).map(([v, l]) =>
            `<option value="${v}" ${(me.foot || 'derecho') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <label>Email ${me.email ? '' : '(agrégalo para entrar con él)'}</label>
        <input id="profEmail" type="email" value="${esc(me.email || '')}" placeholder="tu@correo.com">
        <div class="row between" style="margin-top:10px">
          <span class="pill">⭐ Rating: ${me.rating ?? '-'}</span>
          <span class="pill amber">🏆 Puntos: ${me.points || 0}</span>
        </div>
        <button class="btn primary" style="margin-top:10px">Guardar cambios</button>
      </form>
    </div>
    <div class="card">
      <h2>Cambiar contraseña</h2>
      <form id="passForm">
        <input id="passCurrent" type="password" placeholder="Contraseña actual" autocomplete="current-password" required>
        <input id="passNew" type="password" placeholder="Nueva contraseña (mínimo 4)" autocomplete="new-password" required>
        <button class="btn primary">Cambiar contraseña</button>
      </form>
    </div>`;
  $('#passForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/me/password', 'PUT', { current: $('#passCurrent').value, next: $('#passNew').value });
      toast('Contraseña cambiada ✓');
      $('#passCurrent').value = ''; $('#passNew').value = '';
    } catch (err) { toast(err.message, true); }
  };
  $('#profileForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const data = await api('/me', 'PUT', {
        displayName: $('#profName').value, position: $('#profPosition').value,
        foot: $('#profFoot').value, email: $('#profEmail').value
      });
      me = { ...me, ...data.user };
      $('#userBadge').textContent = me.displayName;
      toast('Perfil guardado ✓');
      renderProfile();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- Administrador ----------
async function renderAdmin() {
  const el = $('#view-admin');
  let usersData = { users: [] };
  try { usersData = await api('/admin/users'); } catch (err) { toast(err.message, true); }
  el.innerHTML = `
    <div class="card">
      <h2>👥 Cuentas registradas (${usersData.users.length})</h2>
      ${usersData.users.map(u => `
        <div class="list-item">
          <span>${playerTag(u)}<br>
            <span class="muted">${u.isGuest ? 'invitado · creado por ' + esc(u.ownerName || '¿?') : esc(u.email || '@' + u.username)}
            ${u.createdAt ? ' · desde ' + new Date(u.createdAt).toLocaleDateString('es-CL') : ''}</span>
          </span>
          <span class="row">
            <span class="pill">${POS_LABEL[u.position] || u.position}</span>
            <span class="pill amber">🏆 ${u.points}</span>
            <button class="btn small" title="Copiar a los formularios de abajo" data-use="${esc(u.isGuest ? u.displayName : (u.email || u.username))}">Usar ↓</button>
          </span>
        </div>`).join('')}
    </div>
    <div class="card">
      <h2>🔑 Resetear contraseña</h2>
      <p class="muted" style="margin-bottom:8px">Para cuando alguien olvida su clave: asígnale una temporal y pídele que la cambie al entrar.</p>
      <form id="resetForm" class="row">
        <input id="resetUser" placeholder="Email o usuario" style="flex:1" required>
        <input id="resetPass" placeholder="Contraseña temporal" style="flex:1" required>
        <button class="btn primary">Resetear</button>
      </form>
    </div>
    <div class="card">
      <h2>🏆 Ajustar puntos</h2>
      <p class="muted" style="margin-bottom:8px">Cuentas por email o usuario; invitados por su nombre.</p>
      <form id="pointsForm" class="row">
        <input id="pointsUser" placeholder="Email, usuario o nombre de invitado" style="flex:1" required>
        <input id="pointsValue" type="number" min="0" placeholder="Puntos" style="width:110px" required>
        <button class="btn primary">Guardar</button>
      </form>
    </div>
    <div class="card">
      <h2>🗑️ Eliminar usuario</h2>
      <p class="muted" style="margin-bottom:8px">Se quita de amigos, grupos y partidos pendientes; sus partidos jugados quedan como historial. No se puede deshacer.</p>
      <form id="deleteUserForm" class="row">
        <input id="deleteUserName" placeholder="Email, usuario o nombre de invitado" style="flex:1" required>
        <button class="btn danger">Eliminar</button>
      </form>
    </div>`;
  el.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
    $('#resetUser').value = b.dataset.use;
    $('#pointsUser').value = b.dataset.use;
    $('#deleteUserName').value = b.dataset.use;
    toast(`"${b.dataset.use}" copiado a los formularios ↓`);
  });
  $('#resetForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/admin/reset-password', 'POST', { username: $('#resetUser').value, newPassword: $('#resetPass').value });
      toast('Contraseña reseteada ✓');
      $('#resetUser').value = ''; $('#resetPass').value = '';
    } catch (err) { toast(err.message, true); }
  };
  $('#pointsForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const r = await api('/admin/set-points', 'POST', { username: $('#pointsUser').value, points: $('#pointsValue').value });
      toast(`${r.user.displayName} ahora tiene ${r.user.points} pts ✓`);
      $('#pointsUser').value = ''; $('#pointsValue').value = '';
    } catch (err) { toast(err.message, true); }
  };
  $('#deleteUserForm').onsubmit = async e => {
    e.preventDefault();
    const who = $('#deleteUserName').value.trim();
    if (!confirm(`¿Eliminar a "${who}"?\nSe quitará de amigos, grupos y partidos pendientes. Esta acción no se puede deshacer.`)) return;
    try {
      const r = await api('/admin/delete-user', 'POST', { username: who });
      toast(`${r.deleted} eliminado 🗑️`);
      $('#deleteUserName').value = '';
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- Amigos ----------
async function renderFriends() {
  const el = $('#view-friends');
  let data;
  try { data = await api('/friends'); } catch (err) { return toast(err.message, true); }
  const { friends, pendingIn, pendingOut } = data;
  el.innerHTML = `
    <div class="card">
      <h2>Buscar jugadores</h2>
      <div class="row">
        <input id="searchInput" placeholder="Buscar por nombre o email..." style="flex:1">
        <button id="searchBtn" class="btn primary">Buscar</button>
      </div>
      <div id="searchResults"></div>
    </div>
    <div class="card">
      <h2>Agregar jugador sin cuenta</h2>
      <p class="muted" style="margin-bottom:8px">Para amigos que aún no tienen la app. Después podrás vincularlo a su cuenta real y conserva sus puntos.</p>
      <form id="guestForm" class="row">
        <input id="guestName" placeholder="Nombre" style="flex:2" required>
        <select id="guestPosition" style="flex:1">
          ${Object.entries(POS_LABEL).map(([v, l]) => `<option value="${v}" ${v === 'medio' ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="btn primary">Agregar</button>
      </form>
    </div>
    ${pendingIn.length ? `<div class="card"><h2>Solicitudes recibidas</h2>
      ${pendingIn.map(p => `
        <div class="list-item"><span>${esc(p.displayName)} <span class="muted">@${esc(p.username)}</span></span>
        <span class="row">
          <button class="btn small primary" data-accept="${p.friendshipId}">Aceptar</button>
          <button class="btn small danger" data-reject="${p.friendshipId}">Rechazar</button>
        </span></div>`).join('')}
    </div>` : ''}
    <div class="card">
      <h2>Mis amigos (${friends.length})</h2>
      ${friends.length ? friends.map(f => `
        <div class="list-item">
          <span>${playerTag(f)} ${!f.isGuest ? `<span class="muted">@${esc(f.username)}</span>` : ''}</span>
          <span class="row">
            <span class="pill">${POS_LABEL[f.position] || f.position}</span>
            <span class="pill">${FOOT_LABEL[f.foot] || '🦶 Derecho'}</span>
            <span class="pill amber">🏆 ${f.points || 0}</span>
            ${f.isGuest && f.ownerId === me.id ? `<button class="btn small" data-link="${f.id}">🔗 Vincular cuenta</button>` : ''}
          </span>
        </div>`).join('') : '<p class="muted">Aún no tienes amigos. ¡Busca jugadores arriba!</p>'}
      ${pendingOut.length ? `<h3>Enviadas (pendientes)</h3>
        ${pendingOut.map(p => `<div class="list-item"><span>${esc(p.displayName)}</span><span class="pill amber">Pendiente</span></div>`).join('')}` : ''}
    </div>`;

  $('#guestForm').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/guests', 'POST', { displayName: $('#guestName').value, position: $('#guestPosition').value });
      toast('Jugador agregado ✓'); renderFriends();
    } catch (err) { toast(err.message, true); }
  };

  $('#searchBtn').onclick = doSearch;
  $('#searchInput').onkeydown = e => { if (e.key === 'Enter') doSearch(); };
  async function doSearch() {
    try {
      const { users } = await api('/users/search?q=' + encodeURIComponent($('#searchInput').value));
      $('#searchResults').innerHTML = users.length ? users.map(u => `
        <div class="list-item"><span>${esc(u.displayName)} <span class="muted">@${esc(u.username)}</span></span>
        <button class="btn small primary" data-add="${u.id}">＋ Agregar</button></div>`).join('')
        : '<p class="muted" style="margin-top:8px">Sin resultados</p>';
      el.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => {
        try { await api('/friends/request', 'POST', { userId: b.dataset.add }); toast('Solicitud enviada ✓'); renderFriends(); }
        catch (err) { toast(err.message, true); }
      });
    } catch (err) { toast(err.message, true); }
  }
  el.querySelectorAll('[data-accept]').forEach(b => b.onclick = async () => {
    try { await api('/friends/respond', 'POST', { friendshipId: b.dataset.accept, accept: true }); toast('¡Ahora son amigos! ⚽'); renderFriends(); }
    catch (err) { toast(err.message, true); }
  });
  el.querySelectorAll('[data-reject]').forEach(b => b.onclick = async () => {
    try { await api('/friends/respond', 'POST', { friendshipId: b.dataset.reject, accept: false }); renderFriends(); }
    catch (err) { toast(err.message, true); }
  });
  el.querySelectorAll('[data-link]').forEach(b => b.onclick = async () => {
    const username = prompt('¿A qué cuenta quieres vincular este jugador?\nEscribe su email o usuario:');
    if (!username) return;
    try {
      const r = await api(`/guests/${b.dataset.link}/link`, 'POST', { username: username.trim() });
      toast(`Vinculado a ${r.linkedTo.displayName} ✓ (puntos transferidos)`);
      renderFriends();
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- Grupos ----------
async function renderGroups() {
  const el = $('#view-groups');
  let groupsData, friendsData;
  try {
    [groupsData, friendsData] = await Promise.all([api('/groups'), api('/friends')]);
  } catch (err) { return toast(err.message, true); }
  const { groups } = groupsData;
  const { friends } = friendsData;

  el.innerHTML = `
    <div class="card">
      <h2>Crear grupo</h2>
      <form id="newGroupForm" class="row">
        <input id="gName" placeholder="Nombre (ej: Los del trabajo)" style="flex:1" required>
        <button class="btn primary">Crear</button>
      </form>
    </div>
    <div class="card">
      <h2>Unirse con código</h2>
      <form id="joinGroupForm" class="row">
        <input id="gCode" placeholder="Código (ej: A3F9C2)" style="flex:1" required>
        <button class="btn primary">Unirse</button>
      </form>
    </div>
    ${groups.length ? groups.map(g => {
      const addable = friends.filter(f => !g.members.some(m => m.id === f.id));
      return `
      <div class="card">
        <div class="row between">
          <h2>${esc(g.name)} ${g.isOwner ? '<span class="pill">admin</span>' : ''}</h2>
          <span class="row"><span class="muted">Código:</span> <span class="code-badge">${esc(g.joinCode)}</span></span>
        </div>
        <div class="row" style="margin-bottom:8px">
          <button class="btn small" data-copylink="${esc(g.joinCode)}">🔗 Copiar enlace</button>
          <button class="btn small" data-showqr="${g.id}" data-code="${esc(g.joinCode)}">📱 Ver QR</button>
        </div>
        <div class="hidden" id="qr-${g.id}" style="text-align:center;margin-bottom:8px"></div>
        <h3>Miembros (${g.members.length})</h3>
        ${g.members.map(m => `
          <div class="list-item">
            <span>${playerTag(m)}</span>
            <span class="row"><span class="pill">${POS_LABEL[m.position] || m.position}</span><span class="pill amber">🏆 ${m.points}</span></span>
          </div>`).join('')}
        ${addable.length ? `
          <div class="row" style="margin-top:10px">
            <select data-groupadd="${g.id}" style="flex:1">
              <option value="">Agregar amigo o invitado...</option>
              ${addable.map(f => `<option value="${f.id}">${esc(f.displayName)}${f.isGuest ? ' (invitado)' : ''}</option>`).join('')}
            </select>
            <button class="btn small primary" data-addbtn="${g.id}">Agregar</button>
          </div>` : ''}
      </div>`;
    }).join('') : '<div class="card"><p class="muted">No estás en ningún grupo. Crea uno o únete con un código.</p></div>'}`;

  $('#newGroupForm').onsubmit = async e => {
    e.preventDefault();
    try { await api('/groups', 'POST', { name: $('#gName').value }); toast('Grupo creado ✓'); renderGroups(); }
    catch (err) { toast(err.message, true); }
  };
  $('#joinGroupForm').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('/groups/join', 'POST', { code: $('#gCode').value }); toast(`Te uniste a ${r.group.name} ⚽`); renderGroups(); }
    catch (err) { toast(err.message, true); }
  };
  el.querySelectorAll('[data-addbtn]').forEach(b => b.onclick = async () => {
    const sel = el.querySelector(`select[data-groupadd="${b.dataset.addbtn}"]`);
    if (!sel.value) return toast('Elige a quién agregar', true);
    try { await api(`/groups/${b.dataset.addbtn}/add`, 'POST', { userId: sel.value }); toast('Agregado al grupo ✓'); renderGroups(); }
    catch (err) { toast(err.message, true); }
  });
  el.querySelectorAll('[data-copylink]').forEach(b => b.onclick = async () => {
    const link = location.origin + '/?join=' + b.dataset.copylink;
    try { await navigator.clipboard.writeText(link); toast('Enlace copiado ✓ Compártelo por WhatsApp'); }
    catch { prompt('Copia este enlace:', link); }
  });
  el.querySelectorAll('[data-showqr]').forEach(b => b.onclick = () => {
    const box = document.getElementById('qr-' + b.dataset.showqr);
    if (!box.classList.toggle('hidden')) {
      const link = location.origin + '/?join=' + b.dataset.code;
      box.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}"
        alt="QR del grupo" width="180" height="180" style="border-radius:8px">
        <p class="muted">Escanea para unirse al grupo</p>`;
    }
  });
}

// ---------- Partidos ----------
async function renderMatches() {
  const el = $('#view-matches');
  let data, friendsData, groupsData;
  try {
    [data, friendsData, groupsData] = await Promise.all([api('/matches'), api('/friends'), api('/groups')]);
  } catch (err) { return toast(err.message, true); }
  const groups = groupsData.groups;

  el.innerHTML = `
    <div class="cta" id="matchesCreate" style="margin-top:0">
      <div><strong>Crear partido</strong><br><span style="opacity:.85">Selecciona jugadores y arma los equipos</span></div>
      <span class="cta-plus">＋</span>
    </div>
    <div id="matchList">
      ${(() => {
        const active = data.matches.filter(m => !m.result);
        const played = data.matches.filter(m => m.result);
        const pendingResult = active.filter(m => m.isCreator && m.teams && m.date &&
          Date.now() > Date.parse(m.date) + 90 * 60000);
        return `
          ${pendingResult.length ? `
          <div class="card warn">
            <h2>⏰ Falta registrar el resultado</h2>
            <p class="muted">${pendingResult.map(m => esc(m.title)).join(', ')} ya ${pendingResult.length > 1 ? 'terminaron' : 'terminó'} — anota el marcador para repartir los puntos.</p>
          </div>` : ''}
          ${active.length ? active.map(m => matchCard(m, friendsData.friends, groups)).join('')
            : '<div class="card"><p class="muted">No hay partidos activos. ¡Crea el primero!</p></div>'}
          ${played.length ? `
            <h2 id="historyToggle" class="mtoggle" style="margin:18px 0 10px;color:var(--green-dark)">${historyOpen ? '▾' : '▸'} 📜 Historial (${played.length})</h2>
            <div id="historyList" class="${historyOpen ? '' : 'hidden'}">
              ${played.map(m => matchCard(m, friendsData.friends, groups)).join('')}
            </div>` : ''}`;
      })()}
    </div>`;

  $('#matchesCreate').onclick = () => showView('newmatch');

  const ht = $('#historyToggle');
  if (ht) ht.onclick = () => {
    historyOpen = !historyOpen;
    $('#historyList').classList.toggle('hidden', !historyOpen);
    ht.innerHTML = ht.innerHTML.replace(historyOpen ? '▸' : '▾', historyOpen ? '▾' : '▸');
  };
  el.querySelectorAll('[data-toggle]').forEach(h => h.onclick = () => {
    const id = h.dataset.toggle;
    const body = document.getElementById('mbody-' + id);
    const nowOpen = body.classList.contains('hidden');
    cardOpen[id] = nowOpen;
    body.classList.toggle('hidden', !nowOpen);
    h.innerHTML = h.innerHTML.replace(nowOpen ? '▸' : '▾', nowOpen ? '▾' : '▸');
  });

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const { action, match: mid } = btn.dataset;
      try {
        if (action === 'invite') {
          const sel = el.querySelector(`select[data-inviter="${mid}"]`);
          if (!sel.value) return toast('Elige a quién invitar', true);
          await api(`/matches/${mid}/invite`, 'POST', { userId: sel.value });
          toast('Invitación enviada ✓');
        } else if (action === 'accept') {
          await api(`/matches/${mid}/respond`, 'POST', { accept: true }); toast('¡Estás dentro! ⚽');
        } else if (action === 'decline') {
          await api(`/matches/${mid}/respond`, 'POST', { accept: false });
        } else if (action === 'teams') {
          await api(`/matches/${mid}/teams`, 'POST'); toast('Equipos generados ⚖️');
        } else if (action === 'move') {
          await api(`/matches/${mid}/move`, 'POST', { playerId: btn.dataset.player });
          toast('Cambio hecho ⇄');
        } else if (action === 'remove') {
          const who = btn.dataset.pname;
          const msg = who ? `¿Sacar a ${who} del partido?` : '¿Bajarte de este partido?';
          if (!confirm(msg)) return;
          await api(`/matches/${mid}/remove`, 'POST', btn.dataset.player ? { userId: btn.dataset.player } : {});
          toast(who ? `${who} fue sacado del partido` : 'Te bajaste del partido 🚪');
        } else if (action === 'editToggle') {
          document.getElementById('editForm-' + mid).classList.toggle('hidden');
          return; // sin recargar la vista
        } else if (action === 'saveedit') {
          await api(`/matches/${mid}`, 'PUT', {
            title: el.querySelector(`input[data-etitle="${mid}"]`).value,
            place: el.querySelector(`input[data-eplace="${mid}"]`).value,
            date: el.querySelector(`input[data-edate="${mid}"]`).value,
            perSide: el.querySelector(`select[data-eperside="${mid}"]`).value,
            costPerPerson: el.querySelector(`input[data-ecost="${mid}"]`).value || null
          });
          toast('Partido actualizado ✓');
        } else if (action === 'teamsinfo') {
          await api(`/matches/${mid}`, 'PUT', {
            teamAName: el.querySelector(`input[data-tna="${mid}"]`).value,
            teamBName: el.querySelector(`input[data-tnb="${mid}"]`).value,
            teamAColor: el.querySelector(`select[data-tca="${mid}"]`).value,
            teamBColor: el.querySelector(`select[data-tcb="${mid}"]`).value
          });
          toast('Equipos actualizados ✓');
        } else if (action === 'del') {
          const finished = btn.dataset.finished === '1';
          const msg = finished
            ? '¿Eliminar este partido del historial?\nSe devolverán los puntos que repartió.'
            : '¿Eliminar este partido?';
          if (!confirm(msg)) return;
          await api(`/matches/${mid}`, 'DELETE');
          toast('Partido eliminado 🗑️');
        } else if (action === 'result') {
          const a = el.querySelector(`input[data-scorea="${mid}"]`).value;
          const b = el.querySelector(`input[data-scoreb="${mid}"]`).value;
          const mvpSel = el.querySelector(`select[data-mvp="${mid}"]`);
          await api(`/matches/${mid}/result`, 'POST', { scoreA: a, scoreB: b, mvpId: mvpSel ? (mvpSel.value || null) : null });
          toast('Resultado registrado 🏆 Puntos repartidos');
        }
        renderMatches();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// Cancha con formación según posiciones de los jugadores
function pitchHTML(teams) {
  const rowsFor = team => {
    const order = ['arquero', 'defensa', 'medio', 'delantero'];
    const byPos = {};
    team.forEach(p => (byPos[p.position || 'medio'] ||= []).push(p));
    // Solo UN jugador al arco: los arqueros extra pasan a la línea de defensa
    if (byPos.arquero && byPos.arquero.length > 1) {
      const extra = byPos.arquero.slice(1);
      byPos.arquero = [byPos.arquero[0]];
      (byPos.defensa ||= []).unshift(...extra);
    }
    return order.filter(pos => byPos[pos]?.length).map(pos => byPos[pos]);
  };
  const dots = (team, side, color) => {
    const rows = rowsFor(team);
    const hasGKRow = rows.length > 0 && rows[0][0].position === 'arquero' && rows[0].length === 1;
    const field = hasGKRow ? rows.slice(1) : rows;
    // Arco en x=7; el resto de las líneas se reparte entre 18 y 44
    const rowX = [];
    if (hasGKRow) rowX.push(7);
    field.forEach((_, r) => rowX.push(field.length === 1 ? 30 : 18 + (26 * r / (field.length - 1))));
    return rows.map((row, r) => {
      let x = rowX[r];
      if (side === 'B') x = 100 - x;
      return row.map((p, i) => {
        const y = 100 * (i + 1) / (row.length + 1);
        const initials = esc(p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
        const firstName = esc(p.name.split(/\s+/)[0]);
        return `<div class="pdot" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%">
          <span class="circle" style="background:${color}">${initials}</span><span class="pname">${firstName}</span>
        </div>`;
      }).join('');
    }).join('');
  };
  return `
    <div class="pitch">
      <div class="area left"></div><div class="area right"></div>
      ${dots(teams.A, 'A', teams.colorA || '#1b5e20')}${dots(teams.B, 'B', teams.colorB || '#1a4fa0')}
    </div>`;
}

function matchCard(m, friends, groups) {
  const myInvite = m.invites.find(i => i.user.id === me.id && i.status === 'pending');
  const group = m.groupId ? groups.find(g => g.id === m.groupId) : null;
  const pool = [...friends];
  if (group) group.members.forEach(gm => { if (!pool.some(p => p.id === gm.id)) pool.push(gm); });
  const invitable = pool.filter(f => f.id !== me.id &&
    !m.players.some(p => p.id === f.id) &&
    !m.invites.some(i => i.user.id === f.id && i.status === 'pending'));

  const lateNoResult = !m.result && m.teams && m.date && Date.now() > Date.parse(m.date) + 90 * 60000;
  const statusPill = m.result
    ? `<span class="pill">Finalizado ${m.result.scoreA} - ${m.result.scoreB}</span>`
    : lateNoResult ? '<span class="pill red">⏰ Falta resultado</span>'
    : m.teams ? '<span class="pill amber">Equipos listos</span>'
    : '<span class="pill">Convocando</span>';
  const spots = m.perSide * 2;
  const open = cardOpen[m.id] ?? !m.result;
  const tn = m.teams ? {
    nameA: m.teams.nameA || 'Equipo A', nameB: m.teams.nameB || 'Equipo B',
    colorA: m.teams.colorA || '#1b5e20', colorB: m.teams.colorB || '#1a4fa0'
  } : null;

  return `
  <div class="card">
    <div class="row between">
      <h2 class="mtoggle" data-toggle="${m.id}">${open ? '▾' : '▸'} ${esc(m.title)} ${statusPill} ${m.groupName ? `<span class="pill blue">${esc(m.groupName)}</span>` : ''}</h2>
      <span class="row">
        <span class="muted">por ${esc(m.creator.displayName)}</span>
        ${m.isCreator && !m.result ? `<button class="btn small" title="Editar partido" data-action="editToggle" data-match="${m.id}">✏️</button>` : ''}
        ${m.isCreator ? `<button class="btn small danger" title="Eliminar partido" data-action="del" data-match="${m.id}" data-finished="${m.result ? 1 : 0}">🗑️</button>` : ''}
      </span>
    </div>
    <p class="muted">
      ${m.place ? `<a href="${mapsLink(m.place)}" target="_blank" rel="noopener" style="color:var(--green-dark)">📍 ${esc(m.place)}</a> · ` : ''}${m.date ? '🗓️ ' + esc(m.date.replace('T', ' ')) + ' · ' : ''}
      ⚽ ${m.perSide} vs ${m.perSide}${m.costPerPerson ? ` · 💰 $${m.costPerPerson} por persona` : ''}
    </p>
    ${m.isCreator && !m.result ? `
    <div class="row hidden" id="editForm-${m.id}" style="margin-top:6px">
      <input data-etitle="${m.id}" value="${esc(m.title)}" placeholder="Título" style="flex:2">
      <input data-eplace="${m.id}" value="${esc(m.place || '')}" placeholder="Lugar" style="flex:1">
      <input data-edate="${m.id}" type="datetime-local" value="${esc(m.date || '')}" style="flex:1">
      <input data-ecost="${m.id}" type="number" min="0" value="${m.costPerPerson || ''}" placeholder="💰 $ p/p" style="width:110px">
      <select data-eperside="${m.id}">
        ${[2,3,4,5,6,7,8,9,10,11].map(n => `<option value="${n}" ${n === m.perSide ? 'selected' : ''}>${n} vs ${n}</option>`).join('')}
      </select>
      <button class="btn small primary" data-action="saveedit" data-match="${m.id}">💾 Guardar</button>
    </div>` : ''}

    <div class="mbody ${open ? '' : 'hidden'}" id="mbody-${m.id}">
    <h3>Jugadores (${m.players.length}/${spots})</h3>
    <div class="row">${m.players.map(p =>
      `<span class="pill">${esc(p.displayName)}${p.isGuest ? ' 👤' : ''} · ${POS_ICON[p.position] || ''} ⭐${p.rating}${
        m.isCreator && !m.result && p.id !== m.creator.id
          ? ` <button class="pillx" title="Sacar del partido" data-action="remove" data-match="${m.id}" data-player="${p.id}" data-pname="${esc(p.displayName)}">✕</button>` : ''
      }</span>`).join(' ')}</div>
    ${!m.isCreator && !m.result && m.players.some(p => p.id === me.id) ? `
      <div class="row" style="margin-top:8px">
        <button class="btn small danger" data-action="remove" data-match="${m.id}">🚪 Me bajo del partido</button>
      </div>` : ''}
    ${m.invites.filter(i => i.status === 'pending').length ?
      `<p class="muted" style="margin-top:6px">Invitados pendientes: ${m.invites.filter(i => i.status === 'pending').map(i => esc(i.user.displayName)).join(', ')}</p>` : ''}

    ${myInvite ? `
      <div class="row" style="margin-top:10px">
        <button class="btn primary" data-action="accept" data-match="${m.id}">✓ Me apunto</button>
        <button class="btn danger" data-action="decline" data-match="${m.id}">✗ No puedo</button>
      </div>` : ''}

    ${m.isCreator && !m.result ? `
      <div class="row" style="margin-top:10px">
        ${invitable.length ? `
          <select data-inviter="${m.id}" style="flex:1">
            <option value="">Invitar...</option>
            ${invitable.map(f => `<option value="${f.id}">${esc(f.displayName)}${f.isGuest ? ' (invitado)' : ''}</option>`).join('')}
          </select>
          <button class="btn small" data-action="invite" data-match="${m.id}">Invitar</button>` : ''}
        <button class="btn primary" data-action="teams" data-match="${m.id}">⚖️ ${m.teams ? 'Regenerar equipos' : 'Generar equipos'}</button>
      </div>` : ''}

    ${m.teams ? `
      ${pitchHTML(m.teams)}
      <div class="teams">
        <div class="team" style="border-color:${tn.colorA}44">
          <h4><span class="cdot" style="background:${tn.colorA}"></span> ${esc(tn.nameA)} <span class="muted">(${m.teams.scoreA})</span></h4>
          <ul>${m.teams.A.map(p => `<li><span>${esc(p.name)}</span><span class="row">
            <span class="muted">${POS_ICON[p.position] || ''} ⭐${p.rating}</span>
            ${m.isCreator && !m.result ? `<button class="swapbtn" title="Mover al otro equipo" data-action="move" data-match="${m.id}" data-player="${p.id}">⇄</button>` : ''}
          </span></li>`).join('')}</ul>
        </div>
        <div class="team b" style="border-color:${tn.colorB}44">
          <h4><span class="cdot" style="background:${tn.colorB}"></span> ${esc(tn.nameB)} <span class="muted">(${m.teams.scoreB})</span></h4>
          <ul>${m.teams.B.map(p => `<li><span>${esc(p.name)}</span><span class="row">
            <span class="muted">${POS_ICON[p.position] || ''} ⭐${p.rating}</span>
            ${m.isCreator && !m.result ? `<button class="swapbtn" title="Mover al otro equipo" data-action="move" data-match="${m.id}" data-player="${p.id}">⇄</button>` : ''}
          </span></li>`).join('')}</ul>
        </div>
      </div>
      ${m.isCreator && !m.result ? `
      <div class="row" style="margin-top:8px;justify-content:center">
        <input data-tna="${m.id}" value="${esc(tn.nameA)}" maxlength="25" placeholder="Nombre equipo A" style="width:130px">
        <select data-tca="${m.id}" title="Color equipo A">
          ${TEAM_COLORS.map(([hex, name]) => `<option value="${hex}" ${hex === tn.colorA ? 'selected' : ''}>● ${name}</option>`).join('')}
        </select>
        <input data-tnb="${m.id}" value="${esc(tn.nameB)}" maxlength="25" placeholder="Nombre equipo B" style="width:130px">
        <select data-tcb="${m.id}" title="Color equipo B">
          ${TEAM_COLORS.map(([hex, name]) => `<option value="${hex}" ${hex === tn.colorB ? 'selected' : ''}>● ${name}</option>`).join('')}
        </select>
        <button class="btn small" data-action="teamsinfo" data-match="${m.id}">💾 Equipos</button>
      </div>` : ''}
      <p class="vs muted">Diferencia de nivel: ${m.teams.difference}${m.isCreator && !m.result ? ' · Usa ⇄ para cambios manuales' : ''}</p>
      ${m.result?.mvp ? `<p class="vs">🏅 MVP: ${esc(([...m.teams.A, ...m.teams.B].find(p => p.id === m.result.mvp) || {}).name || '')} (+1 pt)</p>` : ''}
      ${m.isCreator && !m.result ? `
        <div class="row" style="justify-content:center">
          <input type="number" min="0" data-scorea="${m.id}" placeholder="Goles A" style="width:90px">
          <strong>vs</strong>
          <input type="number" min="0" data-scoreb="${m.id}" placeholder="Goles B" style="width:90px">
          <select data-mvp="${m.id}">
            <option value="">MVP (opcional)</option>
            ${[...m.teams.A, ...m.teams.B].map(p => `<option value="${p.id}">🏅 ${esc(p.name)}</option>`).join('')}
          </select>
          <button class="btn primary small" data-action="result" data-match="${m.id}">Registrar resultado</button>
        </div>` : ''}` : ''}
    </div>
  </div>`;
}

// ---------- Ranking ----------
async function renderRanking(groupId = '') {
  const el = $('#view-ranking');
  try {
    const [groupsData, rankData] = await Promise.all([
      api('/groups'),
      api('/ranking' + (groupId ? '?groupId=' + groupId : ''))
    ]);
    const { ranking, scope } = rankData;
    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = `<div class="card">
      <div class="row between">
        <h2>Ranking · ${esc(scope === 'amigos' ? 'Mis amigos' : scope)}</h2>
        <select id="rankScope">
          <option value="">Mis amigos</option>
          ${groupsData.groups.map(g => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}
        </select>
      </div>
      ${ranking.map((r, i) => `
        <div class="list-item">
          <span>${medals[i] || (i + 1) + '.'} ${playerTag(r)} ${r.id === me.id ? '<span class="pill">tú</span>' : ''}</span>
          <span class="row">
            <span class="pill">PJ ${r.played}</span>
            <span class="pill wdl">✅ ${r.wins} · ➖ ${r.draws} · ❌ ${r.losses}</span>
            <span class="pill amber">🏆 ${r.points} pts</span>
          </span>
        </div>`).join('')}
      <p class="muted" style="margin-top:10px">PJ = partidos jugados · Victoria +3 · Empate +1 · MVP +1 · Los puntos suben tu rating para el balanceo.</p>
    </div>`;
    $('#rankScope').onchange = e => renderRanking(e.target.value);
  } catch (err) { toast(err.message, true); }
}

// ---------- Boot ----------
// Si la URL trae ?join=CODIGO (enlace o QR de un grupo), se guarda para aplicarlo al entrar
const joinParam = new URLSearchParams(location.search).get('join');
if (joinParam) {
  localStorage.setItem('pendingJoin', joinParam);
  history.replaceState(null, '', location.pathname);
}

async function applyPendingJoin() {
  const code = localStorage.getItem('pendingJoin');
  if (!code) return;
  localStorage.removeItem('pendingJoin');
  try {
    const r = await api('/groups/join', 'POST', { code });
    toast(`Te uniste a ${r.group.name} ⚽`);
  } catch (err) { toast(err.message, true); }
}

async function boot() {
  if (token) {
    try {
      const data = await api('/me');
      me = data.user;
      $('#authScreen').classList.add('hidden');
      $('#mainScreen').classList.remove('hidden');
      $('#userBadge').textContent = me.displayName;
      $('#navAdmin').classList.toggle('hidden', !me.isAdmin);
      await applyPendingJoin();
      showView('home');
      return;
    } catch {
      token = null; localStorage.removeItem('token');
    }
  }
  $('#mainScreen').classList.add('hidden');
  $('#authScreen').classList.remove('hidden');
  if (localStorage.getItem('pendingJoin')) {
    $('#authError').textContent = 'Entra o crea tu cuenta para unirte al grupo';
  }
}
boot();
// v5
