(function () {
  'use strict';

  /* ============================================================
     AUTHENTIFICATION (jeton JWT en mémoire, non persisté par choix
     de sécurité — se reconnecter à chaque rechargement de page)
  ============================================================ */

  var authToken = null;

  function authHeaders(extra) {
    var headers = Object.assign({}, extra || {});
    if (authToken) {
      headers.Authorization = 'Bearer ' + authToken;
    }
    return headers;
  }

  function setAuthStatus(text, isError) {
    var el = document.getElementById('authStatus');
    el.textContent = text;
    el.className = 'text-xs ' + (isError ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400');
  }

  async function login() {
    var password = document.getElementById('adminPasswordInput').value;
    if (!password) {
      setAuthStatus('Saisissez le mot de passe.', true);
      return;
    }

    try {
      var response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
      });
      var data = await response.json();

      if (!response.ok) {
        setAuthStatus('Échec : ' + data.error, true);
        return;
      }

      authToken = data.token;
      document.getElementById('adminPasswordInput').value = '';
      setAuthStatus('✓ Connecté (jeton valide ' + data.expiresIn + ').', false);
    } catch (err) {
      setAuthStatus('Erreur réseau : ' + err.message, true);
    }
  }

  function initAuth() {
    document.getElementById('loginBtn').addEventListener('click', login);
  }

  /* ============================================================
     CONFIGURATION PARTAGÉE (ID projet persistant en local)
  ============================================================ */

  var STORAGE_KEY_PROJECT = 'nexus-project-id';

  function getProjectId() {
    return document.getElementById('projectIdInput').value.trim();
  }

  function setConfigStatus(text, isError) {
    var el = document.getElementById('configStatus');
    el.textContent = text;
    el.className = 'text-xs -mt-4 mb-6 ' + (isError ? 'text-red-600 dark:text-red-400' : 'text-navy-500 dark:text-navy-400');
  }

  function initConfigBar() {
    var input = document.getElementById('projectIdInput');
    var saved = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY_PROJECT);
    } catch (err) {
      saved = null;
    }
    if (saved) {
      input.value = saved;
    }

    input.addEventListener('change', function () {
      try {
        window.localStorage.setItem(STORAGE_KEY_PROJECT, input.value.trim());
      } catch (err) {
        /* stockage local indisponible, on ignore */
      }
    });

    document.getElementById('uploadCharterBtn').addEventListener('click', uploadCharter);
  }

  async function uploadCharter() {
    var projectId = getProjectId();
    var fileInput = document.getElementById('charterFileInput');
    var file = fileInput.files[0];

    if (!projectId) {
      setConfigStatus("Renseignez d'abord l'ID du projet avant de téléverser une charte.", true);
      return;
    }
    if (!file) {
      setConfigStatus('Sélectionnez un fichier PDF avant de téléverser.', true);
      return;
    }

    setConfigStatus('Téléversement et extraction du PDF en cours…', false);

    var formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('charter', file);

    try {
      var response = await fetch('/api/scope/upload-charter', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      var data = await response.json();

      if (!response.ok) {
        setConfigStatus('Erreur : ' + data.error, true);
        return;
      }

      setConfigStatus(
        '✓ Charte enregistrée comme Scope Baseline (' + data.pageCount + ' pages, ' + data.extractedCharacters + ' caractères extraits).',
        false
      );
      addS1Log('Charte de projet téléversée et indexée comme nouvelle Scope Baseline.');
    } catch (err) {
      setConfigStatus('Erreur réseau lors du téléversement : ' + err.message, true);
    }
  }

  /* ============================================================
     SCÉNARIO 01 — GANTT + DÉTECTION DE SCOPE CREEP (RÉEL)
  ============================================================ */

  var TIMELINE_MAX_BASE = 65;

  var baseTasks = [
    { id: 'cadrage', name: 'Cadrage & spécifications', start: 0, duration: 8, color: 'bg-navy-500' },
    { id: 'dev', name: 'Développement Core', start: 8, duration: 25, color: 'bg-navy-700' },
    { id: 'tests', name: 'Tests & recette', start: 33, duration: 12, color: 'bg-navy-500' },
    { id: 'deploy', name: 'Déploiement & formation', start: 45, duration: 8, color: 'bg-navy-700' }
  ];

  var lastAnalysis = null;

  function currentTimelineMax(extraDays) {
    return TIMELINE_MAX_BASE + (extraDays || 0);
  }

  function computeTasks(extraDays) {
    if (!extraDays) {
      return baseTasks;
    }
    var shifted = baseTasks.map(function (t) {
      if (t.id === 'tests' || t.id === 'deploy') {
        return Object.assign({}, t, { start: t.start + extraDays });
      }
      return t;
    });
    var withExtra = shifted.slice();
    withExtra.splice(2, 0, {
      id: 'extra',
      name: 'Périmètre additionnel (hors baseline)',
      start: 33,
      duration: extraDays,
      color: 'bg-gold-500'
    });
    return withExtra;
  }

  function renderGantt(extraDays) {
    var container = document.getElementById('ganttRows');
    var tasks = computeTasks(extraDays);
    var max = currentTimelineMax(extraDays);
    container.innerHTML = '';

    tasks.forEach(function (t) {
      var leftPct = (t.start / max) * 100;
      var widthPct = (t.duration / max) * 100;
      var row = document.createElement('div');
      row.className = 'flex items-center gap-3';

      var labelClass = t.id === 'extra'
        ? 'text-gold-700 dark:text-gold-400'
        : 'text-navy-700 dark:text-navy-200';

      row.innerHTML =
        '<div class="w-[27%] shrink-0 text-xs font-medium ' + labelClass + ' truncate">' + t.name + '</div>' +
        '<div class="relative flex-1 h-6 bg-navy-900/5 dark:bg-white/5 rounded-md overflow-hidden">' +
        '<div class="bar absolute top-0.5 h-5 rounded ' + t.color + ' flex items-center justify-end pr-1.5" ' +
        'style="left:' + leftPct + '%; width:' + widthPct + '%;">' +
        '<span class="font-mono-num text-[10px] text-white/90">' + t.duration + 'j</span>' +
        '</div></div>';

      container.appendChild(row);
    });

    document.getElementById('tlEnd').textContent = 'J' + Math.round(max);
  }

  function addS1Log(text) {
    var log = document.getElementById('s1Log');
    var entry = document.createElement('div');
    var time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.className = 'fade-in';
    entry.textContent = '[' + time + '] ' + text;
    log.prepend(entry);
  }

  function appendChatBubble(from, text, highlight) {
    var feed = document.getElementById('chatFeed');
    var wrap = document.createElement('div');
    wrap.className = 'fade-in flex ' + (from === 'client' ? 'justify-start' : 'justify-end');

    var bubbleBase = 'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm';
    var bubbleClasses;

    if (from === 'client') {
      bubbleClasses = highlight
        ? bubbleBase + ' rounded-tl-sm bg-gold-500/20 border border-gold-500/40'
        : bubbleBase + ' rounded-tl-sm bg-navy-100/70 dark:bg-white/10';
    } else if (from === 'system') {
      bubbleClasses = bubbleBase + ' rounded-tr-sm bg-red-500/10 border border-red-400/40 text-red-700 dark:text-red-400';
    } else {
      bubbleClasses = bubbleBase + ' rounded-tr-sm bg-navy-800 dark:bg-navy-700 text-white';
    }

    wrap.innerHTML = '<div class="' + bubbleClasses + '">' + text + '</div>';
    feed.appendChild(wrap);
    feed.scrollTop = feed.scrollHeight;
    return wrap;
  }

  var messageTexts = {
    demo: "Quand aura-t-on la démo de la V1 ?",
    color: "Peut-on changer la couleur du bouton principal ?",
    offline: "Je veux ajouter une option hors-ligne complète pour l'appli mobile"
  };

  async function sendClientMessage(type) {
    var projectId = getProjectId();
    var messageText = messageTexts[type];

    if (!projectId) {
      setConfigStatus("Renseignez l'ID du projet en haut de page avant de simuler un message.", true);
      return;
    }

    appendChatBubble('client', messageText, type === 'offline');
    addS1Log('Message client reçu — envoi à /api/scope/analyze-message pour analyse réelle…');

    var thinkingBubble = appendChatBubble('system', '🔍 Analyse en cours via Claude — comparaison avec la Scope Baseline…');

    try {
      var response = await fetch('/api/scope/analyze-message', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ projectId: projectId, clientMessage: messageText })
      });
      var data = await response.json();
      thinkingBubble.remove();

      if (!response.ok) {
        appendChatBubble('system', "Erreur d'analyse : " + data.error);
        addS1Log('⚠ Échec de l\'analyse : ' + data.error);
        return;
      }

      lastAnalysis = data;

      if (!data.isScopeCreep) {
        appendChatBubble('assistant', data.rationale);
        addS1Log('Analyse Claude : conforme au périmètre (confiance ' + Math.round(data.confidence * 100) + '%).');
        return;
      }

      appendChatBubble('system', '🔍 Analyse Claude : ' + data.rationale);
      applyScopeCreep(data);
    } catch (err) {
      thinkingBubble.remove();
      appendChatBubble('system', 'Erreur réseau : ' + err.message);
      addS1Log('⚠ Erreur réseau lors de l\'appel à /api/scope/analyze-message.');
    }
  }

  function applyScopeCreep(data) {
    renderGantt(data.estimatedExtraDays);

    var banner = document.getElementById('alertBanner');
    document.getElementById('alertRationale').textContent = data.rationale;

    var chipsContainer = document.getElementById('alertChips');
    chipsContainer.innerHTML =
      '<span class="chip">+' + data.estimatedExtraDays + ' jours</span>' +
      '<span class="chip">+' + data.estimatedExtraCostEur.toLocaleString('fr-FR') + ' € HT</span>' +
      '<span class="chip">confiance ' + Math.round(data.confidence * 100) + '%</span>';

    banner.classList.remove('hidden');
    document.getElementById('crConfirmed').classList.add('hidden');

    var status = document.getElementById('ganttStatus');
    status.textContent = 'Dérive détectée';
    status.className = 'badge badge-red';

    addS1Log('⚠ Dérive confirmée par Claude — planning recalculé (+' + data.estimatedExtraDays + 'j), impact +' + data.estimatedExtraCostEur + '€.');
  }

  async function signCR() {
    if (!lastAnalysis || !lastAnalysis.analysisId) {
      addS1Log("Aucune analyse de dérive en attente de signature.");
      return;
    }

    addS1Log('Signature de la CR en cours — enregistrement en base…');

    try {
      var response = await fetch('/api/scope/sign-cr', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ analysisId: lastAnalysis.analysisId })
      });
      var data = await response.json();

      if (!response.ok) {
        addS1Log('⚠ Échec de la signature : ' + data.error);
        return;
      }

      document.getElementById('alertBanner').classList.add('hidden');
      document.getElementById('crConfirmedTitle').textContent = '✓ ' + data.referenceCode + ' signée par le client';
      document.getElementById('crConfirmed').classList.remove('hidden');

      var status = document.getElementById('ganttStatus');
      status.textContent = 'CR signée — baseline à jour';
      status.className = 'badge badge-gold';

      appendChatBubble('assistant', 'Merci, la demande de changement ' + data.referenceCode + ' est enregistrée. Le nouveau planning et le budget de référence vous ont été transmis.');
      addS1Log('✓ ' + data.referenceCode + ' signée et persistée en base de données.');
    } catch (err) {
      addS1Log('⚠ Erreur réseau lors de la signature : ' + err.message);
    }
  }

  function initScenario1() {
    renderGantt(0);
    addS1Log('Interface initialisée — en attente d\'un ID de projet et d\'une Scope Baseline.');

    document.querySelectorAll('.sim-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendClientMessage(btn.dataset.sim);
      });
    });

    document.getElementById('crButton').addEventListener('click', signCR);
  }

  /* ============================================================
     SCÉNARIO 02 — CARTE THERMIQUE & ARBITRAGE (RÉEL)
  ============================================================ */

  var selectedResourceId = null;
  var currentLoads = [];
  var currentRecommendation = null;

  function loadColor(load) {
    if (load > 100) {
      return { bar: 'bg-red-600', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-500/15' };
    }
    if (load > 80) {
      return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-500/15' };
    }
    return { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-500/15' };
  }

  function addS2Log(text) {
    var log = document.getElementById('s2Log');
    var entry = document.createElement('div');
    var time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.className = 'fade-in';
    entry.textContent = '[' + time + '] ' + text;
    log.prepend(entry);
  }

  function renderResources() {
    var grid = document.getElementById('resourceGrid');
    grid.innerHTML = '';

    if (currentLoads.length === 0) {
      grid.innerHTML = '<p class="text-xs text-navy-500 dark:text-navy-400 col-span-2">Aucune ressource trouvée. Ajoutez des lignes dans la table <code>resources</code> pour voir apparaître la charge réelle ici.</p>';
      return;
    }

    currentLoads.forEach(function (r) {
      var c = loadColor(r.loadPct);
      var isSelected = selectedResourceId === r.id;
      var card = document.createElement('button');

      var borderClasses = isSelected
        ? 'border-gold-500 ring-2 ring-gold-500/40'
        : 'border-navy-900/10 dark:border-white/10';

      var pulseClass = (r.loadPct > 100) ? 'pulse-ring' : '';

      card.className = 'text-left rounded-xl border p-4 transition ' + borderClasses +
        ' bg-navy-900/[0.02] dark:bg-white/[0.03] hover:bg-navy-900/5 dark:hover:bg-white/[0.06] ' + pulseClass;

      card.innerHTML =
        '<div class="flex items-center justify-between mb-2.5">' +
        '<div><p class="text-sm font-semibold">' + r.fullName + '</p>' +
        '<p class="text-[11px] text-navy-500 dark:text-navy-400">' + r.role + ' · ' + r.actualHours + 'h / ' + r.capacityHours + 'h (7j)</p></div>' +
        '<span class="font-mono-num text-xs font-bold px-2 py-1 rounded-md ' + c.badge + ' ' + c.text + '">' + r.loadPct + '%</span>' +
        '</div>' +
        '<div class="h-2.5 rounded-full bg-navy-900/10 dark:bg-white/10 overflow-hidden">' +
        '<div class="gauge-fill h-full rounded-full ' + c.bar + '" style="width:' + Math.min(r.loadPct, 100) + '%"></div>' +
        '</div>';

      card.addEventListener('click', function () {
        selectResource(r.id);
      });

      grid.appendChild(card);
    });
  }

  async function refreshLoads() {
    var panel = document.getElementById('arbitragePanel');
    try {
      var response = await fetch('/api/resources/arbitrate', { method: 'GET', headers: authHeaders() });
      var data = await response.json();

      if (!response.ok) {
        panel.innerHTML = '<p class="text-xs text-red-600">Erreur : ' + data.error + '</p>';
        return;
      }

      currentLoads = data.resources;
      renderResources();
    } catch (err) {
      panel.innerHTML = '<p class="text-xs text-red-600">Erreur réseau : ' + err.message + '</p>';
    }
  }

  function selectResource(id) {
    selectedResourceId = id;
    renderResources();

    var r = currentLoads.filter(function (x) { return x.id === id; })[0];
    var panel = document.getElementById('arbitragePanel');

    if (r.loadPct <= 100) {
      panel.innerHTML = '<p class="text-xs text-navy-500 dark:text-navy-400 px-2">' + r.fullName +
        " n'est pas en surcharge critique (charge " + r.loadPct + '%). Aucun arbitrage nécessaire pour le moment.</p>';
      return;
    }

    panel.innerHTML =
      '<div class="w-full fade-in">' +
      '<p class="text-sm font-semibold mb-1">' + r.fullName + ' — Surcharge critique</p>' +
      '<p class="text-xs text-navy-600 dark:text-navy-300 mb-4">Charge réelle sur 7 jours : <span class="font-mono-num font-bold text-red-600">' + r.loadPct + '%</span> (' + r.actualHours + 'h loggées / ' + r.capacityHours + 'h de capacité).</p>' +
      '<button id="launchArbitrageBtn" class="w-full text-xs font-semibold bg-navy-900 hover:bg-navy-800 dark:bg-gold-500 dark:hover:bg-gold-600 text-white dark:text-navy-950 px-4 py-2.5 rounded-lg transition">Lancer l\'arbitrage IA</button>' +
      '</div>';

    document.getElementById('launchArbitrageBtn').addEventListener('click', launchArbitrage);
    addS2Log('Ressource sélectionnée : ' + r.fullName + ' (' + r.loadPct + '% de charge réelle).');
  }

  async function launchArbitrage() {
    var panel = document.getElementById('arbitragePanel');
    panel.innerHTML =
      '<div class="w-full flex flex-col items-center gap-3 fade-in">' +
      '<div class="flex gap-1.5">' +
      '<span class="thinking-dot w-2.5 h-2.5 rounded-full bg-gold-500"></span>' +
      '<span class="thinking-dot w-2.5 h-2.5 rounded-full bg-gold-500"></span>' +
      '<span class="thinking-dot w-2.5 h-2.5 rounded-full bg-gold-500"></span>' +
      '</div>' +
      '<p class="text-xs text-navy-500 dark:text-navy-400">Claude analyse le portefeuille de ressources…</p>' +
      '</div>';

    addS2Log('Lancement de l\'arbitrage IA — /api/resources/arbitrate (POST).');

    try {
      var response = await fetch('/api/resources/arbitrate', { method: 'POST', headers: authHeaders() });
      var data = await response.json();

      if (!response.ok) {
        panel.innerHTML = '<p class="text-xs text-red-600">Erreur : ' + data.error + '</p>';
        return;
      }

      if (!data.arbitrationNeeded) {
        panel.innerHTML = '<p class="text-xs text-emerald-600">Aucune surcharge critique détectée sur le portefeuille actuel.</p>';
        return;
      }

      if (data.warning) {
        panel.innerHTML = '<p class="text-xs text-amber-600">' + data.warning + '</p>';
        return;
      }

      currentRecommendation = data.recommendation;
      currentRecommendation.recommendationId = data.recommendationId;

      var overloaded = currentLoads.filter(function (r) { return r.id === currentRecommendation.overloaded_resource_id; })[0];
      var source = currentLoads.filter(function (r) { return r.id === currentRecommendation.source_resource_id; })[0];

      panel.innerHTML =
        '<div class="w-full text-left fade-in">' +
        '<p class="text-sm font-semibold mb-2">Recommandation NEXUS (générée par Claude)</p>' +
        '<div class="rounded-lg border border-gold-500/40 bg-gold-500/10 p-3 mb-3">' +
        '<p class="text-xs text-navy-700 dark:text-navy-100 leading-relaxed">' + currentRecommendation.recommendation_text + '</p>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2 mb-3 text-center">' +
        '<div class="rounded-lg bg-navy-900/5 dark:bg-white/5 p-2">' +
        '<p class="font-mono-num text-sm font-bold text-navy-700 dark:text-navy-100">' + (overloaded ? overloaded.loadPct : '?') + '%</p>' +
        '<p class="text-[10px] text-navy-500 dark:text-navy-400">' + (overloaded ? overloaded.fullName : 'Ressource en surcharge') + '</p></div>' +
        '<div class="rounded-lg bg-navy-900/5 dark:bg-white/5 p-2">' +
        '<p class="font-mono-num text-sm font-bold text-navy-700 dark:text-navy-100">' + (source ? source.loadPct : '?') + '% → +' + currentRecommendation.transfer_pct + '%</p>' +
        '<p class="text-[10px] text-navy-500 dark:text-navy-400">' + (source ? source.fullName : 'Ressource disponible') + '</p></div>' +
        '</div>' +
        '<div class="flex gap-2">' +
        '<button id="validateTransferBtn" class="flex-1 text-xs font-semibold bg-navy-900 hover:bg-navy-800 dark:bg-gold-500 dark:hover:bg-gold-600 text-white dark:text-navy-950 px-3 py-2 rounded-lg transition">Valider le transfert</button>' +
        '<button id="rejectTransferBtn" class="flex-1 text-xs font-semibold border border-navy-900/15 dark:border-white/15 hover:bg-navy-900/5 dark:hover:bg-white/10 px-3 py-2 rounded-lg transition">Refuser</button>' +
        '</div></div>';

      document.getElementById('validateTransferBtn').addEventListener('click', function () { resolveArbitration('validated'); });
      document.getElementById('rejectTransferBtn').addEventListener('click', function () { resolveArbitration('rejected'); });

      addS2Log('Recommandation générée par Claude, en attente de validation humaine.');
    } catch (err) {
      panel.innerHTML = '<p class="text-xs text-red-600">Erreur réseau : ' + err.message + '</p>';
    }
  }

  async function resolveArbitration(decision) {
    var panel = document.getElementById('arbitragePanel');

    try {
      var response = await fetch('/api/resources/resolve-arbitration', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ recommendationId: currentRecommendation.recommendationId, decision: decision })
      });
      var data = await response.json();

      if (!response.ok) {
        panel.innerHTML = '<p class="text-xs text-red-600">Erreur : ' + data.error + '</p>';
        return;
      }

      panel.innerHTML =
        '<div class="w-full text-center fade-in">' +
        '<p class="text-sm font-semibold ' + (decision === 'validated' ? 'text-emerald-600' : 'text-navy-500') + ' mb-1">' +
        (decision === 'validated' ? '✓ Transfert validé' : 'Transfert refusé') + '</p>' +
        '<p class="text-xs text-navy-600 dark:text-navy-300">' + data.note + '</p>' +
        '</div>';

      addS2Log('Décision "' + decision + '" enregistrée pour la recommandation ' + currentRecommendation.recommendationId + '.');
    } catch (err) {
      panel.innerHTML = '<p class="text-xs text-red-600">Erreur réseau : ' + err.message + '</p>';
    }
  }

  function initScenario2() {
    addS2Log('Interface initialisée — chargement de la charge réelle depuis /api/resources/arbitrate…');
    refreshLoads();
  }

  /* ============================================================
     SCÉNARIO 03 — COPILOTE OPA (RAG RÉEL AVEC PGVECTOR)
  ============================================================ */

  var copilotTimer = null;
  var lastQueriedText = '';

  function setCopilotState(mode) {
    document.getElementById('copilotIdle').classList.toggle('hidden', mode !== 'idle');
    document.getElementById('copilotThinking').classList.toggle('hidden', mode !== 'thinking');
    document.getElementById('copilotAlert').classList.toggle('hidden', mode !== 'alert');

    var dot = document.getElementById('copilotDot');
    dot.className = 'w-2 h-2 rounded-full transition-colors ' + (
      mode === 'thinking' ? 'bg-gold-500 animate-pulse' :
      mode === 'alert' ? 'bg-red-500' :
      'bg-navy-300 dark:bg-navy-600'
    );
  }

  function insertRecommendation(text) {
    var desc = document.getElementById('taskDesc');
    var marker = '\n\n[Mesure préventive — OPA] ' + text;
    if (desc.value.indexOf('[Mesure préventive') === -1) {
      desc.value += marker;
    }
    document.getElementById('riskToggle').checked = true;
  }

  function renderCopilotAlert(result) {
    var box = document.getElementById('copilotAlert');
    var matchesHtml = result.matches.map(function (m) {
      return '<span class="chip">' + m.projectReference + ' · ' + Math.round(m.similarity * 100) + '%</span>';
    }).join(' ');

    box.innerHTML =
      '<div class="rounded-xl border border-red-400/40 bg-red-500/10 p-4 mb-3">' +
      '<p class="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">⚠ ' + result.alertTitle + '</p>' +
      '<p class="text-xs text-navy-700 dark:text-navy-100 leading-relaxed">' + result.alertBody + '</p>' +
      '<div class="flex flex-wrap gap-1.5 mt-2">' + matchesHtml + '</div>' +
      '</div>' +
      '<div class="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">' +
      '<p class="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">✓ Action recommandée</p>' +
      '<p class="text-xs text-navy-700 dark:text-navy-100 leading-relaxed">' + result.recommendedAction + '</p>' +
      '<button id="insertRecoBtn" class="mt-3 text-xs font-semibold bg-navy-900 hover:bg-navy-800 dark:bg-gold-500 dark:hover:bg-gold-600 text-white dark:text-navy-950 px-3 py-2 rounded-lg transition">Insérer cette recommandation dans le risque</button>' +
      '</div>';

    document.getElementById('insertRecoBtn').addEventListener('click', function () {
      insertRecommendation(result.recommendedAction);
    });

    setCopilotState('alert');
  }

  async function queryOpaSearch() {
    var combined = (document.getElementById('taskTitle').value + ' ' + document.getElementById('taskDesc').value).trim();

    if (combined.length < 3 || combined === lastQueriedText) {
      if (combined.length < 3) setCopilotState('idle');
      return;
    }

    lastQueriedText = combined;
    setCopilotState('thinking');

    try {
      var response = await fetch('/api/opa/search', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ taskText: combined })
      });
      var data = await response.json();

      if (!response.ok) {
        setCopilotState('idle');
        return;
      }

      if (!data.shouldAlert) {
        setCopilotState('idle');
        return;
      }

      renderCopilotAlert(data);
    } catch (err) {
      setCopilotState('idle');
    }
  }

  function handleCopilotInput() {
    window.clearTimeout(copilotTimer);
    copilotTimer = window.setTimeout(queryOpaSearch, 900);
  }

  function initScenario3() {
    document.getElementById('taskTitle').addEventListener('input', handleCopilotInput);
    document.getElementById('taskDesc').addEventListener('input', handleCopilotInput);

    document.querySelectorAll('.kw-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.getElementById('taskTitle').value = btn.dataset.kw;
        handleCopilotInput();
      });
    });
  }

  /* ============================================================
     INITIALISATION GLOBALE
  ============================================================ */

  document.addEventListener('DOMContentLoaded', function () {
    initAuth();
    initConfigBar();
    initScenario1();
    initScenario2();
    initScenario3();
  });
})();
