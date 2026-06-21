(() => {
  const SESSION_KEY = 'alertcitoyen_session_pro';
  const LIBREVILLE = [0.3924, 9.4536];

  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (!session || !['dispatch', 'super_admin'].includes(session.role)) {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = '/login.html';
  });

  const TYPE_LABEL = {
    sos: '🚨 SOS Urgence',
    agression: '🥊 Agression',
    vol: '🥊 Vol',
    trouble: '🥊 Trouble',
    accident: '🚗 Accident',
    incendie: '🔥 Incendie',
    inondation: '🌊 Inondation',
    secours_medical: '⛑️ Secours médical',
    malaise: '⛑️ Malaise',
    autre: '❓ Autre',
  };

  const STATUT_LABEL = {
    en_attente: 'En attente',
    en_cours: 'En cours',
    en_intervention: 'En intervention',
    resolue: 'Résolue',
  };

  const ENTITES = {
    police: 'Police Nationale',
    pompiers: 'Sapeurs-Pompiers',
    samu: 'SAMU',
    mairie: 'Mairie de Libreville',
  };

  const PRIORITE_RANK = { haute: 0, moyenne: 1, normale: 1, basse: 2, faible: 2 };

  const map = L.map('map').setView(LIBREVILLE, 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
  }).addTo(map);

  const markersById = {};
  let alertesById = {};
  let currentFilter = 'all';
  let openEntityMenuId = null;

  const listEl = document.getElementById('alertes-list');
  const connectionStatusEl = document.getElementById('connection-status');
  const lastUpdateEl = document.getElementById('last-update');
  const statJour = document.getElementById('stat-jour');
  const statEnCours = document.getElementById('stat-en-cours');
  const statResolues = document.getElementById('stat-resolues');
  const statTempsReponse = document.getElementById('stat-temps-reponse');

  function colorForPriorite(priorite) {
    switch (priorite) {
      case 'haute':
        return '#C8102E';
      case 'basse':
      case 'faible':
        return '#009639';
      default:
        return '#FCD116';
    }
  }

  function createIcon(color, live) {
    return L.divIcon({
      className: '',
      html: `<span class="map-marker ${live ? 'live' : ''}" style="background:${color}"></span>`,
      iconSize: [18, 18],
    });
  }

  function typeLabel(type) {
    return TYPE_LABEL[type] || type;
  }

  function statutLabel(statut) {
    return STATUT_LABEL[statut] || statut;
  }

  function entitesLabel(entiteAffectee) {
    return (entiteAffectee || '')
      .split(',')
      .filter(Boolean)
      .map((e) => ENTITES[e] || e)
      .join(' + ');
  }

  function formatHeure(createdAt) {
    const date = new Date(createdAt.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function accuracyBadge(alerte) {
    if (alerte.accuracy == null) return '';
    const precise = alerte.accuracy <= 30;
    return `<span class="accuracy-badge ${precise ? '' : 'imprecise'}"><i class="fa-solid fa-crosshairs"></i> ${Math.round(alerte.accuracy)} m</span>`;
  }

  function popupContent(alerte) {
    return `
      <strong>${typeLabel(alerte.type)}</strong><br>
      ${alerte.adresse || 'Position GPS'}<br>
      Priorité : ${alerte.priorite}<br>
      Statut : ${statutLabel(alerte.statut)}
    `;
  }

  function upsertMarker(alerte) {
    if (alerte.latitude == null || alerte.longitude == null) return;
    const latLng = [alerte.latitude, alerte.longitude];
    const live = alerte.type === 'sos' && alerte.statut !== 'resolue';
    const icon = createIcon(colorForPriorite(alerte.priorite), live);

    if (markersById[alerte.id]) {
      markersById[alerte.id].setLatLng(latLng);
      markersById[alerte.id].setIcon(icon);
      markersById[alerte.id].setPopupContent(popupContent(alerte));
    } else {
      const marker = L.marker(latLng, { icon }).addTo(map).bindPopup(popupContent(alerte));
      markersById[alerte.id] = marker;
    }
  }

  function removeMarker(id) {
    if (markersById[id]) {
      map.removeLayer(markersById[id]);
      delete markersById[id];
    }
  }

  function sortAlertes(alertes) {
    return [...alertes].sort((a, b) => {
      const rankDiff = (PRIORITE_RANK[a.priorite] ?? 1) - (PRIORITE_RANK[b.priorite] ?? 1);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.created_at.replace(' ', 'T')) - new Date(a.created_at.replace(' ', 'T'));
    });
  }

  function alerteCardHTML(alerte) {
    const entiteNom = entitesLabel(alerte.entite_affectee);
    return `
      <li class="alerte-card priorite-${alerte.priorite}" data-id="${alerte.id}">
        <div class="alerte-card-header">
          <span class="badge priorite-badge priorite-${alerte.priorite}">${alerte.priorite}</span>
          <span class="alerte-type">${typeLabel(alerte.type)}</span>
          <span class="alerte-heure">${formatHeure(alerte.created_at)}</span>
        </div>
        <div class="alerte-adresse"><i class="fa-solid fa-location-dot"></i> ${alerte.adresse || 'Position GPS uniquement'} ${accuracyBadge(alerte)}</div>
        ${alerte.description ? `<div class="alerte-description">${alerte.description}</div>` : ''}
        <div class="alerte-card-footer">
          <span class="badge statut-badge statut-${alerte.statut}">${statutLabel(alerte.statut)}</span>
          ${entiteNom ? `<span class="badge entite-badge"><i class="fa-solid fa-people-group"></i> ${entiteNom}</span>` : ''}
          <div class="alerte-actions">
            <button class="action-btn" data-action="fiche" data-id="${alerte.id}"><i class="fa-solid fa-id-card"></i> Fiche alerteur</button>
            ${alerte.statut === 'en_attente' ? `<button class="action-btn" data-action="prendre" data-id="${alerte.id}">Prendre en charge</button>` : ''}
            <span class="action-btn assign" data-id="${alerte.id}">
              <button data-action="toggle-assign" data-id="${alerte.id}">Corriger l'affectation</button>
              ${openEntityMenuId === alerte.id ? `
                <div class="entity-menu">
                  ${Object.entries(ENTITES).map(([key, nom]) => `<button data-action="assign" data-id="${alerte.id}" data-entite="${key}">${nom}</button>`).join('')}
                </div>
              ` : ''}
            </span>
            ${alerte.statut !== 'resolue' ? `<button class="action-btn resolved" data-action="cloturer" data-id="${alerte.id}">Clôturer</button>` : ''}
          </div>
        </div>
      </li>
    `;
  }

  function renderList() {
    const all = Object.values(alertesById);
    const filtered = currentFilter === 'all' ? all : all.filter((a) => a.statut === currentFilter);
    const sorted = sortAlertes(filtered);

    if (!sorted.length) {
      listEl.innerHTML = '<li class="empty-state">Aucune alerte pour ce filtre.</li>';
    } else {
      listEl.innerHTML = sorted.map(alerteCardHTML).join('');
    }

    renderStats(all);
  }

  function renderStats(all) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = all.filter((a) => (a.created_at || '').startsWith(todayStr));
    const enCours = all.filter((a) => a.statut === 'en_cours' || a.statut === 'en_intervention');
    const resolues = all.filter((a) => a.statut === 'resolue');

    statJour.textContent = today.length;
    statEnCours.textContent = enCours.length;
    statResolues.textContent = resolues.length;

    const traitees = all.filter((a) => a.statut !== 'en_attente');
    if (traitees.length) {
      const totalMinutes = traitees.reduce((sum, a) => {
        const created = new Date(a.created_at.replace(' ', 'T'));
        const updated = new Date(a.updated_at.replace(' ', 'T'));
        return sum + Math.max(0, (updated - created) / 60000);
      }, 0);
      statTempsReponse.textContent = `${Math.round(totalMinutes / traitees.length)} min`;
    } else {
      statTempsReponse.textContent = '—';
    }
  }

  listEl.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const { action, id, entite } = actionEl.dataset;

    if (action === 'fiche') {
      window.FicheAlerteur.open(alertesById[id]);
    } else if (action === 'prendre') {
      updateAlerte(id, { statut: 'en_cours', dispatcher_id: session.id });
    } else if (action === 'cloturer') {
      updateAlerte(id, { statut: 'resolue' });
    } else if (action === 'toggle-assign') {
      openEntityMenuId = openEntityMenuId === id ? null : id;
      renderList();
    } else if (action === 'assign') {
      openEntityMenuId = null;
      updateAlerte(id, { entite_affectee: entite });
    }
  });

  document.addEventListener('click', (e) => {
    if (openEntityMenuId && !e.target.closest('.action-btn.assign')) {
      openEntityMenuId = null;
      renderList();
    }
  });

  document.getElementById('filter-buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('#filter-buttons .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
    renderList();
  });

  async function updateAlerte(id, payload) {
    try {
      await fetch(`/api/alertes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      alert("Impossible de mettre à jour cette alerte.");
    }
  }

  function setConnectionStatus(online) {
    connectionStatusEl.classList.toggle('offline', !online);
  }

  function updateLastUpdateLabel() {
    const now = new Date();
    lastUpdateEl.textContent = `Mis à jour à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  }

  async function loadInitialAlertes() {
    try {
      const res = await fetch('/api/alertes');
      if (!res.ok) throw new Error('Réponse invalide');
      const alertes = await res.json();
      alertesById = {};
      alertes.forEach((a) => {
        alertesById[a.id] = a;
        upsertMarker(a);
      });
      renderList();
      setConnectionStatus(true);
      updateLastUpdateLabel();
    } catch {
      setConnectionStatus(false);
      lastUpdateEl.textContent = 'Connexion au serveur perdue';
    }
  }

  // ===================================================================
  // Socket.IO — flux temps réel (rooms dispatch/admin : reçoivent tout)
  // ===================================================================

  const socket = window.io();

  socket.on('connect', () => {
    socket.emit('auth:join', { role: session.role });
    setConnectionStatus(true);
    updateLastUpdateLabel();
  });

  socket.on('disconnect', () => {
    setConnectionStatus(false);
    lastUpdateEl.textContent = 'Connexion au serveur perdue';
  });

  socket.on('nouvelle_alerte', (alerte) => {
    alertesById[alerte.id] = alerte;
    upsertMarker(alerte);
    renderList();
    updateLastUpdateLabel();
  });

  socket.on('alerte_mise_a_jour', (alerte) => {
    alertesById[alerte.id] = alerte;
    upsertMarker(alerte);
    renderList();
    updateLastUpdateLabel();
  });

  socket.on('alerte_supprimee', ({ id }) => {
    delete alertesById[id];
    removeMarker(id);
    renderList();
    updateLastUpdateLabel();
  });

  loadInitialAlertes();

  // ===================================================================
  // Navigation entre les 4 pages (Alertes en direct / Journal / Rapports / Statistiques)
  // ===================================================================

  document.querySelectorAll('.admin-tabs > .admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tabs > .admin-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');

      if (btn.dataset.tab === 'direct' && map) {
        setTimeout(() => map.invalidateSize(), 50);
      }
      if (btn.dataset.tab === 'journal') {
        loadJournalAlertes();
      }
      if (btn.dataset.tab === 'stats') {
        loadStatistiques();
      }
    });
  });

  // ===================================================================
  // Journal des alertes et des connexions
  // ===================================================================

  let journalConnexionsLoaded = false;

  document.querySelectorAll('[data-journal-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-journal-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('journal-alertes-panel').classList.toggle('hidden', btn.dataset.journalTab !== 'alertes');
      document.getElementById('journal-connexions-panel').classList.toggle('hidden', btn.dataset.journalTab !== 'connexions');
      if (btn.dataset.journalTab === 'connexions' && !journalConnexionsLoaded) {
        loadJournalConnexions();
      }
    });
  });

  function journalContactCell(row) {
    if (!row.citoyen_telephone) return '—';
    const tel = row.citoyen_telephone.replace(/[^\d]/g, '');
    return `
      <div class="journal-contact-cell">
        <a href="tel:+${tel}" title="Appeler"><i class="fa-solid fa-phone"></i></a>
        <a href="https://wa.me/${tel}" target="_blank" rel="noopener" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
      </div>
    `;
  }

  async function loadJournalAlertes() {
    const tbody = document.getElementById('journal-alertes-body');
    const params = new URLSearchParams();
    const dateDebut = document.getElementById('journal-date-debut').value;
    const dateFin = document.getElementById('journal-date-fin').value;
    const type = document.getElementById('journal-type').value;
    const quartier = document.getElementById('journal-quartier').value.trim();
    if (dateDebut) params.set('date_debut', dateDebut);
    if (dateFin) params.set('date_fin', dateFin);
    if (type) params.set('type', type);
    if (quartier) params.set('quartier', quartier);

    tbody.innerHTML = '<tr><td colspan="9">Chargement...</td></tr>';
    try {
      const res = await fetch(`/api/alertes/journal?${params.toString()}`);
      const rows = await res.json();
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="9">Aucune alerte pour ces critères.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((row) => `
        <tr>
          <td>${(row.created_at || '').replace('T', ' ')}</td>
          <td>${typeLabel(row.type)}</td>
          <td><span class="badge priorite-badge priorite-${row.priorite}">${row.priorite}</span></td>
          <td>${row.citoyen_prenom ? `${row.citoyen_prenom} ${row.citoyen_nom}` : '—'}</td>
          <td>${journalContactCell(row)}</td>
          <td>${row.citoyen_quartier || '—'}</td>
          <td>${entitesLabel(row.entite_affectee)}</td>
          <td>${row.agent_nom || '—'}</td>
          <td><span class="badge statut-badge statut-${row.statut}">${statutLabel(row.statut)}</span></td>
        </tr>
      `).join('');
    } catch {
      tbody.innerHTML = '<tr><td colspan="9">Erreur de chargement du journal.</td></tr>';
    }
  }

  async function loadJournalConnexions() {
    const tbody = document.getElementById('journal-connexions-body');
    try {
      const res = await fetch('/api/connexions');
      const rows = await res.json();
      journalConnexionsLoaded = true;
      tbody.innerHTML = rows.length
        ? rows.map((row) => `
            <tr>
              <td>${(row.created_at || '').replace('T', ' ')}</td>
              <td>${row.nom}</td>
              <td><span class="role-badge role-${row.role}">${row.role}</span></td>
              <td>${row.type_entite ? ENTITES[row.type_entite] : '—'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="4">Aucune connexion enregistrée.</td></tr>';
    } catch {
      tbody.innerHTML = '<tr><td colspan="4">Erreur de chargement.</td></tr>';
    }
  }

  document.getElementById('journal-filtrer-btn').addEventListener('click', loadJournalAlertes);

  // ===================================================================
  // Rapports d'activité PDF (vue nationale, sans filtre d'entité)
  // ===================================================================

  let rapportPeriode = 'jour';
  let rapportFormat = 'pdf';

  document.getElementById('rapport-periode-buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-periode]');
    if (!btn) return;
    rapportPeriode = btn.dataset.periode;
    document.querySelectorAll('#rapport-periode-buttons .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });

  document.getElementById('rapport-format-buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-format]');
    if (!btn) return;
    rapportFormat = btn.dataset.format;
    document.querySelectorAll('#rapport-format-buttons .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });

  document.getElementById('rapport-generer-btn').addEventListener('click', () => {
    window.location.href = `/api/rapports/${rapportFormat}?periode=${rapportPeriode}`;
  });

  // ===================================================================
  // Statistiques — graphiques (Chart.js) + carte de chaleur (vue nationale)
  // ===================================================================

  const chartInstances = {};
  let heatmapMap = null;
  let heatLayer = null;

  const CHART_BASE_OPTIONS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#0B1F3A' } } },
    scales: {
      x: { ticks: { color: '#5A6E88' }, grid: { color: 'rgba(11,31,58,0.06)' } },
      y: { ticks: { color: '#5A6E88' }, grid: { color: 'rgba(11,31,58,0.06)' }, beginAtZero: true },
    },
  };

  function upsertChart(canvasId, config) {
    if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    chartInstances[canvasId] = new Chart(canvas.getContext('2d'), config);
  }

  function renderChartType(rows) {
    const counts = {};
    rows.forEach((r) => { counts[r.type] = (counts[r.type] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    upsertChart('chart-type', {
      type: 'bar',
      data: {
        labels: entries.map(([t]) => typeLabel(t)),
        datasets: [{ label: 'Alertes', data: entries.map(([, c]) => c), backgroundColor: '#3A75C4' }],
      },
      options: CHART_BASE_OPTIONS,
    });
  }

  function renderChartQuartier(rows) {
    const counts = {};
    rows.forEach((r) => {
      const quartier = r.citoyen_quartier || r.adresse || 'Non renseigné';
      counts[quartier] = (counts[quartier] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    upsertChart('chart-quartier', {
      type: 'bar',
      data: {
        labels: entries.map(([q]) => q),
        datasets: [{ label: 'Alertes', data: entries.map(([, c]) => c), backgroundColor: '#FCD116' }],
      },
      options: { ...CHART_BASE_OPTIONS, indexAxis: 'y' },
    });
  }

  function renderChartHeures(rows) {
    const counts = new Array(24).fill(0);
    rows.forEach((r) => {
      const date = new Date((r.created_at || '').replace(' ', 'T'));
      if (!Number.isNaN(date.getTime())) counts[date.getHours()] += 1;
    });
    upsertChart('chart-heures', {
      type: 'bar',
      data: {
        labels: counts.map((_, h) => `${h}h`),
        datasets: [{ label: 'Alertes', data: counts, backgroundColor: '#C8102E' }],
      },
      options: CHART_BASE_OPTIONS,
    });
  }

  function renderChartEvolution(rows) {
    const jours = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      jours.push(d.toISOString().slice(0, 10));
    }
    const counts = jours.map((jour) => rows.filter((r) => (r.created_at || '').startsWith(jour)).length);
    upsertChart('chart-evolution', {
      type: 'line',
      data: {
        labels: jours.map((j) => j.slice(5)),
        datasets: [{ label: 'Alertes', data: counts, borderColor: '#009639', backgroundColor: 'rgba(0,150,57,0.15)', fill: true, tension: 0.3 }],
      },
      options: CHART_BASE_OPTIONS,
    });
  }

  function initHeatmap() {
    if (heatmapMap) {
      heatmapMap.invalidateSize();
      return;
    }
    heatmapMap = L.map('heatmap-map').setView(LIBREVILLE, 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(heatmapMap);
  }

  function renderHeatmap(rows) {
    initHeatmap();
    if (heatLayer) heatmapMap.removeLayer(heatLayer);
    const points = rows
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => [r.latitude, r.longitude, r.priorite === 'haute' ? 1 : 0.5]);
    heatLayer = L.heatLayer(points, { radius: 28, blur: 22, maxZoom: 17 }).addTo(heatmapMap);
  }

  async function loadStatistiques() {
    try {
      const res = await fetch('/api/alertes/journal');
      const rows = await res.json();
      renderChartType(rows);
      renderChartQuartier(rows);
      renderChartHeures(rows);
      renderChartEvolution(rows);
      renderHeatmap(rows);
    } catch {
      // silencieux : les graphiques restent vides
    }
  }
})();
