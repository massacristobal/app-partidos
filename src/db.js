// Base de datos con dos modos:
// - LOCAL (por defecto): archivo JSON en data/db.json
// - NUBE: si existen las variables de entorno SUPABASE_URL y SUPABASE_KEY,
//   el estado completo se guarda en Supabase (tabla 'estado', fila id=1, columna jsonb 'data').
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const TABLE = process.env.SUPABASE_TABLE || 'estado';
const CLOUD = !!(SUPABASE_URL && SUPABASE_KEY);

const EMPTY = {
  users: [],        // {id, username, displayName, passHash?, salt?, position, points, isGuest?, ownerId?, createdAt}
  friendships: [],  // {id, from, to, status: 'pending'|'accepted'}
  matches: [],      // {id, creator, title, place, date, perSide, groupId, players:[userId], invites:[{userId,status}], teams:{A:[],B:[]}|null, result:null|{scoreA,scoreB}, createdAt}
  groups: [],       // {id, name, owner, joinCode, members:[userId], createdAt}
  sessions: {}      // token -> {userId, createdAt}
};

let db = null;

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
}

async function sbPush() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 1, data: db })
    });
    if (!r.ok) console.error('⚠️ Error guardando en Supabase:', r.status, await r.text());
  } catch (err) {
    console.error('⚠️ Error de red guardando en Supabase:', err.message);
  }
}

// Inicializa la base de datos. Llamar UNA vez antes de app.listen().
export async function init() {
  if (db) return db;
  if (CLOUD) {
    console.log('🗄️ Modo nube: usando Supabase');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=data`, { headers: sbHeaders() });
    if (!r.ok) throw new Error(`No se pudo leer Supabase (${r.status}): ${await r.text()}`);
    const rows = await r.json();
    db = { ...structuredClone(EMPTY), ...(rows[0]?.data || {}) };
    if (!rows[0]) await sbPush(); // crea la fila inicial
  } else {
    console.log('🗄️ Modo local: usando data/db.json');
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      try {
        db = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
      } catch {
        db = structuredClone(EMPTY);
      }
    } else {
      db = structuredClone(EMPTY);
    }
  }
  return db;
}

export function load() {
  if (!db) throw new Error('Base de datos no inicializada: falta llamar a init()');
  return db;
}

let saveTimer = null;
export function save() {
  // Debounce: agrupa escrituras seguidas
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (CLOUD) {
      sbPush();
    } else {
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, DB_FILE);
    }
  }, 50);
}

export function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
// v3
