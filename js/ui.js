// ============================================================================
// ui.js — petits utilitaires d'interface partagés entre les pages.
// ============================================================================

const DOMAIN_META = {
  People:   { label: 'Personnes',              color: 'var(--dom-people)',   weight: 42 },
  Process:  { label: 'Processus',               color: 'var(--dom-process)',  weight: 50 },
  Business: { label: 'Environnement commercial', color: 'var(--dom-business)', weight: 8 },
};

function renderTopbar(activePage) {
  const user = Store.currentUser();
  const mount = document.getElementById('topbar-mount');
  if (!mount) return;
  const links = [
    { href: 'dashboard.html', label: 'Tableau de bord', key: 'dashboard' },
    { href: 'history.html', label: 'Historique', key: 'history' },
  ];
  if (user && user.role === 'admin') {
    links.push({ href: 'admin.html', label: 'Administration', key: 'admin' });
  }
  mount.innerHTML = `
    <div class="topbar">
      <a class="brand" href="dashboard.html">${sealSVG(26)}<span>PMP Simulateur</span></a>
      <nav>
        ${links.map(l => `<a href="${l.href}" class="${activePage === l.key ? 'active' : ''}">${l.label}</a>`).join('')}
        ${user ? `<span class="user-chip">● ${user.username}${user.role === 'admin' ? ' (admin)' : ''}</span><a href="#" id="logout-link">Se déconnecter</a>` : ''}
      </nav>
    </div>`;
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      Store.logout();
      window.location.href = 'index.html';
    });
  }
}

function sealSVG(size) {
  return `<svg class="seal" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="14.5" stroke="#c99a4a" stroke-width="1.4"/>
    <circle cx="16" cy="16" r="10.5" stroke="#c99a4a" stroke-width="1"/>
    <path d="M16 8 L18.2 13.6 L24 14.2 L19.6 18 L21 23.6 L16 20.4 L11 23.6 L12.4 18 L8 14.2 L13.8 13.6 Z" fill="#c99a4a"/>
  </svg>`;
}

// Compas des domaines : anneau divisé selon People/Process/Business.
// `stats` = { People:{correct,total}, Process:{...}, Business:{...} } (optionnel)
// Si `stats` est omis, affiche simplement la pondération officielle PMI.
function renderCompass(mountId, stats) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const domains = Object.keys(DOMAIN_META);
  const size = 130, stroke = 16, r = (size - stroke) / 2, c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = domains.map(d => {
    const weight = DOMAIN_META[d].weight;
    const len = (weight / 100) * circumference;
    const seg = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${DOMAIN_META[d].color}"
      stroke-width="${stroke}" stroke-dasharray="${len} ${circumference - len}"
      stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})" stroke-linecap="butt"/>`;
    offset += len;
    return seg;
  }).join('');

  let centerLabel = `<span style="font-family:var(--font-mono);font-size:.68rem;color:var(--ink-600)">Pondération</span><b style="font-family:var(--font-display);font-size:1.05rem">PMI officielle</b>`;
  if (stats) {
    const totalCorrect = domains.reduce((s, d) => s + (stats[d]?.correct || 0), 0);
    const totalQ = domains.reduce((s, d) => s + (stats[d]?.total || 0), 0);
    const pct = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
    centerLabel = `<span style="font-family:var(--font-mono);font-size:.68rem;color:var(--ink-600)">Score</span><b style="font-family:var(--font-display);font-size:1.6rem">${pct}%</b>`;
  }

  mount.innerHTML = `
    <div class="compass">
      <div style="position:relative;width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}">${segments}</svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">${centerLabel}</div>
      </div>
      <div class="compass-legend">
        ${domains.map(d => {
          const s = stats && stats[d];
          const val = s ? `${s.correct}/${s.total}` : `${DOMAIN_META[d].weight}%`;
          return `<div class="row"><span class="swatch" style="background:${DOMAIN_META[d].color}"></span>${DOMAIN_META[d].label}<span class="val">${val}</span></div>`;
        }).join('')}
      </div>
    </div>`;
}

function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
