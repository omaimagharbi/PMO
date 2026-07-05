const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Variable d'environnement DATABASE_URL manquante. Configurez-la avec votre chaîne de connexion Neon (ex: postgresql://user:password@host/db?sslmode=require)."
  );
}

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    pool.on('error', (err) => {
      console.error('Erreur inattendue sur le pool PostgreSQL (client inactif) :', err);
    });
  }
  return pool;
}

async function query(text, params) {
  const client = getPool();
  const start = Date.now();
  const result = await client.query(text, params);
  const durationMs = Date.now() - start;
  if (durationMs > 500) {
    console.warn(`Requête SQL lente (${durationMs}ms): ${text.slice(0, 120)}`);
  }
  return result;
}

module.exports = { getPool, query };
