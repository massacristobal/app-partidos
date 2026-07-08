// Autenticación: hash con scrypt (node:crypto) y tokens de sesión.
import crypto from 'crypto';
import { load, save, newId } from './db.js';

export function hashPassword(password, salt = null) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function createSession(userId) {
  const db = load();
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId, createdAt: Date.now() };
  save();
  return token;
}

export function destroySession(token) {
  const db = load();
  delete db.sessions[token];
  save();
}

// Middleware Express: exige token válido en Authorization: Bearer <token>
export function requireAuth(req, res, next) {
  const db = load();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token && db.sessions[token];
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  req.userId = session.userId;
  req.user = db.users.find(u => u.id === session.userId);
  if (!req.user) return res.status(401).json({ error: 'Usuario no existe' });
  next();
}

export function publicUser(u) {
  if (!u) return null;
  const { passHash, salt, ...rest } = u;
  return rest;
}
