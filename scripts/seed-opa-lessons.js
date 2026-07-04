/**
 * Seed des leçons apprises (OPA) de démonstration.
 *
 * À exécuter une seule fois après avoir configuré DATABASE_URL et
 * VOYAGE_API_KEY dans votre .env :
 *
 *   node scripts/seed-opa-lessons.js
 */

require('dotenv').config();
const { query } = require('../api/_lib/db');
const { embedText, toPgVectorLiteral } = require('../api/_lib/embeddings');

const lessons = [
  {
    projectReference: 'Projet Espagne (2024)',
    title: 'Migration de base de données',
    summary: "Arrêt de production de 14h suite à une incompatibilité de version majeure entre le moteur applicatif et la nouvelle version de la base de données.",
    solution: "Geler la version cible 3 semaines avant bascule, exécuter un test de compatibilité complet sur environnement miroir, prévoir une fenêtre de rollback de 4h."
  },
  {
    projectReference: 'Projet Maroc (2023)',
    title: 'Intégration API tierce',
    summary: "Intégration d'un fournisseur de paiement tiers retardée de 3 semaines suite à un changement de format d'API non communiqué en amont.",
    solution: "Exiger une clause de préavis de 30 jours sur toute évolution d'API dans le contrat fournisseur, et versionner systématiquement les intégrations critiques."
  },
  {
    projectReference: 'Projet Tunisie Nord (2025)',
    title: "Changement d'hébergeur cloud",
    summary: "Migration d'hébergeur cloud ayant entraîné une perte de configuration réseau non documentée, provoquant 6h d'indisponibilité.",
    solution: "Établir une checklist de migration incluant l'export exhaustif de la configuration réseau et un run de validation en environnement de recette avant bascule."
  }
];

async function main() {
  for (const lesson of lessons) {
    const textToEmbed = `${lesson.title}\n${lesson.summary}\n${lesson.solution}`;
    const embedding = await embedText(textToEmbed);

    await query(
      `INSERT INTO opa_lessons (project_reference, title, summary, solution, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [lesson.projectReference, lesson.title, lesson.summary, lesson.solution, toPgVectorLiteral(embedding)]
    );

    console.log(`✓ Leçon insérée : ${lesson.title} (${lesson.projectReference})`);
  }

  console.log('Seed terminé.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Échec du seed :', err.message);
  process.exit(1);
});
