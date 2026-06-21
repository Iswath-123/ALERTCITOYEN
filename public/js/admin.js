(() => {
  const SESSION_KEY = 'alertcitoyen_session_pro';
  const LIBREVILLE = [0.3924, 9.4536];

  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (!session || session.role !== 'super_admin') {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('admin-nom').textContent = `${session.prenom || ''} ${session.nom || ''}`.trim();
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = '/login.html';
  });

  const ENTITES = ['police', 'pompiers', 'samu', 'mairie'];
  const ENTITE_NOM = { police: 'Police Nationale', pompiers: 'Sapeurs-Pompiers', samu: 'SAMU', mairie: 'Mairie de Libreville' };
  const ENTITE_ICON = { police: 'fa-user-shield', pompiers: 'fa-fire-extinguisher', samu: 'fa-truck-medical', mairie: 'fa-building-columns' };

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

  function typeLabel(type) { return TYPE_LABEL[type] || type; }
  function statutLabel(statut) { return STATUT_LABEL[statut] || statut; }
  function entitesLabel(entiteAffectee) {
    return (entiteAffectee || '').split(',').filter(Boolean).map((e) => ENTITE_NOM[e] || e).join(' + ');
  }
  function roleLabel(role) {
    return { super_admin: 'Super admin', dispatch: 'Dispatch', entite: 'Entité', citoyen: 'Citoyen' }[role] || role;
  }

  // ===================================================================
  // Navigation entre les 6 onglets (4 pages communes + comptes + supervision)
  // ===================================================================

  document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((s) => s.classList.add('hidden'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');

      if (btn.dataset.tab === 'direct' && map) {
        setTimeout(() => map.invalidateSize(), 50);
      }
      if (btn.dataset.tab === 'journal') loadJournalAlertes();
      if (btn.dataset.tab === 'stats') { loadStats(); loadStatistiques(); }
      if (btn.dataset.tab === 'comptes') loadComptes();
      if (btn.dataset.tab === 'entites') loadSupervisionEntites();
      if (btn.dataset.tab === 'unites') {
        loadUnitesPolice();
        setTimeout(() => unitesMap && unitesMap.invalidateSize(), 50);
      }
    });
  });

  // ===================================================================
  // Alertes en direct — vue nationale (toutes alertes, toutes entités)
  // ===================================================================

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
      case 'haute': return '#C8102E';
      case 'basse':
      case 'faible': return '#009639';
      default: return '#FCD116';
    }
  }

  function createIcon(color, live) {
    return L.divIcon({
      className: '',
      html: `<span class="map-marker ${live ? 'live' : ''}" style="background:${color}"></span>`,
      iconSize: [18, 18],
    });
  }

  function accuracyBadge(alerte) {
    if (alerte.accuracy == null) return '';
    const precise = alerte.accuracy <= 30;
    return `<span class="accuracy-badge ${precise ? '' : 'imprecise'}"><i class="fa-solid fa-crosshairs"></i> ${Math.round(alerte.accuracy)} m</span>`;
  }

  function popupContent(alerte) {
    return `<strong>${typeLabel(alerte.type)}</strong><br>${alerte.adresse || 'Position GPS'}<br>Statut : ${statutLabel(alerte.statut)}`;
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
          <span class="alerte-heure">${(alerte.created_at || '').slice(11, 16)}</span>
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
                  ${Object.entries(ENTITE_NOM).map(([key, nom]) => `<button data-action="assign" data-id="${alerte.id}" data-entite="${key}">${nom}</button>`).join('')}
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

    listEl.innerHTML = sorted.length
      ? sorted.map(alerteCardHTML).join('')
      : '<li class="empty-state">Aucune alerte pour ce filtre.</li>';

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
    if (!btn || !btn.dataset.filter) return;
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

  const socket = window.io();

  socket.on('connect', () => {
    socket.emit('auth:join', { role: 'super_admin' });
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
  // Journal des alertes et des connexions — vue nationale
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
              <td><span class="role-badge role-${row.role}">${roleLabel(row.role)}</span></td>
              <td>${row.type_entite ? ENTITE_NOM[row.type_entite] : '—'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="4">Aucune connexion enregistrée.</td></tr>';
    } catch {
      tbody.innerHTML = '<tr><td colspan="4">Erreur de chargement.</td></tr>';
    }
  }

  document.getElementById('journal-filtrer-btn').addEventListener('click', loadJournalAlertes);

  // ===================================================================
  // Statistiques nationales
  // ===================================================================

  async function loadStats() {
    try {
      const [alertesRes, citoyensRes] = await Promise.all([
        fetch('/api/alertes'),
        fetch('/api/comptes?role=citoyen'),
      ]);
      const alertes = await alertesRes.json();
      const citoyens = await citoyensRes.json();

      const todayStr = new Date().toISOString().slice(0, 10);
      const today = alertes.filter((a) => (a.created_at || '').startsWith(todayStr));
      const enAttente = alertes.filter((a) => a.statut === 'en_attente');
      const enCoursTotal = alertes.filter((a) => a.statut === 'en_cours' || a.statut === 'en_intervention');
      const resoluesTotal = alertes.filter((a) => a.statut === 'resolue');
      const haute = alertes.filter((a) => a.priorite === 'haute');

      document.getElementById('nat-total').textContent = alertes.length;
      document.getElementById('nat-jour').textContent = today.length;
      document.getElementById('nat-attente').textContent = enAttente.length;
      document.getElementById('nat-cours').textContent = enCoursTotal.length;
      document.getElementById('nat-resolues').textContent = resoluesTotal.length;
      document.getElementById('nat-haute').textContent = haute.length;
      document.getElementById('nat-citoyens').textContent = citoyens.length;

      const traitees = alertes.filter((a) => a.statut !== 'en_attente');
      if (traitees.length) {
        const totalMinutes = traitees.reduce((sum, a) => {
          const created = new Date(a.created_at.replace(' ', 'T'));
          const updated = new Date(a.updated_at.replace(' ', 'T'));
          return sum + Math.max(0, (updated - created) / 60000);
        }, 0);
        document.getElementById('nat-temps').textContent = `${Math.round(totalMinutes / traitees.length)} min`;
      }
    } catch {
      // silencieux : les valeurs par défaut restent affichées
    }
  }

  // ===================================================================
  // Gestion des comptes
  // ===================================================================

  const nouveauCompteBtn = document.getElementById('nouveau-compte-btn');
  const compteFormSection = document.getElementById('compte-form-section');
  const compteFormBack = document.getElementById('compte-form-back');
  const compteRoleSelect = document.getElementById('compte-role');
  const compteTypeEntiteWrapper = document.getElementById('compte-type-entite-wrapper');
  const compteSubmitBtn = document.getElementById('compte-submit-btn');
  const comptesTableBody = document.getElementById('comptes-table-body');

  nouveauCompteBtn.addEventListener('click', () => compteFormSection.classList.remove('hidden'));
  compteFormBack.addEventListener('click', () => compteFormSection.classList.add('hidden'));

  compteRoleSelect.addEventListener('change', () => {
    compteTypeEntiteWrapper.classList.toggle('hidden', compteRoleSelect.value !== 'entite');
  });
  compteTypeEntiteWrapper.classList.toggle('hidden', compteRoleSelect.value !== 'entite');

  compteSubmitBtn.addEventListener('click', async () => {
    const nom = document.getElementById('compte-nom').value.trim();
    const prenom = document.getElementById('compte-prenom').value.trim();
    const email = document.getElementById('compte-email').value.trim();
    const mot_de_passe = document.getElementById('compte-password').value;
    const role = compteRoleSelect.value;
    const type_entite = document.getElementById('compte-type-entite').value;

    if (!nom || !email || !mot_de_passe) {
      alert('Le nom, l\'email et le mot de passe sont requis.');
      return;
    }

    compteSubmitBtn.disabled = true;
    try {
      const res = await fetch('/api/comptes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, prenom, email, mot_de_passe, role, type_entite: role === 'entite' ? type_entite : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.erreur || 'Création impossible.');
        return;
      }
      compteFormSection.classList.add('hidden');
      document.getElementById('compte-nom').value = '';
      document.getElementById('compte-prenom').value = '';
      document.getElementById('compte-email').value = '';
      document.getElementById('compte-password').value = '';
      loadComptes();
    } catch {
      alert('Erreur réseau lors de la création du compte.');
    } finally {
      compteSubmitBtn.disabled = false;
    }
  });

  async function loadComptes() {
    try {
      const res = await fetch('/api/comptes');
      const comptes = await res.json();

      comptesTableBody.innerHTML = comptes.map((c) => `
        <tr>
          <td>${c.prenom ? `${c.prenom} ` : ''}${c.nom}</td>
          <td><span class="role-badge role-${c.role}">${roleLabel(c.role)}</span></td>
          <td>${c.type_entite ? ENTITE_NOM[c.type_entite] : '—'}</td>
          <td>${c.email || c.telephone || '—'}</td>
          <td>${(c.created_at || '').slice(0, 10)}</td>
          <td>
            <button class="table-action-btn danger" data-action="supprimer" data-id="${c.id}"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `).join('') || '<tr><td colspan="6">Aucun compte.</td></tr>';
    } catch {
      comptesTableBody.innerHTML = '<tr><td colspan="6">Erreur de chargement.</td></tr>';
    }
  }

  comptesTableBody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="supprimer"]');
    if (!btn) return;
    if (!confirm('Supprimer définitivement ce compte ?')) return;

    try {
      const res = await fetch(`/api/comptes/${btn.dataset.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json();
        alert(data.erreur || 'Suppression impossible.');
        return;
      }
      loadComptes();
    } catch {
      alert('Erreur réseau lors de la suppression.');
    }
  });

  // ===================================================================
  // Supervision des entités
  // ===================================================================

  async function loadSupervisionEntites() {
    const grid = document.getElementById('entite-supervision-grid');
    try {
      const [comptesRes, ...alertesResponses] = await Promise.all([
        fetch('/api/comptes?role=entite'),
        ...ENTITES.map((e) => fetch(`/api/alertes?entite=${e}`)),
      ]);
      const comptesEntite = await comptesRes.json();
      const alertesParEntite = await Promise.all(alertesResponses.map((r) => r.json()));

      grid.innerHTML = ENTITES.map((entite, i) => {
        const compte = comptesEntite.find((c) => c.type_entite === entite);
        const alertes = alertesParEntite[i];
        const enAttente = alertes.filter((a) => a.statut === 'en_attente').length;
        const enCours = alertes.filter((a) => a.statut === 'en_cours' || a.statut === 'en_intervention').length;
        const resolues = alertes.filter((a) => a.statut === 'resolue').length;

        return `
          <div class="entite-supervision-card">
            <h3><i class="fa-solid ${ENTITE_ICON[entite]}"></i> ${ENTITE_NOM[entite]}</h3>
            <div class="supervision-row"><span>Statut compte</span><strong>${compte && compte.disponible ? 'Disponible' : 'Indisponible'}</strong></div>
            <div class="supervision-row"><span>Alertes totales</span><strong>${alertes.length}</strong></div>
            <div class="supervision-row"><span>En attente</span><strong>${enAttente}</strong></div>
            <div class="supervision-row"><span>En cours / intervention</span><strong>${enCours}</strong></div>
            <div class="supervision-row"><span>Résolues</span><strong>${resolues}</strong></div>
          </div>
        `;
      }).join('');
    } catch {
      grid.innerHTML = '<p class="empty-state">Impossible de charger la supervision des entités.</p>';
    }
  }

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

  // ===================================================================
  // Unités de police — placement sur carte + tracé des zones de périmètre
  // ===================================================================

  const TYPE_UNITE_LABEL = {
    commissariat: 'Commissariat',
    piste_avancee: 'Piste avancée',
    supervision: 'Supervision',
  };
  const TYPE_UNITE_ICON = {
    commissariat: 'fa-building-shield',
    piste_avancee: 'fa-tent',
    supervision: 'fa-eye',
  };

  let unitesMap = null;
  let unitesById = {};
  let uniteMarkers = {};
  let uniteSelectionnee = null;
  let drawnItems = null;
  let drawControl = null;

  function initUnitesMap() {
    if (unitesMap) return;
    unitesMap = L.map('unites-map').setView(LIBREVILLE, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(unitesMap);

    drawnItems = new L.FeatureGroup();
    unitesMap.addLayer(drawnItems);

    drawControl = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, showArea: true },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: drawnItems },
    });
    unitesMap.addControl(drawControl);

    unitesMap.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      document.getElementById('unite-sauvegarder-btn').disabled = !uniteSelectionnee;
    });
  }

  function uniteIcon(type, provisoire) {
    const color = type === 'supervision' ? '#5A6E88' : (provisoire ? '#8A6500' : '#3A75C4');
    return L.divIcon({
      className: '',
      html: `<span class="map-marker" style="background:${color}"></span>`,
      iconSize: [16, 16],
    });
  }

  function renderUnitesMarkers() {
    Object.values(unitesById).forEach((unite) => {
      if (unite.latitude == null || unite.longitude == null) return;
      const icon = uniteIcon(unite.type, unite.coordonnees_provisoires);

      if (uniteMarkers[unite.id]) {
        uniteMarkers[unite.id].setLatLng([unite.latitude, unite.longitude]);
        uniteMarkers[unite.id].setIcon(icon);
      } else {
        const marker = L.marker([unite.latitude, unite.longitude], { icon, draggable: false })
          .addTo(unitesMap)
          .bindPopup(unite.nom);
        marker.on('click', () => selectionnerUnite(unite.id));
        uniteMarkers[unite.id] = marker;
      }
    });
  }

  function uniteRowHTML(unite) {
    return `
      <div class="unite-row ${uniteSelectionnee === unite.id ? 'selected' : ''}" data-id="${unite.id}">
        <span class="unite-nom"><i class="fa-solid ${TYPE_UNITE_ICON[unite.type]}"></i> ${unite.nom}</span>
        <span class="unite-meta">
          ${TYPE_UNITE_LABEL[unite.type]}
          ${unite.coordonnees_provisoires ? '<span class="unite-coord-provisoire">À confirmer</span>' : ''}
        </span>
      </div>
    `;
  }

  function renderUnitesList() {
    const panel = document.getElementById('unites-list-panel');
    const unites = Object.values(unitesById);
    panel.innerHTML = unites.length
      ? unites.map(uniteRowHTML).join('')
      : '<p class="empty-state">Aucune unité enregistrée.</p>';
  }

  function selectionnerUnite(id) {
    uniteSelectionnee = id;
    document.querySelectorAll('.unite-row').forEach((row) => row.classList.toggle('selected', row.dataset.id === id));

    Object.entries(uniteMarkers).forEach(([uniteId, marker]) => {
      if (uniteId === id) {
        marker.dragging.enable();
      } else {
        marker.dragging.disable();
      }
    });

    drawnItems.clearLayers();
    const unite = unitesById[id];
    if (unite && unite.latitude != null) {
      unitesMap.setView([unite.latitude, unite.longitude], 14);
    }
    if (unite && unite.zone_geojson) {
      const layer = L.geoJSON(unite.zone_geojson);
      layer.eachLayer((l) => drawnItems.addLayer(l));
    }

    document.getElementById('unite-sauvegarder-btn').disabled = false;
  }

  document.getElementById('unites-list-panel').addEventListener('click', (e) => {
    const row = e.target.closest('.unite-row');
    if (row) selectionnerUnite(row.dataset.id);
  });

  document.getElementById('unite-sauvegarder-btn').addEventListener('click', async () => {
    if (!uniteSelectionnee) return;
    const marker = uniteMarkers[uniteSelectionnee];
    const latLng = marker ? marker.getLatLng() : null;

    let zoneGeojson = null;
    const layers = drawnItems.getLayers();
    if (layers.length) {
      zoneGeojson = layers[0].toGeoJSON().geometry;
    }

    try {
      const res = await fetch(`/api/unites-police/${uniteSelectionnee}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: latLng ? latLng.lat : undefined,
          longitude: latLng ? latLng.lng : undefined,
          zone_geojson: zoneGeojson,
          coordonnees_provisoires: false,
        }),
      });
      if (!res.ok) throw new Error('échec');
      await loadUnitesPolice();
      selectionnerUnite(uniteSelectionnee);
    } catch {
      alert("Impossible d'enregistrer cette unité.");
    }
  });

  async function loadUnitesPolice() {
    initUnitesMap();
    try {
      const res = await fetch('/api/unites-police');
      const unites = await res.json();
      unitesById = {};
      unites.forEach((u) => { unitesById[u.id] = u; });
      renderUnitesList();
      renderUnitesMarkers();
    } catch {
      document.getElementById('unites-list-panel').innerHTML = '<p class="empty-state">Erreur de chargement des unités.</p>';
    }
  }
})();
