// ============================================================================
// dashboard.js
// ============================================================================
const user = Store.requireAuth('index.html');
if (user) {
  renderTopbar('dashboard');

  document.getElementById('welcome-eyebrow').textContent = `Bienvenue, ${user.username}`;
  document.getElementById('welcome-title').textContent = "Prêt à t'entraîner ?";

  const allQuestions = Store.getAllQuestions();
  const attempts = Store.getAttemptsForUser(user.username).sort((a, b) => new Date(b.date) - new Date(a.date));

  // ---- stats globaux (compas) ----
  const domainStats = { People: { correct: 0, total: 0 }, Process: { correct: 0, total: 0 }, Business: { correct: 0, total: 0 } };
  attempts.forEach(a => {
    a.answers.forEach(ans => {
      const d = ans.domain;
      if (!domainStats[d]) return;
      domainStats[d].total++;
      if (ans.correct) domainStats[d].correct++;
    });
  });
  const hasAnyAttempt = attempts.length > 0;
  renderCompass('compass-mount', hasAnyAttempt ? domainStats : null);

  document.getElementById('stat-attempts').textContent = attempts.length;
  const best = attempts.reduce((m, a) => Math.max(m, Math.round((a.score / a.total) * 100)), 0);
  document.getElementById('stat-best').textContent = attempts.length ? `${best}%` : '—';

  // ---- exam cards ----
  const examDefs = [
    { id: 1, title: 'Examen blanc I', desc: '30 questions — les trois domaines PMI au grand complet.', count: allQuestions.filter(q => q.exam === 1).length },
    { id: 2, title: 'Examen éclair', desc: '5 questions situationnelles pour un entraînement rapide.', count: allQuestions.filter(q => q.exam === 2).length },
    { id: 3, title: 'Examen blanc II', desc: '30 questions — mises en situation avancées.', count: allQuestions.filter(q => q.exam === 3).length },
    { id: 0, title: 'Examen mixte', desc: 'Les 65 questions mélangées, pour une session complète.', count: allQuestions.length },
  ];
  const cardsMount = document.getElementById('exam-cards');
  cardsMount.innerHTML = examDefs.map(e => `
    <div class="exam-card card">
      <span class="tag">${e.count} questions</span>
      <h3>${e.title}</h3>
      <p>${e.desc}</p>
      <div class="meta">~${Math.max(1, Math.round(e.count * 1.5))} min estimées</div>
      <a href="quiz.html?exam=${e.id}" class="btn btn-primary btn-block">Démarrer</a>
    </div>`).join('');

  // ---- recent attempts ----
  const recentMount = document.getElementById('recent-table-mount');
  const recent = attempts.slice(0, 5);
  if (!recent.length) {
    recentMount.innerHTML = `<div class="empty-state"><div class="glyph">📋</div>Aucune tentative pour l'instant. Lance ton premier examen ci-dessus.</div>`;
  } else {
    recentMount.innerHTML = `
      <table class="history">
        <thead><tr><th>Examen</th><th>Date</th><th>Score</th><th>Durée</th><th></th></tr></thead>
        <tbody>
          ${recent.map(a => {
            const pct = Math.round((a.score / a.total) * 100);
            return `<tr>
              <td>${examLabel(a.examId)}</td>
              <td>${formatDate(a.date)}</td>
              <td><span class="pill ${pct >= 61 ? 'good' : 'bad'}">${a.score}/${a.total} · ${pct}%</span></td>
              <td>${formatDuration(a.durationSeconds)}</td>
              <td><a href="results.html?id=${a.id}" class="btn btn-ghost btn-sm">Revoir</a></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
}

function examLabel(examId) {
  const map = { 0: 'Examen mixte', 1: 'Examen blanc I', 2: 'Examen éclair', 3: 'Examen blanc II' };
  return map[examId] || `Examen ${examId}`;
}
