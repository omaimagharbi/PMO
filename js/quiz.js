// ============================================================================
// quiz.js — moteur de l'examen : chargement, navigation, minuteur, notation.
// ============================================================================
const quizUser = Store.requireAuth('index.html');
if (quizUser) {
  renderTopbar(null);

  const params = new URLSearchParams(window.location.search);
  const examId = parseInt(params.get('exam') ?? '0', 10);

  const allQuestions = Store.getAllQuestions();
  let questions = examId === 0 ? shuffle([...allQuestions]) : allQuestions.filter(q => q.exam === examId);
  if (!questions.length) questions = shuffle([...allQuestions]);

  let current = 0;
  const answers = {}; // questionId -> letter
  let seconds = 0;
  let timerHandle = null;
  let submitted = false;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startTimer() {
    timerHandle = setInterval(() => {
      seconds++;
      document.getElementById('quiz-timer').textContent = formatDuration(seconds);
    }, 1000);
  }
  startTimer();

  function renderQuestion() {
    const q = questions[current];
    document.getElementById('quiz-position').textContent = `Question ${current + 1}/${questions.length}`;
    document.getElementById('progress-fill').style.width = `${((current + 1) / questions.length) * 100}%`;

    const selected = answers[q.id];
    document.getElementById('question-mount').innerHTML = `
      <div class="card q-card">
        <span class="q-domain ${q.domain}">${DOMAIN_META[q.domain]?.label || q.domain}</span>
        <div class="q-text">${q.text}</div>
        <div class="options">
          ${['A', 'B', 'C', 'D'].filter(l => q.options[l]).map(letter => `
            <div class="option ${selected === letter ? 'selected' : ''}" data-letter="${letter}">
              <span class="letter">${letter}</span>
              <span class="option-text">${q.options[letter]}</span>
            </div>`).join('')}
        </div>
      </div>`;

    document.querySelectorAll('.option').forEach(el => {
      el.addEventListener('click', () => {
        answers[q.id] = el.dataset.letter;
        renderQuestion();
        renderDots();
      });
    });

    document.getElementById('btn-prev').disabled = current === 0;
    document.getElementById('btn-next').style.display = current === questions.length - 1 ? 'none' : 'inline-flex';
    document.getElementById('btn-submit').style.display = current === questions.length - 1 ? 'inline-flex' : 'none';
  }

  function renderDots() {
    document.getElementById('dots-mount').innerHTML = questions.map((q, i) => `
      <div class="q-dot ${answers[q.id] ? 'answered' : ''} ${i === current ? 'current' : ''}" data-idx="${i}">${i + 1}</div>
    `).join('');
    document.querySelectorAll('.q-dot').forEach(el => {
      el.addEventListener('click', () => { current = parseInt(el.dataset.idx, 10); renderQuestion(); renderDots(); });
    });
  }

  document.getElementById('btn-prev').addEventListener('click', () => { if (current > 0) { current--; renderQuestion(); renderDots(); } });
  document.getElementById('btn-next').addEventListener('click', () => { if (current < questions.length - 1) { current++; renderQuestion(); renderDots(); } });

  document.getElementById('btn-submit').addEventListener('click', () => {
    const unanswered = questions.length - Object.keys(answers).length;
    if (unanswered > 0) {
      const proceed = confirm(`Il te reste ${unanswered} question(s) sans réponse. Terminer quand même ?`);
      if (!proceed) return;
    }
    finishExam();
  });

  function finishExam() {
    if (submitted) return;
    submitted = true;
    clearInterval(timerHandle);

    const detailedAnswers = questions.map(q => {
      const chosen = answers[q.id] || null;
      return {
        questionId: q.id,
        domain: q.domain,
        chosen,
        correctAnswer: q.answer,
        correct: chosen === q.answer,
      };
    });
    const score = detailedAnswers.filter(a => a.correct).length;

    const attempt = {
      id: 'a_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      username: quizUser.username,
      examId,
      date: new Date().toISOString(),
      durationSeconds: seconds,
      score,
      total: questions.length,
      answers: detailedAnswers,
    };
    Store.saveAttempt(attempt);
    window.location.href = `results.html?id=${attempt.id}`;
  }

  window.addEventListener('beforeunload', (e) => {
    if (!submitted && Object.keys(answers).length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  renderQuestion();
  renderDots();
}
