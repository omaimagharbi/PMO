const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error(
    "Variable d'environnement JWT_SECRET manquante. Elle est nécessaire pour signer et vérifier les jetons d'accès à l'API NEXUS."
  );
}

/**
 * Vérifie l'en-tête Authorization: Bearer <token> d'une requête entrante.
 * Retourne le payload décodé si le jeton est valide, sinon écrit une
 * réponse 401 et retourne null (l'appelant doit alors faire `return`).
 */
function requireAuth(req, res) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: "Authentification requise. En-tête 'Authorization: Bearer <token>' manquant." });
    return null;
  }

  const token = header.slice('Bearer '.length);

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401).json({ error: 'Jeton invalide ou expiré : ' + err.message });
    return null;
  }
}

/**
 * Vérifie qu'un utilisateur (payload JWT décodé par requireAuth) a le droit
 * de voir/modifier un projet donné.
 *   - role 'admin' : accès à tous les projets, aucune requête nécessaire.
 *   - role 'client' : le projet doit figurer dans la table user_projects.
 * Écrit une réponse 400/403 et retourne false si l'accès doit être refusé ;
 * l'appelant doit alors faire `return`.
 */
async function requireProjectAccess(req, res, user, projectId) {
  const { query } = require('./db');

  if (!projectId) {
    res.status(400).json({ error: 'Le paramètre "projectId" est requis.' });
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  const result = await query(
    `SELECT 1 FROM user_projects WHERE user_id = $1 AND project_id = $2`,
    [user.sub, projectId]
  );

  if (result.rows.length === 0) {
    res.status(403).json({ error: "Accès refusé : votre compte n'a pas accès à ce projet." });
    return false;
  }

  return true;
}

/**
 * Vérifie qu'un utilisateur a le rôle 'admin'. À utiliser pour les actions
 * réservées à Catalyste (créer un projet, une ressource, un compte client...).
 * Écrit une réponse 403 et retourne false si le rôle est insuffisant.
 */
function requireAdmin(res, user) {
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Action réservée aux comptes administrateur.' });
    return false;
  }
  return true;
}

module.exports = { requireAuth, requireProjectAccess, requireAdmin };
