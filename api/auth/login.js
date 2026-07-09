const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../_lib/db');

if (!process.env.JWT_SECRET) {
  throw new Error("Variable d'environnement JWT_SECRET manquante.");
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    res.status(400).json({ error: 'Les champs "email" et "password" sont requis.' });
    return;
  }

  let user;
  try {
    const result = await query(
      `SELECT id, email, password_hash, role, full_name FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    user = result.rows[0];
  } catch (err) {
    res.status(500).json({ error: 'Erreur de lecture du compte : ' + err.message });
    return;
  }

  // Message volontairement identique que l'email existe ou non, pour ne pas
  // révéler quels emails sont enregistrés (énumération de comptes).
  const invalidCredentialsMsg = 'Email ou mot de passe incorrect.';

  if (!user) {
    res.status(401).json({ error: invalidCredentialsMsg });
    return;
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    res.status(401).json({ error: invalidCredentialsMsg });
    return;
  }

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.status(200).json({
    token,
    expiresIn: '12h',
    user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name }
  });
};
