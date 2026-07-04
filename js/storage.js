// ============================================================================
// storage.js — couche de persistance (localStorage).
// Ceci est un projet 100% statique (aucun serveur). Toutes les données —
// comptes, tentatives, questions ajoutées par l'admin — vivent dans le
// navigateur de la personne qui utilise le site. Si tu veux un vrai backend
// partagé entre plusieurs appareils, il faudra brancher une API derrière
// ces mêmes fonctions (voir README.md).
// ============================================================================

const DB_KEYS = {
  users: 'pmp_users',
  session: 'pmp_session',
  customQuestions: 'pmp_custom_questions', // ajouts/modifs admin, indexés par id
  deletedIds: 'pmp_deleted_ids',
  attempts: 'pmp_attempts',
  adminConfig: 'pmp_admin_config',
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('storage read error', key, e);
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// --- hash mot de passe : simple, côté client. Ce n'est PAS une sécurité
// cryptographique réelle — juste pour éviter de stocker le mot de passe en
// clair dans localStorage. Ne réutilise pas ce schéma pour un vrai produit.
function simpleHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function seedDefaults() {
  const users = readJSON(DB_KEYS.users, null);
  if (!users) {
    writeJSON(DB_KEYS.users, {
      admin: {
        username: 'admin',
        passwordHash: simpleHash('admin123'),
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    });
  }
  const cfg = readJSON(DB_KEYS.adminConfig, null);
  if (!cfg) {
    writeJSON(DB_KEYS.adminConfig, { defaultPasswordNoticeShown: false });
  }
  if (readJSON(DB_KEYS.customQuestions, null) === null) writeJSON(DB_KEYS.customQuestions, {});
  if (readJSON(DB_KEYS.deletedIds, null) === null) writeJSON(DB_KEYS.deletedIds, []);
  if (readJSON(DB_KEYS.attempts, null) === null) writeJSON(DB_KEYS.attempts, []);
}
seedDefaults();

const Store = {
  // ---------- Users ----------
  getUsers() { return readJSON(DB_KEYS.users, {}); },

  createUser(username, password) {
    const users = this.getUsers();
    const key = username.trim().toLowerCase();
    if (!key) return { ok: false, error: "Le nom d'utilisateur est requis." };
    if (users[key]) return { ok: false, error: 'Ce nom d\'utilisateur existe déjà.' };
    if (password.length < 4) return { ok: false, error: 'Le mot de passe doit faire au moins 4 caractères.' };
    users[key] = {
      username: key,
      passwordHash: simpleHash(password),
      role: 'user',
      createdAt: new Date().toISOString(),
    };
    writeJSON(DB_KEYS.users, users);
    return { ok: true };
  },

  authenticate(username, password) {
    const users = this.getUsers();
    const key = username.trim().toLowerCase();
    const user = users[key];
    if (!user) return { ok: false, error: 'Compte introuvable.' };
    if (user.passwordHash !== simpleHash(password)) return { ok: false, error: 'Mot de passe incorrect.' };
    return { ok: true, user };
  },

  changePassword(username, newPassword) {
    const users = this.getUsers();
    const key = username.trim().toLowerCase();
    if (!users[key]) return { ok: false, error: 'Compte introuvable.' };
    users[key].passwordHash = simpleHash(newPassword);
    writeJSON(DB_KEYS.users, users);
    return { ok: true };
  },

  // ---------- Session ----------
  login(username) {
    writeJSON(DB_KEYS.session, { username: username.trim().toLowerCase(), at: new Date().toISOString() });
  },
  logout() { localStorage.removeItem(DB_KEYS.session); },
  currentSession() { return readJSON(DB_KEYS.session, null); },
  currentUser() {
    const s = this.currentSession();
    if (!s) return null;
    const users = this.getUsers();
    return users[s.username] || null;
  },
  requireAuth(redirectTo) {
    const u = this.currentUser();
    if (!u) { window.location.href = redirectTo || 'index.html'; return null; }
    return u;
  },
  requireAdmin(redirectTo) {
    const u = this.requireAuth(redirectTo);
    if (!u) return null;
    if (u.role !== 'admin') { window.location.href = 'dashboard.html'; return null; }
    return u;
  },

  // ---------- Questions (base + overrides) ----------
  getCustomQuestions() { return readJSON(DB_KEYS.customQuestions, {}); },
  getDeletedIds() { return readJSON(DB_KEYS.deletedIds, []); },

  // Fusionne QUESTIONS (data.js) + overrides admin + questions ajoutées,
  // moins les suppressions.
  getAllQuestions() {
    const overrides = this.getCustomQuestions();
    const deleted = new Set(this.getDeletedIds());
    const merged = QUESTIONS
      .filter(q => !deleted.has(q.id))
      .map(q => overrides[q.id] ? { ...q, ...overrides[q.id] } : q);
    // questions ajoutées par l'admin (id négatif ou > max de base)
    Object.values(overrides).forEach(q => {
      if (!QUESTIONS.some(base => base.id === q.id) && !deleted.has(q.id)) {
        merged.push(q);
      }
    });
    return merged.sort((a, b) => a.id - b.id);
  },

  upsertQuestion(question) {
    const overrides = this.getCustomQuestions();
    overrides[question.id] = question;
    writeJSON(DB_KEYS.customQuestions, overrides);
  },

  nextCustomId() {
    const all = [...QUESTIONS, ...Object.values(this.getCustomQuestions())];
    return Math.max(0, ...all.map(q => q.id)) + 1;
  },

  deleteQuestion(id) {
    const deleted = this.getDeletedIds();
    if (!deleted.includes(id)) deleted.push(id);
    writeJSON(DB_KEYS.deletedIds, deleted);
    const overrides = this.getCustomQuestions();
    delete overrides[id];
    writeJSON(DB_KEYS.customQuestions, overrides);
  },

  restoreQuestion(id) {
    const deleted = this.getDeletedIds().filter(x => x !== id);
    writeJSON(DB_KEYS.deletedIds, deleted);
  },

  // ---------- Attempts ----------
  getAttempts() { return readJSON(DB_KEYS.attempts, []); },
  getAttemptsForUser(username) {
    return this.getAttempts().filter(a => a.username === username.trim().toLowerCase());
  },
  saveAttempt(attempt) {
    const attempts = this.getAttempts();
    attempts.push(attempt);
    writeJSON(DB_KEYS.attempts, attempts);
  },
  getAttempt(id) {
    return this.getAttempts().find(a => a.id === id) || null;
  },
};
