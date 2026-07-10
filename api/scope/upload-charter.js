const formidable = require('formidable');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { query } = require('../_lib/db');
const { requireAuth, requireProjectAccess } = require('../_lib/auth');

// Vercel : on désactive le bodyParser natif car formidable gère le multipart lui-même.
module.exports.config = {
  api: {
    bodyParser: false
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utilisez POST.' });
    return;
  }

  const user = requireAuth(req, res);
  if (!user) return;

  const form = formidable({
    maxFileSize: 20 * 1024 * 1024, // 20 Mo
    keepExtensions: true
  });

  let fields;
  let files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err) {
    res.status(400).json({ error: "Échec du parsing du formulaire multipart : " + err.message });
    return;
  }

  const projectId = Array.isArray(fields.projectId) ? fields.projectId[0] : fields.projectId;
  const uploadedFile = Array.isArray(files.charter) ? files.charter[0] : files.charter;

  if (!projectId) {
    res.status(400).json({ error: 'Le champ "projectId" est requis.' });
    return;
  }

  if (!(await requireProjectAccess(req, res, user, projectId))) return;

  if (!uploadedFile) {
    res.status(400).json({ error: 'Aucun fichier reçu sous le champ "charter".' });
    return;
  }

  if (uploadedFile.mimetype !== 'application/pdf') {
    res.status(400).json({ error: 'Seuls les fichiers PDF sont acceptés pour la charte de projet.' });
    return;
  }

  let extractedText;
  let pageCount;
  try {
    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const parsed = await pdfParse(fileBuffer);
    extractedText = parsed.text.trim();
    pageCount = parsed.numpages;
  } catch (err) {
    res.status(422).json({ error: "Échec de l'extraction du texte du PDF : " + err.message });
    return;
  } finally {
    fs.unlink(uploadedFile.filepath, () => {});
  }

  if (extractedText.length < 50) {
    res.status(422).json({
      error: 'Le texte extrait est trop court pour constituer une charte de projet exploitable (PDF scanné sans OCR ?).'
    });
    return;
  }

  try {
    await query(
      `UPDATE scope_baselines SET is_active = false WHERE project_id = $1 AND is_active = true`,
      [projectId]
    );

    const insertResult = await query(
      `INSERT INTO scope_baselines (project_id, source_filename, extracted_text, page_count, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, uploaded_at`,
      [projectId, uploadedFile.originalFilename, extractedText, pageCount]
    );

    res.status(201).json({
      baselineId: insertResult.rows[0].id,
      uploadedAt: insertResult.rows[0].uploaded_at,
      pageCount,
      extractedCharacters: extractedText.length
    });
  } catch (err) {
    res.status(500).json({ error: "Échec de l'enregistrement en base de données : " + err.message });
  }
};
