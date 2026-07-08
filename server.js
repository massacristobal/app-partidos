// APP Partidos — servidor principal
// Uso: npm install && npm start  →  http://localhost:3000
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { init, load, save, newId } from './src/db.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth, publicUser } from './src/auth.js';
import { balanceTeams, playerRating } from './src/balance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const POSITIONS = ['arquero', 'defensa', 'medio', 'delantero'];
const FEET = ['derecho', 'izquierdo', 'ambos'];
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const isAdmin = u => !!ADMIN_USERNAME && (u.username === ADMIN_USERNAME || (u.email || '') === ADMIN_USERNAME);

// Genera un nombre de usuario único a partir del email
function genUsername(db, email) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 20) || 'jugador';
  let u = base, i = 1;
  while (db.users.some(x => x.username === u)) u = base.slice(0, 17) + (++i);
  return u;
}

// Busca una cuenta (no invitado) por email o nombre de usuario
function findAccount(db, identifier) {
  const idf = String(identifier || '').trim().toLowerCase();
  return db.users.find(u => !u.isGuest && ((u.email || '') === idf || u.username === idf));
}

function userBrief(u) {
  return u && {
    id: u.id, username: u.username, displayName: u.displayName,
    position: u.position, foot: u.foot || 'derecho', points: u.points || 0, rating: playerRating(u),
    isGuest: !!u.isGuest, ownerId: u.ownerId || null
  };
}

// ---------- AUTH ----------
app.post('/api/register', (req, res) => {
  const db = load();
  const { firstName, lastName, email, password, position, foot } = req.body || {};
  const mail = String(email || '').trim().toLowerCase();
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  if (!fn) return res.status(400).json({ error: 'Falta el nombre' });
  if (!ln) return res.status(400).json({ error: 'Falta el apellido' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({ error: 'Email inválido' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Contraseña muy corta (mínimo 4)' });
  if (db.users.some(u => (u.email || '') === mail)) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });

  const { salt, hash } = hashPassword(password);
  const user = {
    id: newId('u'),
    username: genUsername(db, mail),
    email: mail,
    firstName: fn.slice(0, 25),
    lastName: ln.slice(0, 25),
    displayName: `${fn} ${ln}`.slice(0, 40),
    passHash: hash,
    salt,
    position: POSITIONS.includes(position) ? position : 'medio',
    foot: FEET.includes(foot) ? foot : 'derecho',
    points: 0,
    createdAt: Date.now()
  };
  db.users.push(user);
  save();
  const token = createSession(user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const db = load();
  const { email, username, password } = req.body || {};
  const user = findAccount(db, email || username);
  if (!user || !verifyPassword(password || '', user.salt, user.passHash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }
  const token = createSession(user.id);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/logout', requireAuth, (req, res) => {
  destroySession(req.headers.authorization.slice(7));
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: { ...publicUser(req.user), rating: playerRating(req.user), isAdmin: isAdmin(req.user) } });
});

app.put('/api/me', requireAuth, (req, res) => {
  const db = load();
  const { displayName, position, foot, email } = req.body || {};
  if (displayName) req.user.displayName = String(displayName).trim().slice(0, 40);
  if (POSITIONS.includes(position)) req.user.position = position;
  if (FEET.includes(foot)) req.user.foot = foot;
  if (email !== undefined && String(email).trim()) {
    const mail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({ error: 'Email inválido' });
    if (db.users.some(u => u.id !== req.userId && (u.email || '') === mail)) {
      return res.status(409).json({ error: 'Ese email ya está en uso por otra cuenta' });
    }
    req.user.email = mail;
  }
  save();
  res.json({ user: { ...publicUser(req.user), rating: playerRating(req.user) } });
});

// Cambiar mi contraseña
app.put('/api/me/password', requireAuth, (req, res) => {
  const db = load();
  const { current, next } = req.body || {};
  if (!verifyPassword(current || '', req.user.salt, req.user.passHash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  if (!next || next.length < 4) return res.status(400).json({ error: 'La nueva contraseña es muy corta (mínimo 4)' });
  const { salt, hash } = hashPassword(next);
  req.user.salt = salt;
  req.user.passHash = hash;
  // Cierra las demás sesiones de este usuario
  const myToken = req.headers.authorization.slice(7);
  for (const [t, s] of Object.entries(db.sessions)) {
    if (s.userId === req.userId && t !== myToken) delete db.sessions[t];
  }
  save();
  res.json({ ok: true });
});

// Administrador: resetear la contraseña de un usuario que la olvidó
app.post('/api/admin/reset-password', requireAuth, (req, res) => {
  const db = load();
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Solo el administrador puede resetear contraseñas' });
  const target = findAccount(db, req.body?.username);
  if (!target) return res.status(404).json({ error: 'No existe una cuenta con ese email o usuario' });
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 4) return res.status(400).json({ error: 'La contraseña temporal es muy corta (mínimo 4)' });
  const { salt, hash } = hashPassword(newPassword);
  target.salt = salt;
  target.passHash = hash;
  // Cierra todas las sesiones del usuario reseteado
  for (const [t, s] of Object.entries(db.sessions)) {
    if (s.userId === target.id) delete db.sessions[t];
  }
  save();
  res.json({ ok: true });
});

// ---------- AMIGOS ----------
app.get('/api/users/search', requireAuth, (req, res) => {
  const db = load();
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ users: [] });
  const results = db.users
    .filter(u => !u.isGuest && u.id !== req.userId &&
      (u.username.includes(q) || u.displayName.toLowerCase().includes(q) || (u.email || '').includes(q)))
    .slice(0, 10)
    .map(u => ({ id: u.id, username: u.username, displayName: u.displayName, position: u.position }));
  res.json({ users: results });
});

function friendshipBetween(db, a, b) {
  return db.friendships.find(f =>
    (f.from === a && f.to === b) || (f.from === b && f.to === a));
}

function areFriends(db, a, b) {
  const f = friendshipBetween(db, a, b);
  return f && f.status === 'accepted';
}

app.post('/api/friends/request', requireAuth, (req, res) => {
  const db = load();
  const { userId } = req.body || {};
  const target = db.users.find(u => u.id === userId);
  if (!target || target.isGuest) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.id === req.userId) return res.status(400).json({ error: 'No puedes agregarte a ti mismo' });
  const existing = friendshipBetween(db, req.userId, target.id);
  if (existing) return res.status(409).json({ error: existing.status === 'accepted' ? 'Ya son amigos' : 'Ya hay una solicitud pendiente' });
  db.friendships.push({ id: newId('f'), from: req.userId, to: target.id, status: 'pending' });
  save();
  res.json({ ok: true });
});

app.post('/api/friends/respond', requireAuth, (req, res) => {
  const db = load();
  const { friendshipId, accept } = req.body || {};
  const f = db.friendships.find(x => x.id === friendshipId && x.to === req.userId && x.status === 'pending');
  if (!f) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (accept) { f.status = 'accepted'; }
  else { db.friendships = db.friendships.filter(x => x.id !== f.id); }
  save();
  res.json({ ok: true });
});

app.get('/api/friends', requireAuth, (req, res) => {
  const db = load();
  const mine = db.friendships.filter(f => f.from === req.userId || f.to === req.userId);
  const friends = mine.filter(f => f.status === 'accepted').map(f => {
    const other = db.users.find(u => u.id === (f.from === req.userId ? f.to : f.from));
    return userBrief(other);
  }).filter(Boolean);
  const pendingIn = mine.filter(f => f.status === 'pending' && f.to === req.userId).map(f => {
    const other = db.users.find(u => u.id === f.from);
    return other && { friendshipId: f.id, id: other.id, username: other.username, displayName: other.displayName };
  }).filter(Boolean);
  const pendingOut = mine.filter(f => f.status === 'pending' && f.from === req.userId).map(f => {
    const other = db.users.find(u => u.id === f.to);
    return other && { id: other.id, username: other.username, displayName: other.displayName };
  }).filter(Boolean);
  res.json({ friends, pendingIn, pendingOut });
});

// Administrador: ajustar los puntos de un jugador
app.post('/api/admin/set-points', requireAuth, (req, res) => {
  const db = load();
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Solo el administrador puede ajustar puntos' });
  const uname = String(req.body?.username || '').trim().toLowerCase();
  const target = findAccount(db, uname)
    || db.users.find(u => u.isGuest && u.displayName.toLowerCase() === uname);
  if (!target) return res.status(404).json({ error: 'No existe ese usuario (para invitados usa su nombre)' });
  const pts = Math.round(Number(req.body?.points));
  if (!Number.isFinite(pts) || pts < 0) return res.status(400).json({ error: 'Puntos inválidos' });
  target.points = pts;
  save();
  res.json({ ok: true, user: userBrief(target) });
});

// Eliminación en cascada: limpia todas las referencias al usuario
function deleteUserCascade(db, target) {
  const uid = target.id;
  // Sus invitados sin cuenta también se eliminan
  db.users.filter(u => u.isGuest && u.ownerId === uid).forEach(g => deleteUserCascade(db, g));
  // Amistades
  db.friendships = db.friendships.filter(f => f.from !== uid && f.to !== uid);
  // Grupos: sale de todos; si era dueño, hereda el miembro más antiguo; grupos vacíos se borran
  db.groups.forEach(g => {
    g.members = g.members.filter(id => id !== uid);
    if (g.owner === uid) g.owner = g.members[0] || null;
  });
  db.groups = db.groups.filter(g => g.members.length > 0);
  // Partidos que creó y no se jugaron: se eliminan. Los jugados quedan como historial.
  db.matches = db.matches.filter(m => !(m.creator === uid && !m.result));
  db.matches.forEach(m => {
    m.players = m.players.filter(id => id !== uid);
    m.invites = m.invites.filter(i => i.userId !== uid);
    if (m.teams && !m.result) {
      ['A', 'B'].forEach(s => m.teams[s] = m.teams[s].filter(p => p.id !== uid));
      const sum = t => +(t.reduce((x, p) => x + (p.rating || 0), 0)).toFixed(2);
      m.teams.scoreA = sum(m.teams.A);
      m.teams.scoreB = sum(m.teams.B);
      m.teams.difference = +Math.abs(m.teams.scoreA - m.teams.scoreB).toFixed(2);
    }
  });
  // Sesiones y usuario
  for (const [t, s] of Object.entries(db.sessions)) if (s.userId === uid) delete db.sessions[t];
  db.users = db.users.filter(u => u.id !== uid);
}

// Administrador: eliminar un usuario (cuenta o invitado)
app.post('/api/admin/delete-user', requireAuth, (req, res) => {
  const db = load();
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Solo el administrador puede eliminar usuarios' });
  const uname = String(req.body?.username || '').trim().toLowerCase();
  const target = findAccount(db, uname)
    || db.users.find(u => u.isGuest && u.displayName.toLowerCase() === uname);
  if (!target) return res.status(404).json({ error: 'No existe ese usuario (para invitados usa su nombre)' });
  if (target.id === req.userId) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador' });
  const name = target.displayName;
  deleteUserCascade(db, target);
  save();
  res.json({ ok: true, deleted: name });
});

// ---------- INVITADOS (jugadores sin cuenta) ----------
app.post('/api/guests', requireAuth, (req, res) => {
  const db = load();
  const { displayName, position, foot } = req.body || {};
  const name = String(displayName || '').trim().slice(0, 40);
  if (name.length < 2) return res.status(400).json({ error: 'Nombre muy corto' });
  const guest = {
    id: newId('u'),
    username: 'invitado_' + Math.random().toString(36).slice(2, 8),
    displayName: name,
    position: POSITIONS.includes(position) ? position : 'medio',
    foot: FEET.includes(foot) ? foot : 'derecho',
    points: 0,
    isGuest: true,
    ownerId: req.userId,
    createdAt: Date.now()
  };
  db.users.push(guest);
  // Amistad automática con el creador para que aparezca en su lista
  db.friendships.push({ id: newId('f'), from: req.userId, to: guest.id, status: 'accepted' });
  save();
  res.json({ guest: userBrief(guest) });
});

// Vincular invitado a una cuenta real: transfiere puntos, partidos y grupos
app.post('/api/guests/:id/link', requireAuth, (req, res) => {
  const db = load();
  const guest = db.users.find(u => u.id === req.params.id && u.isGuest);
  if (!guest) return res.status(404).json({ error: 'Invitado no encontrado' });
  if (guest.ownerId !== req.userId) return res.status(403).json({ error: 'Solo quien lo creó puede vincularlo' });
  const uname = String(req.body?.username || '').trim().toLowerCase();
  const target = db.users.find(u => !u.isGuest && u.username === uname);
  if (!target) return res.status(404).json({ error: 'No existe una cuenta con ese usuario' });
  if (target.id === guest.id) return res.status(400).json({ error: 'Vinculación inválida' });

  // 1. Puntos
  target.points = (target.points || 0) + (guest.points || 0);
  // 2. Partidos: jugadores, invitaciones y equipos
  db.matches.forEach(m => {
    m.players = [...new Set(m.players.map(id => id === guest.id ? target.id : id))];
    const seen = new Set();
    m.invites = m.invites.map(i => i.userId === guest.id ? { ...i, userId: target.id } : i)
      .filter(i => !m.players.includes(i.userId) || i.status !== 'pending')
      .filter(i => { if (seen.has(i.userId)) return false; seen.add(i.userId); return true; });
    if (m.teams) {
      ['A', 'B'].forEach(side => m.teams[side].forEach(p => {
        if (p.id === guest.id) { p.id = target.id; p.name = target.displayName; }
      }));
    }
  });
  // 3. Grupos
  db.groups.forEach(g => {
    g.members = [...new Set(g.members.map(id => id === guest.id ? target.id : id))];
  });
  // 4. Amistades: reconectar las del invitado hacia la cuenta real
  db.friendships = db.friendships
    .map(f => ({
      ...f,
      from: f.from === guest.id ? target.id : f.from,
      to: f.to === guest.id ? target.id : f.to
    }))
    .filter(f => f.from !== f.to);
  const seenPairs = new Set();
  db.friendships = db.friendships.filter(f => {
    const key = [f.from, f.to].sort().join('|');
    if (seenPairs.has(key)) return false;
    seenPairs.add(key);
    return true;
  });
  // 5. Eliminar el invitado
  db.users = db.users.filter(u => u.id !== guest.id);
  save();
  res.json({ ok: true, linkedTo: userBrief(target) });
});

// ---------- GRUPOS ----------
function groupView(db, g, userId) {
  return {
    id: g.id,
    name: g.name,
    owner: g.owner,
    isOwner: g.owner === userId,
    joinCode: g.joinCode,
    members: g.members.map(id => userBrief(db.users.find(u => u.id === id))).filter(Boolean)
  };
}

app.post('/api/groups', requireAuth, (req, res) => {
  const db = load();
  const name = String(req.body?.name || '').trim().slice(0, 40);
  if (name.length < 2) return res.status(400).json({ error: 'Nombre muy corto' });
  const g = {
    id: newId('g'),
    name,
    owner: req.userId,
    joinCode: crypto.randomBytes(3).toString('hex').toUpperCase(),
    members: [req.userId],
    createdAt: Date.now()
  };
  db.groups.push(g);
  save();
  res.json({ group: groupView(db, g, req.userId) });
});

app.get('/api/groups', requireAuth, (req, res) => {
  const db = load();
  const mine = db.groups.filter(g => g.members.includes(req.userId));
  res.json({ groups: mine.map(g => groupView(db, g, req.userId)) });
});

app.post('/api/groups/join', requireAuth, (req, res) => {
  const db = load();
  const code = String(req.body?.code || '').trim().toUpperCase();
  const g = db.groups.find(x => x.joinCode === code);
  if (!g) return res.status(404).json({ error: 'Código no válido' });
  if (g.members.includes(req.userId)) return res.status(409).json({ error: 'Ya eres parte de este grupo' });
  g.members.push(req.userId);
  save();
  res.json({ group: groupView(db, g, req.userId) });
});

app.post('/api/groups/:id/add', requireAuth, (req, res) => {
  const db = load();
  const g = db.groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
  if (!g.members.includes(req.userId)) return res.status(403).json({ error: 'No eres parte de este grupo' });
  const { userId } = req.body || {};
  const target = db.users.find(u => u.id === userId);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  const isMyGuest = target.isGuest && target.ownerId === req.userId;
  if (!isMyGuest && !areFriends(db, req.userId, target.id)) {
    return res.status(400).json({ error: 'Solo puedes agregar a tus amigos o a tus invitados' });
  }
  if (g.members.includes(target.id)) return res.status(409).json({ error: 'Ya está en el grupo' });
  g.members.push(target.id);
  save();
  res.json({ group: groupView(db, g, req.userId) });
});

// ---------- PARTIDOS ----------
function matchView(db, m, userId) {
  const userOf = id => userBrief(db.users.find(x => x.id === id));
  const group = m.groupId ? db.groups.find(g => g.id === m.groupId) : null;
  return {
    id: m.id,
    title: m.title,
    place: m.place,
    date: m.date,
    perSide: m.perSide || 5,
    costPerPerson: m.costPerPerson || null,
    groupId: m.groupId || null,
    groupName: group ? group.name : null,
    creator: userOf(m.creator) || { id: m.creator, username: '', displayName: 'Usuario eliminado', position: 'medio', foot: 'derecho', points: 0, rating: 0, isGuest: false, ownerId: null },
    isCreator: m.creator === userId,
    players: m.players.map(userOf).filter(Boolean),
    invites: m.invites.map(i => ({ ...i, user: userOf(i.userId) })).filter(i => i.user),
    teams: m.teams,
    result: m.result,
    createdAt: m.createdAt
  };
}

app.post('/api/matches', requireAuth, (req, res) => {
  const db = load();
  const { title, place, date, perSide, groupId } = req.body || {};
  let ps = Math.round(Number(perSide));
  if (!Number.isFinite(ps)) ps = 5;
  ps = Math.min(11, Math.max(2, ps));
  let gid = null;
  if (groupId) {
    const g = db.groups.find(x => x.id === groupId && x.members.includes(req.userId));
    if (!g) return res.status(400).json({ error: 'Grupo no válido' });
    gid = g.id;
  }
  const cost = Math.round(Number(req.body?.costPerPerson));
  const m = {
    id: newId('m'),
    creator: req.userId,
    title: String(title || 'Pichanga').trim().slice(0, 60),
    place: String(place || '').trim().slice(0, 120),
    date: String(date || '').slice(0, 30),
    perSide: ps,
    groupId: gid,
    costPerPerson: Number.isFinite(cost) && cost > 0 ? cost : null,
    players: [req.userId],
    invites: [],
    teams: null,
    result: null,
    createdAt: Date.now()
  };
  // Jugadores seleccionados al crear: entran directo (amigos, miembros del grupo o invitados propios)
  const playerIds = Array.isArray(req.body?.playerIds) ? req.body.playerIds : [];
  for (const pid of playerIds) {
    const t = db.users.find(u => u.id === pid);
    if (!t || t.id === req.userId || m.players.includes(t.id)) continue;
    const isMyGuest = t.isGuest && t.ownerId === req.userId;
    const sameGroup = gid && db.groups.some(g => g.id === gid && g.members.includes(t.id));
    if (isMyGuest || sameGroup || areFriends(db, req.userId, t.id)) m.players.push(t.id);
  }
  db.matches.push(m);
  save();
  res.json({ match: matchView(db, m, req.userId) });
});

app.get('/api/matches', requireAuth, (req, res) => {
  const db = load();
  const visible = db.matches.filter(m =>
    m.players.includes(req.userId) || m.invites.some(i => i.userId === req.userId));
  res.json({ matches: visible.sort((a, b) => b.createdAt - a.createdAt).map(m => matchView(db, m, req.userId)) });
});

// Editar datos del partido (solo el creador, antes del resultado)
app.put('/api/matches/:id', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  if (m.creator !== req.userId) return res.status(403).json({ error: 'Solo el creador puede editar el partido' });
  if (m.result) return res.status(400).json({ error: 'No se puede editar un partido finalizado' });
  const { title, place, date, perSide, costPerPerson } = req.body || {};
  if (title !== undefined && String(title).trim()) m.title = String(title).trim().slice(0, 60);
  if (place !== undefined) m.place = String(place).trim().slice(0, 120);
  if (date !== undefined) m.date = String(date).slice(0, 30);
  if (costPerPerson !== undefined) {
    const c = Math.round(Number(costPerPerson));
    m.costPerPerson = Number.isFinite(c) && c > 0 ? c : null;
  }
  if (perSide !== undefined) {
    const ps = Math.round(Number(perSide));
    if (Number.isFinite(ps)) m.perSide = Math.min(11, Math.max(2, ps));
  }
  // Nombres y colores de los equipos (si ya fueron generados)
  if (m.teams) {
    const { teamAName, teamBName, teamAColor, teamBColor } = req.body || {};
    const okColor = c => /^#[0-9a-fA-F]{6}$/.test(String(c || ''));
    if (teamAName !== undefined && String(teamAName).trim()) m.teams.nameA = String(teamAName).trim().slice(0, 25);
    if (teamBName !== undefined && String(teamBName).trim()) m.teams.nameB = String(teamBName).trim().slice(0, 25);
    if (okColor(teamAColor)) m.teams.colorA = teamAColor;
    if (okColor(teamBColor)) m.teams.colorB = teamBColor;
  }
  save();
  res.json({ match: matchView(db, m, req.userId) });
});

app.post('/api/matches/:id/invite', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  if (m.creator !== req.userId) return res.status(403).json({ error: 'Solo el creador puede invitar' });
  if (m.result) return res.status(400).json({ error: 'El partido ya terminó' });
  const { userId } = req.body || {};
  const target = db.users.find(u => u.id === userId);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

  const isMyGuest = target.isGuest && target.ownerId === req.userId;
  const sameGroup = m.groupId && db.groups.some(g => g.id === m.groupId && g.members.includes(req.userId) && g.members.includes(target.id));
  if (!isMyGuest && !sameGroup && !areFriends(db, req.userId, target.id)) {
    return res.status(400).json({ error: 'Solo puedes invitar a amigos, miembros del grupo o tus invitados' });
  }
  if (m.players.includes(target.id) || m.invites.some(i => i.userId === target.id && i.status === 'pending')) {
    return res.status(409).json({ error: 'Ya está invitado o en el partido' });
  }
  if (target.isGuest) {
    // Los invitados sin cuenta entran directo (los maneja el organizador)
    m.players.push(target.id);
  } else {
    m.invites.push({ userId: target.id, status: 'pending' });
  }
  save();
  res.json({ match: matchView(db, m, req.userId) });
});

app.post('/api/matches/:id/respond', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  const invite = m.invites.find(i => i.userId === req.userId && i.status === 'pending');
  if (!invite) return res.status(404).json({ error: 'No tienes invitación pendiente' });
  const { accept } = req.body || {};
  invite.status = accept ? 'accepted' : 'declined';
  if (accept) m.players.push(req.userId);
  save();
  res.json({ match: matchView(db, m, req.userId) });
});

// Sacar a un jugador del partido: el creador puede sacar a cualquiera; cada jugador puede bajarse solo
app.post('/api/matches/:id/remove', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  if (m.result) return res.status(400).json({ error: 'El partido ya terminó' });
  const targetId = req.body?.userId || req.userId;
  if (targetId !== req.userId && m.creator !== req.userId) {
    return res.status(403).json({ error: 'Solo el creador puede sacar a otros jugadores' });
  }
  if (targetId === m.creator) return res.status(400).json({ error: 'El creador no puede salir de su propio partido' });
  if (!m.players.includes(targetId)) return res.status(404).json({ error: 'Ese jugador no está en el partido' });
  m.players = m.players.filter(id => id !== targetId);
  m.invites = m.invites.filter(i => i.userId !== targetId); // podrá ser reinvitado
  if (m.teams) {
    ['A', 'B'].forEach(s => m.teams[s] = m.teams[s].filter(p => p.id !== targetId));
    const sum = t => +(t.reduce((x, p) => x + (p.rating || 0), 0)).toFixed(2);
    m.teams.scoreA = sum(m.teams.A);
    m.teams.scoreB = sum(m.teams.B);
    m.teams.difference = +Math.abs(m.teams.scoreA - m.teams.scoreB).toFixed(2);
  }
  save();
  res.json({ match: matchView(db, m, req.userId) });
});

app.post('/api/matches/:id/teams', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  if (m.creator !== req.userId) return res.status(403).json({ error: 'Solo el creador puede generar equipos' });
  if (m.players.length < 4) return res.status(400).json({ error: 'Se necesitan al menos 4 jugadores' });
  if (m.result) return res.status(400).json({ error: 'El partido ya tiene resultado' });

  const players = m.players.map(id => db.users.find(u => u.id === id)).filter(Boolean);
  // Historial: formaciones de partidos anteriores ya jugados
  const history = db.matches
    .filter(x => x.id !== m.id && x.teams && x.result)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(x => ({ A: x.teams.A.map(p => p.id), B: x.teams.B.map(p => p.id) }));

  const result = balanceTeams(players, history);
  m.teams = {
    A: result.teamA, B: result.teamB,
    scoreA: result.scoreA, scoreB: result.scoreB, difference: result.difference,
    // Al regenerar se conservan nombres y colores personalizados
    nameA: m.teams?.nameA || 'Equipo A', nameB: m.teams?.nameB || 'Equipo B',
    colorA: m.teams?.colorA || '#1b5e20', colorB: m.teams?.colorB || '#1a4fa0'
  };
  save();
  res.json({ match: matchView(db, m, req.userId) });
});

// Cambio manual: mover un jugador al otro equipo (solo el creador)
app.post('/api/matches/:id/move', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  if (m.creator !== req.userId) return res.status(403).json({ error: 'Solo el creador puede hacer cambios' });
  if (!m.teams) return res.status(400).json({ error: 'Primero genera los equipos' });
  if (m.result) return res.status(400).json({ error: 'El partido ya tiene resultado' });

  const { playerId } = req.body || {};
  const iA = m.teams.A.findIndex(p => p.id === playerId);
  const iB = m.teams.B.findIndex(p => p.id === playerId);
  if (iA === -1 && iB === -1) return res.status(404).json({ error: 'Jugador no está en los equipos' });

  if (iA !== -1) m.teams.B.push(m.teams.A.splice(iA, 1)[0]);
  else m.teams.A.push(m.teams.B.splice(iB, 1)[0]);

  const sum = team => +(team.reduce((s, p) => s + (p.rating || 0), 0)).toFixed(2);
  m.teams.scoreA = sum(m.teams.A);
  m.teams.scoreB = sum(m.teams.B);
  m.teams.difference = +Math.abs(m.teams.scoreA - m.teams.scoreB).toFixed(2);
  save();
  res.json({ match: matchView(db, m, req.userId) });
});

// Eliminar partido (solo el creador). Si tenía resultado, revierte los puntos otorgados.
app.delete('/api/matches/:id', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  if (m.creator !== req.userId) return res.status(403).json({ error: 'Solo el creador puede eliminar el partido' });
  if (m.result && m.teams) {
    const revert = (ids, pts) => ids.forEach(id => {
      const u = db.users.find(x => x.id === id);
      if (u) u.points = Math.max(0, (u.points || 0) - pts);
    });
    const idsA = m.teams.A.map(p => p.id);
    const idsB = m.teams.B.map(p => p.id);
    if (m.result.scoreA > m.result.scoreB) revert(idsA, 3);
    else if (m.result.scoreB > m.result.scoreA) revert(idsB, 3);
    else { revert(idsA, 1); revert(idsB, 1); }
    if (m.result.mvp) revert([m.result.mvp], 1);
  }
  db.matches = db.matches.filter(x => x.id !== m.id);
  save();
  res.json({ ok: true });
});

app.post('/api/matches/:id/result', requireAuth, (req, res) => {
  const db = load();
  const m = db.matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Partido no encontrado' });
  if (m.creator !== req.userId) return res.status(403).json({ error: 'Solo el creador puede registrar el resultado' });
  if (!m.teams) return res.status(400).json({ error: 'Primero genera los equipos' });
  if (m.result) return res.status(400).json({ error: 'El resultado ya fue registrado' });

  const scoreA = Math.max(0, Math.round(Number(req.body?.scoreA)));
  const scoreB = Math.max(0, Math.round(Number(req.body?.scoreB)));
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return res.status(400).json({ error: 'Marcador inválido' });

  const mvpId = req.body?.mvpId || null;
  if (mvpId) {
    const inTeams = m.teams.A.some(p => p.id === mvpId) || m.teams.B.some(p => p.id === mvpId);
    if (!inTeams) return res.status(400).json({ error: 'El MVP debe ser un jugador del partido' });
  }
  m.result = { scoreA, scoreB, mvp: mvpId, recordedAt: Date.now() };

  // Puntos: victoria +3, empate +1, derrota 0
  const award = (ids, pts) => ids.forEach(id => {
    const u = db.users.find(x => x.id === id);
    if (u) u.points = (u.points || 0) + pts;
  });
  const idsA = m.teams.A.map(p => p.id);
  const idsB = m.teams.B.map(p => p.id);
  if (scoreA > scoreB) { award(idsA, 3); }
  else if (scoreB > scoreA) { award(idsB, 3); }
  else { award(idsA, 1); award(idsB, 1); }
  if (mvpId) award([mvpId], 1); // punto extra al MVP

  save();
  res.json({ match: matchView(db, m, req.userId) });
});

// ---------- RANKING ----------
app.get('/api/ranking', requireAuth, (req, res) => {
  const db = load();
  const groupId = req.query.groupId;
  let ids;
  let scope = 'amigos';
  if (groupId) {
    const g = db.groups.find(x => x.id === groupId && x.members.includes(req.userId));
    if (!g) return res.status(404).json({ error: 'Grupo no encontrado' });
    ids = new Set(g.members);
    scope = g.name;
  } else {
    const mine = db.friendships.filter(f => f.status === 'accepted' && (f.from === req.userId || f.to === req.userId));
    ids = new Set([req.userId, ...mine.map(f => f.from === req.userId ? f.to : f.from)]);
  }
  const finished = db.matches.filter(m => m.result && m.teams);
  const rows = [...ids].map(id => {
    const u = db.users.find(x => x.id === id);
    if (!u) return null;
    let wins = 0, draws = 0, losses = 0;
    finished.forEach(m => {
      const inA = m.teams.A.some(p => p.id === id);
      const inB = m.teams.B.some(p => p.id === id);
      if (!inA && !inB) return;
      const diff = m.result.scoreA - m.result.scoreB;
      const mine = inA ? diff : -diff;
      if (mine > 0) wins++;
      else if (mine === 0) draws++;
      else losses++;
    });
    return { ...userBrief(u), played: wins + draws + losses, wins, draws, losses };
  }).filter(Boolean).sort((a, b) => b.points - a.points);
  res.json({ ranking: rows, scope });
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`⚽ APP Partidos corriendo en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ No se pudo inicializar la base de datos:', err.message);
  process.exit(1);
});
// v3
