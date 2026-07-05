const crypto = require('crypto');
const { query } = require('../_lib/db');

if (!process.env.GITHUB_WEBHOOK_SECRET) {
  throw new Error(
    "Variable d'environnement GITHUB_WEBHOOK_SECRET manquante. Configurez-la dans Settings > Webhooks > Secret sur votre dépôt GitHub."
  );
}

module.exports.config = {
  api: {
    bodyParser: false
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isValidSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

// Estimation d'effort à partir du volume de code modifié.
// Hypothèse de calibrage initial, à ajuster avec des données réelles :
// 1 heure d'effort ≈ 40 lignes modifiées (additions + suppressions), plafonné à 6h/PR.
function estimateHoursFromDiff(additions, deletions) {
  const linesChanged = (additions || 0) + (deletions || 0);
  const rawHours = linesChanged / 40;
  return Math.min(Math.round(rawHours * 100) / 100, 6);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-hub-signature-256'];

  if (!isValidSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Signature de webhook invalide.' });
    return;
  }

  const githubEvent = req.headers['x-github-event'];
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    res.status(400).json({ error: 'Corps de requête JSON invalide.' });
    return;
  }

  if (githubEvent !== 'pull_request' || !['closed', 'synchronize'].includes(payload.action)) {
    res.status(202).json({ ignored: true, reason: `Événement ${githubEvent}/${payload.action} non traité.` });
    return;
  }

  const pr = payload.pull_request;
  if (payload.action === 'closed' && !pr.merged) {
    res.status(202).json({ ignored: true, reason: 'PR fermée sans merge, non comptabilisée.' });
    return;
  }

  const githubUsername = pr.user && pr.user.login;
  if (!githubUsername) {
    res.status(422).json({ error: 'Payload GitHub sans auteur de PR exploitable.' });
    return;
  }

  const hoursLogged = estimateHoursFromDiff(pr.additions, pr.deletions);
  const eventDate = (pr.merged_at || pr.updated_at || new Date().toISOString()).slice(0, 10);
  const externalEventId = 'github-pr-' + pr.id + '-' + payload.action;

  try {
    const resourceResult = await query(
      `SELECT id FROM resources WHERE github_username = $1 LIMIT 1`,
      [githubUsername]
    );

    if (resourceResult.rows.length === 0) {
      res.status(404).json({
        error: `Aucune ressource NEXUS associée au compte GitHub ${githubUsername}. Renseignez le champ github_username dans la table resources.`
      });
      return;
    }

    const resourceId = resourceResult.rows[0].id;

    await query(
      `INSERT INTO resource_load_events (resource_id, project_id, source, external_event_id, hours_logged, event_date, raw_payload)
       VALUES ($1, NULL, 'github', $2, $3, $4, $5)
       ON CONFLICT (source, external_event_id) DO UPDATE
         SET hours_logged = EXCLUDED.hours_logged, raw_payload = EXCLUDED.raw_payload`,
      [resourceId, externalEventId, hoursLogged, eventDate, JSON.stringify(payload)]
    );

    res.status(200).json({ received: true, resourceId, hoursLogged, prNumber: pr.number });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement de l'événement GitHub : " + err.message });
  }
};
