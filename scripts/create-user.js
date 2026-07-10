/**
 * Création d'un compte utilisateur NEXUS (Phase 1 — fondations multi-clients).
 *
 * À exécuter après avoir appliqué sql/migrations/003_multi_tenant_foundations.sql
 * et configuré DATABASE_URL dans votre .env :
 *
 *   node scripts/create-user.js --email vous@catalyste.tn --password "MotDePasseFort123" --role admin
 *   node scripts/create-user.js --email client@meridia.tn --password "MotDePasseTemporaire456" --role client --project <UUID_PROJET> --name "Méridia Conseil"
 *
 * Options :
 *   --email     (requis)  adresse email du compte
 *   --password  (requis)  mot de passe en clair (sera haché, jamais stocké tel quel)
 *   --role      (optionnel, défaut "client") "admin" ou "client"
 *   --project   (optionnel, requis en pratique si role=client) UUID du projet auquel donner accès
 *   --name      (optionnel) nom complet affiché
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('../api/_lib/db');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = value;
      if (value !== true) i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const email = args.email;
  const password = args.password;
  const role = args.role || 'client';
  const projectId = args.project || null;
  const fullName = args.name || null;

  if (!email || !password) {
    console.error('Usage : node scripts/create-user.js --email <email> --password <mot de passe> [--role admin|client] [--project <UUID>] [--name "Nom"]');
    process.exit(1);
  }

  if (!['admin', 'client'].includes(role)) {
    console.error('Le rôle doit être "admin" ou "client".');
    process.exit(1);
  }

  if (role === 'client' && !projectId) {
    console.warn('⚠ Aucun --project fourni pour un compte client : ce compte n\'aura accès à aucun projet tant qu\'on ne le lui affecte pas.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await query(
      `INSERT INTO users (email, password_hash, role, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, role`,
      [email.trim().toLowerCase(), passwordHash, role, fullName]
    );

    const user = result.rows[0];
    console.log(`✓ Compte créé : ${user.email} (rôle: ${user.role}, id: ${user.id})`);

    if (role === 'client' && projectId) {
      await query(
        `INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [user.id, projectId]
      );
      console.log(`✓ Accès accordé au projet ${projectId}.`);
    }

    process.exit(0);
  } catch (err) {
    if (err.code === '23505') {
      console.error(`Échec : un compte existe déjà avec l'email "${email}".`);
    } else {
      console.error('Échec de la création du compte :', err.message);
    }
    process.exit(1);
  }
}

main();
