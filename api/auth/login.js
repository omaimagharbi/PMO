const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error("Variable d'environnement JWT_SECRET manquante.");
}

if (!process.env.ADMIN_PASSWORD) {
  throw new Error(
    "Variable d'environnement ADMIN_PASSWORD manquante. Définissez un mot de passe fort pour protéger l'accès à l'API NEXUS tant qu'il n'y a pas de gestion multi-utilisateurs."
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const { password } = req.body || {};

  if (!password) {
    res.status(400).json({ error: 'Le champ "password" est requis.' });
    return;
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Mot de passe incorrect.' });
    return;
  }

  const token = jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.status(200).json({ token, expiresIn: '12h' });
};
