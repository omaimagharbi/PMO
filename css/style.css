/* ==========================================================================
   PMP Simulateur — Design tokens
   Direction: "sceau de certification" — encre marine, laiton bruni, papier
   Signature: le "compas des domaines" (People / Process / Business) qui
   reprend la répartition officielle PMI (42% / 50% / 8%) partout où un
   score est affiché.
   ========================================================================== */

@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root{
  /* Palette */
  --ink-900:#141b2e;
  --ink-800:#1b2a4a;
  --ink-700:#233457;
  --ink-600:#3a4a70;
  --paper:#f1efe6;
  --paper-dim:#e7e3d5;
  --paper-line:#d8d3c0;
  --brass:#a9782f;
  --brass-light:#c99a4a;
  --white:#fffdf8;

  /* Domain colors — tuned so they read distinctly on both paper & ink */
  --dom-people:#2c7a6d;
  --dom-people-bg:#e3efec;
  --dom-process:#2f5c8f;
  --dom-process-bg:#e4ecf5;
  --dom-business:#a2552b;
  --dom-business-bg:#f3e6db;

  --good:#2f7a4f;
  --bad:#a3392b;

  /* Type */
  --font-display:'Source Serif 4', Georgia, serif;
  --font-body:'IBM Plex Sans', -apple-system, sans-serif;
  --font-mono:'IBM Plex Mono', 'SF Mono', monospace;

  /* Layout */
  --radius-s:4px;
  --radius-m:8px;
  --radius-l:14px;
  --shadow-card:0 1px 2px rgba(20,27,46,0.06), 0 4px 16px rgba(20,27,46,0.08);
  --shadow-lift:0 8px 30px rgba(20,27,46,0.18);
}

*{ box-sizing:border-box; }
html{ -webkit-font-smoothing:antialiased; }

body{
  margin:0;
  font-family:var(--font-body);
  background:var(--paper);
  color:var(--ink-900);
  line-height:1.5;
}

a{ color:inherit; }

h1,h2,h3,h4{
  font-family:var(--font-display);
  font-weight:600;
  margin:0 0 .4em;
  letter-spacing:-0.01em;
  color:var(--ink-900);
}

.eyebrow{
  font-family:var(--font-mono);
  font-size:.72rem;
  letter-spacing:.14em;
  text-transform:uppercase;
  color:var(--brass);
  font-weight:600;
}

button, input, select, textarea{ font-family:inherit; font-size:1rem; }

:focus-visible{
  outline:2px solid var(--brass);
  outline-offset:2px;
}

/* ---------- Buttons ---------- */
.btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:.5em;
  padding:.72em 1.4em;
  border-radius:var(--radius-m);
  border:1px solid transparent;
  font-weight:600;
  font-size:.92rem;
  cursor:pointer;
  transition:transform .12s ease, box-shadow .12s ease, background .15s ease, border-color .15s ease;
  text-decoration:none;
}
.btn:active{ transform:translateY(1px); }
.btn-primary{ background:var(--ink-900); color:var(--white); }
.btn-primary:hover{ background:var(--ink-700); }
.btn-brass{ background:var(--brass); color:var(--white); }
.btn-brass:hover{ background:var(--brass-light); }
.btn-ghost{ background:transparent; color:var(--ink-900); border-color:var(--paper-line); }
.btn-ghost:hover{ border-color:var(--ink-600); }
.btn-danger{ background:transparent; color:var(--bad); border-color:rgba(163,57,43,.35); }
.btn-danger:hover{ background:rgba(163,57,43,.08); }
.btn-block{ width:100%; }
.btn-sm{ padding:.45em 1em; font-size:.82rem; }
.btn:disabled{ opacity:.45; cursor:not-allowed; }

/* ---------- Cards / surfaces ---------- */
.card{
  background:var(--white);
  border:1px solid var(--paper-line);
  border-radius:var(--radius-l);
  box-shadow:var(--shadow-card);
}

.field{ margin-bottom:1.1rem; }
.field label{
  display:block;
  font-size:.78rem;
  font-weight:600;
  letter-spacing:.02em;
  color:var(--ink-700);
  margin-bottom:.4em;
}
.field input, .field select, .field textarea{
  width:100%;
  padding:.7em .8em;
  border:1px solid var(--paper-line);
  border-radius:var(--radius-s);
  background:var(--white);
  color:var(--ink-900);
}
.field input:focus, .field select:focus, .field textarea:focus{
  border-color:var(--brass);
}
.field small{ display:block; margin-top:.35em; color:var(--ink-600); font-size:.76rem; }
.error-text{ color:var(--bad); font-size:.82rem; margin-top:.5rem; min-height:1.1em; }

/* ---------- Top nav ---------- */
.topbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:1rem 2rem;
  background:var(--ink-900);
  color:var(--paper);
}
.topbar .brand{
  display:flex; align-items:center; gap:.6rem;
  font-family:var(--font-display);
  font-weight:700;
  font-size:1.15rem;
  color:var(--white);
}
.topbar .brand .seal{ width:26px; height:26px; flex:none; }
.topbar nav{ display:flex; align-items:center; gap:1.4rem; font-size:.88rem; }
.topbar nav a{ color:var(--paper); opacity:.8; text-decoration:none; }
.topbar nav a:hover, .topbar nav a.active{ opacity:1; color:var(--brass-light); }
.topbar .user-chip{
  display:flex; align-items:center; gap:.6rem;
  font-family:var(--font-mono); font-size:.8rem; color:var(--paper); opacity:.85;
}

.page{
  max-width:1080px;
  margin:0 auto;
  padding:2.4rem 2rem 4rem;
}

/* ---------- Domain compass (signature element) ---------- */
.compass{ display:flex; align-items:center; gap:1.6rem; }
.compass svg{ flex:none; }
.compass-legend{ display:flex; flex-direction:column; gap:.55rem; font-size:.86rem; }
.compass-legend .row{ display:flex; align-items:center; gap:.55rem; }
.compass-legend .swatch{ width:10px; height:10px; border-radius:2px; flex:none; }
.compass-legend .val{ font-family:var(--font-mono); margin-left:auto; color:var(--ink-700); }

/* ---------- Auth screen ---------- */
.auth-shell{
  min-height:100vh;
  display:grid;
  grid-template-columns:1.05fr 1fr;
}
@media (max-width:880px){ .auth-shell{ grid-template-columns:1fr; } .auth-visual{ display:none; } }

.auth-visual{
  background:
    radial-gradient(ellipse at 20% 15%, rgba(169,120,47,.22), transparent 55%),
    linear-gradient(160deg, var(--ink-900), var(--ink-800) 60%, var(--ink-700));
  color:var(--paper);
  padding:3.2rem;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  position:relative;
  overflow:hidden;
}
.auth-visual::after{
  content:"";
  position:absolute; inset:0;
  background-image:repeating-linear-gradient(115deg, rgba(255,255,255,.025) 0 1px, transparent 1px 90px);
  pointer-events:none;
}
.auth-visual .mark{ font-family:var(--font-mono); font-size:.75rem; letter-spacing:.18em; text-transform:uppercase; color:var(--brass-light); }
.auth-visual h1{ color:var(--white); font-size:2.6rem; max-width:11ch; margin-top:1.2rem; }
.auth-visual p{ max-width:34ch; opacity:.78; font-size:1rem; }
.auth-visual .stat-row{ display:flex; gap:2.2rem; margin-top:2.4rem; }
.auth-visual .stat b{ display:block; font-family:var(--font-display); font-size:1.9rem; color:var(--brass-light); }
.auth-visual .stat span{ font-size:.78rem; opacity:.7; }

.auth-form{
  display:flex; align-items:center; justify-content:center;
  padding:2.5rem;
}
.auth-form-inner{ width:100%; max-width:380px; }
.tab-switch{ display:flex; border:1px solid var(--paper-line); border-radius:var(--radius-m); padding:3px; margin-bottom:1.8rem; background:var(--paper-dim); }
.tab-switch button{
  flex:1; padding:.6em; border:none; background:transparent; border-radius:6px;
  font-weight:600; font-size:.86rem; cursor:pointer; color:var(--ink-700);
}
.tab-switch button.active{ background:var(--white); color:var(--ink-900); box-shadow:var(--shadow-card); }

/* ---------- Dashboard ---------- */
.grid-3{ display:grid; grid-template-columns:repeat(3,1fr); gap:1.1rem; }
.grid-2{ display:grid; grid-template-columns:1.3fr 1fr; gap:1.4rem; }
@media (max-width:760px){ .grid-3{ grid-template-columns:1fr; } .grid-2{ grid-template-columns:1fr; } }

.exam-card{ padding:1.6rem; display:flex; flex-direction:column; gap:.9rem; }
.exam-card .tag{
  align-self:flex-start;
  font-family:var(--font-mono); font-size:.68rem; letter-spacing:.08em; text-transform:uppercase;
  padding:.28em .6em; border-radius:20px; background:var(--paper-dim); color:var(--ink-700);
}
.exam-card h3{ font-size:1.25rem; margin:0; }
.exam-card p{ color:var(--ink-700); font-size:.88rem; margin:0; flex:1; }
.exam-card .meta{ font-family:var(--font-mono); font-size:.78rem; color:var(--ink-600); }

.section-title{ display:flex; align-items:baseline; justify-content:space-between; margin:2.6rem 0 1rem; }
.section-title h2{ font-size:1.3rem; margin:0; }

.stat-strip{ display:flex; gap:1rem; }
.stat-box{ flex:1; padding:1.1rem 1.3rem; }
.stat-box .n{ font-family:var(--font-display); font-size:2rem; color:var(--ink-900); }
.stat-box .l{ font-size:.78rem; color:var(--ink-600); }

table.history{ width:100%; border-collapse:collapse; font-size:.88rem; }
table.history th{ text-align:left; font-size:.72rem; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-600); padding:.6em .8em; border-bottom:1px solid var(--paper-line); }
table.history td{ padding:.7em .8em; border-bottom:1px solid var(--paper-line); }
table.history tr:last-child td{ border-bottom:none; }
.pill{ font-family:var(--font-mono); font-size:.76rem; padding:.2em .55em; border-radius:20px; }
.pill.good{ background:rgba(47,122,79,.12); color:var(--good); }
.pill.bad{ background:rgba(163,57,43,.12); color:var(--bad); }

/* ---------- Quiz ---------- */
.quiz-shell{ max-width:760px; margin:0 auto; padding:2rem 1.5rem 5rem; }
.quiz-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.6rem; font-family:var(--font-mono); font-size:.82rem; color:var(--ink-700); }
.progress-track{ height:6px; border-radius:6px; background:var(--paper-dim); overflow:hidden; margin-bottom:1.8rem; }
.progress-fill{ height:100%; background:var(--brass); transition:width .25s ease; }
.timer{ font-family:var(--font-mono); font-weight:600; }
.timer.low{ color:var(--bad); }

.q-domain{ display:inline-block; font-family:var(--font-mono); font-size:.7rem; letter-spacing:.08em; text-transform:uppercase; padding:.25em .6em; border-radius:20px; margin-bottom:1rem; }
.q-domain.People{ background:var(--dom-people-bg); color:var(--dom-people); }
.q-domain.Process{ background:var(--dom-process-bg); color:var(--dom-process); }
.q-domain.Business{ background:var(--dom-business-bg); color:var(--dom-business); }

.q-card{ padding:2rem; margin-bottom:1.5rem; }
.q-text{ font-size:1.12rem; line-height:1.55; margin-bottom:1.5rem; }

.options{ display:flex; flex-direction:column; gap:.7rem; }
.option{
  display:flex; align-items:flex-start; gap:.8rem;
  border:1px solid var(--paper-line); border-radius:var(--radius-m);
  padding:.85em 1em; cursor:pointer; transition:border-color .12s, background .12s;
}
.option:hover{ border-color:var(--brass-light); }
.option.selected{ border-color:var(--brass); background:#fbf3e4; }
.option .letter{
  flex:none; width:26px; height:26px; border-radius:50%;
  border:1px solid var(--paper-line); display:flex; align-items:center; justify-content:center;
  font-family:var(--font-mono); font-size:.78rem; font-weight:600; color:var(--ink-700);
}
.option.selected .letter{ background:var(--brass); border-color:var(--brass); color:var(--white); }
.option.correct{ border-color:var(--good); background:rgba(47,122,79,.07); }
.option.correct .letter{ background:var(--good); border-color:var(--good); color:var(--white); }
.option.incorrect{ border-color:var(--bad); background:rgba(163,57,43,.07); }
.option.incorrect .letter{ background:var(--bad); border-color:var(--bad); color:var(--white); }
.option-text{ font-size:.94rem; padding-top:2px; }

.justification{
  margin-top:1.2rem; padding:1rem 1.1rem; border-radius:var(--radius-m);
  background:var(--paper-dim); font-size:.88rem; color:var(--ink-700); display:none;
}
.justification.show{ display:block; }
.justification b{ color:var(--ink-900); }

.quiz-nav{ display:flex; justify-content:space-between; align-items:center; gap:1rem; }
.quiz-nav .spacer{ flex:1; }
.q-dots{ display:flex; flex-wrap:wrap; gap:.35rem; margin:1.6rem 0; }
.q-dot{
  width:26px; height:26px; border-radius:6px; border:1px solid var(--paper-line);
  background:var(--white); font-family:var(--font-mono); font-size:.7rem;
  display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-600);
}
.q-dot.answered{ background:var(--paper-dim); border-color:var(--ink-600); color:var(--ink-900); }
.q-dot.current{ border-color:var(--brass); box-shadow:0 0 0 2px rgba(169,120,47,.25); }

/* ---------- Results ---------- */
.score-hero{ display:flex; align-items:center; gap:2.4rem; padding:2.2rem; }
.score-ring{ position:relative; width:150px; height:150px; flex:none; }
.score-ring .num{
  position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  font-family:var(--font-display); font-size:2.1rem; color:var(--ink-900);
}
.score-ring .num span{ font-family:var(--font-mono); font-size:.7rem; color:var(--ink-600); }

.review-item{ padding:1.4rem 1.6rem; margin-bottom:1rem; }
.review-item .q-text{ font-size:1rem; margin-bottom:1rem; }

/* ---------- Admin ---------- */
.admin-tabs{ display:flex; gap:.4rem; margin-bottom:1.6rem; border-bottom:1px solid var(--paper-line); }
.admin-tabs button{
  padding:.8em 1.1em; border:none; background:transparent; cursor:pointer;
  font-weight:600; font-size:.9rem; color:var(--ink-600); border-bottom:2px solid transparent; margin-bottom:-1px;
}
.admin-tabs button.active{ color:var(--ink-900); border-color:var(--brass); }

table.admin-table{ width:100%; border-collapse:collapse; font-size:.86rem; }
table.admin-table th{ text-align:left; padding:.6em .7em; font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; color:var(--ink-600); border-bottom:1px solid var(--paper-line); }
table.admin-table td{ padding:.7em .7em; border-bottom:1px solid var(--paper-line); vertical-align:top; }
table.admin-table tr:hover{ background:var(--paper-dim); }

.modal-overlay{
  position:fixed; inset:0; background:rgba(20,27,46,.5);
  display:none; align-items:flex-start; justify-content:center; padding:3rem 1rem; z-index:50; overflow:auto;
}
.modal-overlay.show{ display:flex; }
.modal{ background:var(--white); border-radius:var(--radius-l); max-width:640px; width:100%; padding:1.8rem; box-shadow:var(--shadow-lift); }
.modal h3{ margin-bottom:1.2rem; }
.modal-actions{ display:flex; justify-content:flex-end; gap:.7rem; margin-top:1.4rem; }

.empty-state{ text-align:center; padding:3rem 1rem; color:var(--ink-600); }
.empty-state .glyph{ font-size:2rem; margin-bottom:.6rem; }

.banner{
  padding:.9em 1.1em; border-radius:var(--radius-m); font-size:.86rem; margin-bottom:1.4rem;
  border:1px solid var(--paper-line); background:var(--paper-dim); color:var(--ink-700);
}
.banner.warn{ background:#f8ecd8; border-color:#e5cb9a; color:#7a5310; }

.toast{
  position:fixed; bottom:1.6rem; right:1.6rem; background:var(--ink-900); color:var(--white);
  padding:.9em 1.2em; border-radius:var(--radius-m); font-size:.86rem; box-shadow:var(--shadow-lift);
  opacity:0; transform:translateY(10px); transition:opacity .2s, transform .2s; z-index:100;
}
.toast.show{ opacity:1; transform:translateY(0); }

footer.foot{ text-align:center; color:var(--ink-600); font-size:.78rem; padding:2rem; }

@media (max-width:600px){
  .score-hero{ flex-direction:column; text-align:center; }
  .grid-2{ grid-template-columns:1fr; }
  .topbar{ padding:.9rem 1.1rem; }
  .topbar nav{ display:none; }
}
