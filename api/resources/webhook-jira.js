const crypto = require('crypto');
const { query } = require('../_lib/db');

if (!process.env.JIRA_WEBHOOK_SECRET) {
  throw new Error(
    "Variable d'environnement JIRA_WEBHOOK_SECRET manquante. Générez un secret partagé et configurez-le à la fois ici et dans le webhook Jira (Jira Automation ou app tierce type 'Webhook for Jira')."
  );
}

function isValidSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', process.env.JIRA_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-jira-signature'];

  if (!isValidSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Signature de webhook invalide.' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    res.status(400).json({ error: 'Corps de requête JSON invalide.' });
    return;
  }

  // Événement attendu : worklog_created / worklog_updated
  // Documentation Jira : https://developer.atlassian.com/cloud/jira/software/webhooks/
  const worklog = payload.worklog;
  if (!worklog || !worklog.author || !worklog.author.accountId) {
    res.status(422).json({ error: "Payload Jira sans worklog exploitable (author.accountId manquant)." });
    return;
  }

  const jiraAccountId = worklog.author.accountId;
  const secondsSpent = Number(worklog.timeSpentSeconds) || 0;
  const hoursLogged = Math.round((secondsSpent / 3600) * 100) / 100;
  const eventDate = worklog.started ? worklog.started.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const externalEventId = 'jira-worklog-' + worklog.id;

  try {
    const resourceResult = await query(
      `SELECT id FROM resources WHERE jira_account_id = $1 LIMIT 1`,
      [jiraAccountId]
    );

    if (resourceResult.rows.length === 0) {
      res.status(404).json({
        error: `Aucune ressource NEXUS associée au compte Jira ${jiraAccountId}. Renseignez le champ jira_account_id dans la table resources.`
      });
      return;
    }

    const resourceId = resourceResult.rows[0].id;
    const projectKey = payload.issue && payload.issue.fields && payload.issue.fields.project
      ? payload.issue.fields.project.key
      : null;

    await query(
      `INSERT INTO resource_load_events (resource_id, project_id, source, external_event_id, hours_logged, event_date, raw_payload)
       VALUES ($1, NULL, 'jira', $2, $3, $4, $5)
       ON CONFLICT (source, external_event_id) DO UPDATE
         SET hours_logged = EXCLUDED.hours_logged, raw_payload = EXCLUDED.raw_payload`,
      [resourceId, externalEventId, hoursLogged, eventDate, JSON.stringify(payload)]
    );

    res.status(200).json({ received: true, resourceId, hoursLogged, projectKey });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement de l'événement Jira : " + err.message });
  }
};
