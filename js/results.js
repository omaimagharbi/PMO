// ============================================================================
// results.js
// ============================================================================
const resultsUser = Store.requireAuth('index.html');
if (resultsUser) {
  renderTopbar(null);

  const params = new URLSearchParams(window.location.search);
  const attemptId = params.get('id');
  const attempt = Store.getAttempt(attemptId);

  if (!attempt || attempt.username !== resultsUser.username) {
    document.querySelector('.page').innerHTML = `<div class="empty-state"><div class="glyph">🔍</div>Tentative introuvable.<br><a href="dashboard.html" class="btn btn-primary" style="margin-top:1rem">Retour au tableau de bord</a></div>`;
  } else {
    const allQuestions = Store.getAllQuestions();
    const byId = Object.fromEntries(allQuestions.map(q => [q.id, q]));
    const pct = Math.round((attempt.score / attempt.total) * 100);
    const passed = pct >= 61; // seuil indicatif (PMI ne publie pas de barre officielle)

    document.getElementById('result-eyebrow').textContent = examLabelR(attempt.examId);
    document.getElementById('result-title').textContent = passed ? 'Bien joué — niveau solide' : 'Continue à t\'entraîner';
    document.getElementById('result-summary').innerHTML = `
      <b>${attempt.score} / ${attempt.total}</b> bonnes réponses en ${formatDuration(attempt.durationSeconds)}.<br>
      Passé le ${formatDate(attempt.date)}.<br><br>
      <span style="font-size:.85rem;color:var(--ink-600)">Seuil indicatif de réussite : 61%. Le PMI ne communique pas de barre officielle — vise la régularité sur les trois domaines plutôt qu'un seul score.</span>`;
    document.getElementById('retry-link').href = `quiz.html?exam=${attempt.examId}`;

    // score ring
    drawRing('ring-svg', pct);
    document.querySelector('#ring-num').innerHTML = `<span>Score</span>${pct}%`;

    // domain compass
    const domainStats = { People: { correct: 0, total: 0 }, Process: { correct: 0, total: 0 }, Business: { correct: 0, total: 0 } };
    attempt.answers.forEach(a => {
      if (!domainStats[a.domain]) return;
      domainStats[a.domain].total++;
      if (a.correct) domainStats[a.domain].correct++;
    });
    renderCompass('compass-mount', domainStats);

    // review list
    const reviewMount = document.getElementById('review-mount');
    reviewMount.innerHTML = attempt.answers.map((a, idx) => {
      const q = byId[a.questionId];
      if (!q) return '';
      return `
        <div class="review-item card">
          <span class="q-domain ${a.domain}">${DOMAIN_META[a.domain]?.label || a.domain}</span>
          <div class="q-text">${idx + 1}. ${q.text}</div>
          <div class="options">
            ${['A', 'B', 'C', 'D'].filter(l => q.options[l]).map(letter => {
              let cls = '';
              if (letter === a.correctAnswer) cls = 'correct';
              else if (letter === a.chosen && letter !== a.correctAnswer) cls = 'incorrect';
              return `<div class="option ${cls}">
                <span class="letter">${letter}</span>
                <span class="option-text">${q.options[letter]}</span>
              </div>`;
            }).join('')}
          </div>
          ${!a.chosen ? `<div class="banner warn" style="margin-top:1rem">Non répondue.</div>` : ''}
          ${q.justification ? `<div class="justification show"><b>Justification —</b> ${q.justification}</div>` : ''}
        </div>`;
    }).join('');
  }
}

function examLabelR(examId) {
  const map = { 0: 'Examen mixte', 1: 'Examen blanc I', 2: 'Examen éclair', 3: 'Examen blanc II' };
  return map[examId] || `Examen ${examId}`;
}

function drawRing(svgId, pct) {
  const svg = document.getElementById(svgId);
  const size = 150, stroke = 12, r = (size - stroke) / 2, c = size / 2;
  const circumference = 2 * Math.PI * r;
  const len = (pct / 100) * circumference;
  const color = pct >= 61 ? 'var(--good)' : (pct >= 40 ? 'var(--brass)' : 'var(--bad)');
  svg.innerHTML = `
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--paper-dim)" stroke-width="${stroke}"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${len} ${circumference - len}" stroke-linecap="round"
      transform="rotate(-90 ${c} ${c})"/>`;
}
