(() => {
  /* ===== Config ===== */
  const API = '/api';
  const COMPTE_KEY = 'alertcitoyen_compte_citoyen';
  const SOS_DURATION = 3000;
  const LIBREVILLE = [0.3924, 9.4536];
  const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

  // La maquette affiche des libellés français capitalisés (data-cat, options du
  // select vocal) ; le backend attend des slugs précis pour le routage
  // automatique (section 5 du cahier des charges). Cette table fait le pont.
  const CAT_TO_SLUG = {
    'agression': 'agression',
    'accident': 'accident',
    'incendie': 'incendie',
    'inondation': 'inondation',
    'secours médical': 'secours_medical',
    'secours_medical': 'secours_medical',
    'autre': 'autre',
  };
  function toSlug(cat) {
    return CAT_TO_SLUG[(cat || '').toLowerCase()] || 'autre';
  }

  let currentUser = null;
  let lastPosition = null;
  let citizenMap = null;
  let obPhotoDataUrl = null;

  /* ===== Helpers ===== */
  function getCompte() {
    try { return JSON.parse(localStorage.getItem(COMPTE_KEY) || 'null'); }
    catch { return null; }
  }
  function setCompte(compte) {
    localStorage.setItem(COMPTE_KEY, JSON.stringify(compte));
    currentUser = compte;
  }

  let toastTimer = null;
  function showToast(html) {
    const t = document.getElementById('toast');
    document.getElementById('toastText').innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  const TYPE_LABEL = {
    sos: 'SOS Urgence', agression: 'Agression', accident: 'Accident', incendie: 'Incendie',
    inondation: 'Inondation', secours_medical: 'Secours médical', autre: 'Autre',
  };
  function typeLabel(type) { return TYPE_LABEL[type] || type; }

  const CAT_ICONS = {
    agression: { bg: 'rgba(200,16,46,.10)', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>' },
    accident: { bg: 'rgba(181,101,10,.10)', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B5650A" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3v-4l2-5h11l3 5v4h-2"/><circle cx="7.5" cy="17.5" r="1.7"/><circle cx="17.5" cy="17.5" r="1.7"/></svg>' },
    incendie: { bg: 'rgba(194,84,12,.10)', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C2540C" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-1.5-2-1-3.5 1.5.5 3 2 3 4a4.5 4.5 0 0 1-9 0c0-3 2-4 1.5-7C12 9 14.5 12 14.5 14.5"/></svg>' },
    inondation: { bg: 'rgba(58,117,196,.10)', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3A75C4" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69s-6 7.27-6 11.31a6 6 0 0 0 12 0c0-4.04-6-11.31-6-11.31Z"/></svg>' },
    secours_medical: { bg: 'rgba(23,138,102,.10)', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#178A66" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' },
    sos: { bg: 'rgba(200,16,46,.10)', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#C8102E" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>' },
    autre: { bg: 'rgba(90,110,136,.10)', svg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5A6E88" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' },
  };
  function iconFor(type) { return CAT_ICONS[(type || '').toLowerCase()] || CAT_ICONS.autre; }

  function statutPillClass(s) {
    if (s === 'en_cours' || s === 'en_intervention') return 'en_cours';
    if (s === 'resolue') return 'resolue';
    return 'recue';
  }
  function statutLabel(s) {
    if (s === 'en_cours') return 'En cours';
    if (s === 'en_intervention') return 'Intervention';
    if (s === 'resolue') return 'Résolu';
    return 'Reçue';
  }
  function timeAgo(value) {
    if (!value) return '';
    const d = new Date(String(value).replace(' ', 'T'));
    const diff = (Date.now() - d.getTime()) / 1000;
    if (Number.isNaN(diff)) return '';
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return Math.floor(diff / 60) + ' min';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  /* ===== Inscription citoyenne (obligatoire, sans OTP pour l'instant) ===== */
  // TODO(OTP): déclencher ici l'envoi d'un SMS de vérification (futur endpoint
  // /api/comptes/envoyer-otp) puis exiger la saisie du code avant d'appeler
  // inscription-citoyen. Pour l'instant verifierOTP côté serveur valide
  // toujours le numéro sans envoi réel.

  function initOnboarding() {
    const onboard = document.getElementById('onboard');

    if (currentUser) {
      onboard.style.display = 'none';
      initApp();
      return;
    }
    onboard.style.display = 'flex';

    const obWrap = onboard.querySelector('.ob-wrap');
    document.getElementById('obNextBtn').addEventListener('click', () => {
      obWrap.classList.add('step-form');
      onboard.scrollTop = 0;
    });
    document.getElementById('obBackBtn').addEventListener('click', () => {
      obWrap.classList.remove('step-form');
      onboard.scrollTop = 0;
    });

    const sameWa = document.getElementById('sameWa');
    const waField = document.getElementById('waField');
    const wa = document.getElementById('wa');
    const tel = document.getElementById('tel');
    const quartier = document.getElementById('quartier');
    const quartierAutreField = document.getElementById('quartierAutreField');
    const quartierAutre = document.getElementById('quartierAutre');
    const photoBtn = document.getElementById('photoBtn');
    const photoInput = document.getElementById('photoInput');
    const avatarImg = document.getElementById('avatarImg');

    function syncWa() { waField.classList.toggle('open', !sameWa.checked); }
    sameWa.addEventListener('change', syncWa);
    syncWa();

    quartier.addEventListener('change', () => {
      quartierAutreField.style.display = quartier.value === 'Autre' ? 'flex' : 'none';
    });

    photoBtn.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        obPhotoDataUrl = reader.result;
        avatarImg.src = obPhotoDataUrl;
        avatarImg.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('regForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('obError');
      errorEl.classList.remove('show');
      const submitBtn = document.getElementById('submitBtn');
      const submitLabel = submitBtn.innerHTML;

      const nom = document.getElementById('nom').value.trim();
      const prenom = document.getElementById('prenom').value.trim();
      const telephone = tel.value.trim() ? `+241${tel.value.trim()}` : '';
      const whatsapp = sameWa.checked ? telephone : (wa.value.trim() ? `+241${wa.value.trim()}` : '');
      const quartierValeur = quartier.value === 'Autre' ? quartierAutre.value.trim() : quartier.value;

      if (!nom || !telephone) {
        errorEl.textContent = 'Le nom et le téléphone sont obligatoires.';
        errorEl.classList.add('show');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Création en cours...';

      try {
        const res = await fetch(`${API}/comptes/inscription-citoyen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom, prenom, telephone, whatsapp, quartier: quartierValeur, photo: obPhotoDataUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erreur || "Échec de l'inscription");

        setCompte(data);
        onboard.style.display = 'none';
        initApp();
      } catch (err) {
        errorEl.textContent = err.message || 'Connexion au serveur impossible.';
        errorEl.classList.add('show');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = submitLabel;
      }
    });
  }

  /* ===== App principale ===== */
  function initApp() {
    initSocket();
    initGeolocation();
    initSOS();
    initVoice();
    initCategories();
    initNav();
    initProfile();
    loadRecentAlerts();
    traiterFileAttente();
    setInterval(loadRecentAlerts, 15000); // repli si Socket.IO indisponible
  }

  /* ----- Socket.IO (temps réel) ----- */
  let activeSosAlerteId = null;

  function initSocket() {
    if (typeof io === 'undefined') return;
    const socket = io();
    socket.on('connect', () => {
      if (currentUser) socket.emit('auth:join', { role: 'citoyen', user_id: currentUser.id });
    });
    socket.on('alerte_mise_a_jour', (alerte) => {
      if (!currentUser || alerte.user_id !== currentUser.id) return;
      loadRecentAlerts();
      document.getElementById('bellBtn').classList.add('has-ping');
      if (alerte.id === activeSosAlerteId && alerte.statut === 'resolue') stopSosWatch();
      showToast(`${typeLabel(alerte.type)} #${alerte.id.slice(0, 8).toUpperCase()} — ${statutLabel(alerte.statut)}`);
    });
  }

  /* ----- Géolocalisation haute précision ----- */
  function capturePosition(pos) {
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      timestamp: pos.timestamp,
    };
  }

  function renderGps() {
    const gpsText = document.querySelector('.gps-strip span');
    const accBars = document.querySelector('.acc-bars');
    const accLabel = document.querySelector('.acc-label');
    if (!lastPosition) return;
    const acc = Math.round(lastPosition.accuracy);
    const good = acc <= 30;
    accBars.classList.toggle('good', good);
    accLabel.classList.toggle('good', good);
    accLabel.textContent = `±${acc} m`;
    gpsText.innerHTML = `Position détectée <b>±${acc} m</b>`;
  }

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`);
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};
      return addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || addr.city || addr.town || null;
    } catch { return null; }
  }

  function initGeolocation() {
    const gpsText = document.querySelector('.gps-strip span');
    if (!navigator.geolocation) {
      gpsText.textContent = 'Géolocalisation non disponible sur cet appareil';
      return;
    }
    gpsText.textContent = 'Détection de la position…';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        lastPosition = capturePosition(pos);
        renderGps();
        const quartier = await reverseGeocode(lastPosition.latitude, lastPosition.longitude);
        if (quartier) gpsText.innerHTML = `<b>${quartier}</b> · ±${Math.round(lastPosition.accuracy)} m`;
      },
      () => { gpsText.textContent = 'Position non disponible — autorisez la géolocalisation'; },
      GPS_OPTIONS
    );

    navigator.geolocation.watchPosition(
      (pos) => { lastPosition = capturePosition(pos); renderGps(); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  /* ----- Envoi d'une alerte (commun SOS / catégorie / vocal) ----- */
  /* ----- File d'attente hors-ligne -----
     Les Service Workers (et donc la Background Sync officielle) exigent un
     contexte sécurisé (HTTPS), indisponible ici. On reproduit l'essentiel en
     JS pur : localStorage + écoute de l'évènement 'online', sans dépendance
     à un contexte sécurisé. Les pièces jointes (photo/vidéo) ne sont pas
     mises en attente (taille incompatible avec les quotas localStorage) :
     elles nécessitent une connexion active au moment de l'envoi. */
  const FILE_ATTENTE_KEY = 'alertcitoyen_alertes_en_attente';

  function lireFileAttente() {
    try { return JSON.parse(localStorage.getItem(FILE_ATTENTE_KEY) || '[]'); } catch { return []; }
  }
  function ecrireFileAttente(liste) {
    localStorage.setItem(FILE_ATTENTE_KEY, JSON.stringify(liste));
  }
  function mettreEnAttente(champs) {
    const liste = lireFileAttente();
    liste.push(champs);
    ecrireFileAttente(liste);
    showToast("Pas de connexion — alerte enregistrée sur l'appareil, envoi automatique au retour du réseau.");
  }

  async function envoyerChampsAlerte(champs) {
    const formData = new FormData();
    Object.entries(champs).forEach(([cle, valeur]) => {
      if (valeur !== null && valeur !== undefined) formData.append(cle, valeur);
    });
    const res = await fetch(`${API}/alertes`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erreur || "Échec de l'envoi");
    return data;
  }

  async function traiterFileAttente() {
    const liste = lireFileAttente();
    if (!liste.length) return;
    const restantes = [];
    let envoyees = 0;
    for (const champs of liste) {
      try {
        await envoyerChampsAlerte(champs);
        envoyees += 1;
      } catch {
        restantes.push(champs);
      }
    }
    ecrireFileAttente(restantes);
    if (envoyees > 0) {
      loadRecentAlerts();
      showToast(`${envoyees} alerte(s) en attente envoyée(s) maintenant que la connexion est revenue.`);
    }
  }
  window.addEventListener('online', traiterFileAttente);

  /* ----- Envoi d'une alerte (commun SOS / catégorie / vocal) ----- */
  async function envoyerAlerte(type, description, photo, video) {
    if (!lastPosition) throw new Error('Position GPS indisponible — réessaie dans un instant.');

    const champs = {
      type,
      description: description || null,
      latitude: lastPosition.latitude,
      longitude: lastPosition.longitude,
      accuracy: lastPosition.accuracy,
      altitude: lastPosition.altitude,
      position_timestamp: lastPosition.timestamp ? new Date(lastPosition.timestamp).toISOString() : null,
      user_id: currentUser ? currentUser.id : null,
    };

    if (!navigator.onLine) {
      if (photo || video) throw new Error('Les photos et vidéos nécessitent une connexion internet pour être envoyées.');
      mettreEnAttente(champs);
      return { id: 'en-attente', horsLigne: true, ...champs };
    }

    try {
      const formData = new FormData();
      Object.entries(champs).forEach(([cle, valeur]) => {
        if (valeur !== null && valeur !== undefined) formData.append(cle, valeur);
      });
      if (photo) formData.append('photo', photo);
      if (video) formData.append('video', video);

      const res = await fetch(`${API}/alertes`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erreur || "Échec de l'envoi");
      loadRecentAlerts();
      return data;
    } catch (err) {
      // navigator.onLine ne reflète pas toujours la réalité ; une erreur
      // réseau ici (TypeError) confirme une vraie coupure de connexion.
      if (err instanceof TypeError) {
        if (photo || video) throw new Error('Connexion perdue — réessaie sans pièce jointe ou une fois reconnecté.');
        mettreEnAttente(champs);
        return { id: 'en-attente', horsLigne: true, ...champs };
      }
      throw err;
    }
  }

  /* ----- SOS (appui maintenu 3s) + suivi temps réel ----- */
  let activeSosWatchId = null;

  function startSosWatch(alerteId) {
    stopSosWatch();
    if (!navigator.geolocation) return;
    activeSosAlerteId = alerteId;
    let lastSent = 0;

    activeSosWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent < 5000) return;
        lastSent = now;
        lastPosition = capturePosition(pos);
        renderGps();

        fetch(`${API}/alertes/${alerteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: lastPosition.latitude,
            longitude: lastPosition.longitude,
            accuracy: lastPosition.accuracy,
            altitude: lastPosition.altitude,
            position_timestamp: new Date(lastPosition.timestamp).toISOString(),
          }),
        }).catch(() => {});
      },
      () => {},
      GPS_OPTIONS
    );
  }

  function stopSosWatch() {
    if (activeSosWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(activeSosWatchId);
    activeSosWatchId = null;
    activeSosAlerteId = null;
  }

  function initSOS() {
    const sosBtn = document.getElementById('sosBtn');
    const ring = document.getElementById('ringProgress');
    const overlay = document.getElementById('sosOverlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlaySub = document.getElementById('overlaySub');
    const overlayCode = document.getElementById('overlayCode');

    const CIRC = 521;
    let holdStart = null, raf = null, holding = false, triggered = false;

    function setRing(p) { ring.style.strokeDashoffset = String(CIRC - CIRC * p); }

    function startHold(e) {
      e.preventDefault();
      if (holding) return;
      if (!lastPosition) { showToast('Position GPS en cours de détection — réessaie dans un instant'); return; }
      triggered = false;
      holding = true;
      holdStart = performance.now();
      step();
    }
    function step() {
      if (!holding) return;
      const elapsed = performance.now() - holdStart;
      const p = Math.min(elapsed / SOS_DURATION, 1);
      setRing(p);
      if (p >= 1) { holding = false; trigger(); return; }
      raf = requestAnimationFrame(step);
    }
    function cancelHold() {
      if (!holding) return;
      holding = false;
      cancelAnimationFrame(raf);
      if (triggered) return;
      const start = CIRC - parseFloat(ring.style.strokeDashoffset || String(CIRC));
      const t0 = performance.now();
      (function unwind() {
        const dt = performance.now() - t0;
        const ratio = Math.min(dt / 220, 1);
        setRing((start / CIRC) * (1 - ratio));
        if (ratio < 1) requestAnimationFrame(unwind);
      })();
    }

    async function trigger() {
      triggered = true;
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      overlay.classList.remove('done');
      overlay.classList.add('open');
      overlayTitle.textContent = 'Transmission de votre position…';
      overlaySub.textContent = "Ne quittez pas l'application.";

      try {
        const alerte = await envoyerAlerte('sos', 'Alerte SOS');
        overlay.classList.add('done');
        if (alerte.horsLigne) {
          overlayTitle.textContent = 'Alerte enregistrée (hors connexion)';
          overlaySub.textContent = "Aucun réseau détecté. Elle sera transmise automatiquement dès que la connexion revient.";
          overlayCode.textContent = 'En attente d\'envoi';
        } else {
          overlayTitle.textContent = 'Alerte transmise';
          overlaySub.textContent = 'Les secours ont été notifiés. Votre position est suivie en temps réel.';
          overlayCode.textContent = `Suivi #${alerte.id.slice(0, 8).toUpperCase()}`;
          startSosWatch(alerte.id);
        }
      } catch (err) {
        overlay.classList.add('done');
        overlayTitle.textContent = "Échec de l'envoi";
        overlaySub.textContent = err.message || 'Vérifie ta connexion et réessaie.';
      } finally {
        setTimeout(() => setRing(0), 50);
      }
    }

    sosBtn.addEventListener('pointerdown', startHold);
    sosBtn.addEventListener('pointerup', cancelHold);
    sosBtn.addEventListener('pointerleave', cancelHold);
    sosBtn.addEventListener('pointercancel', cancelHold);

    document.getElementById('overlayClose').addEventListener('click', () => overlay.classList.remove('open'));
    document.getElementById('overlayCancel').addEventListener('click', () => overlay.classList.remove('open'));
  }

  /* ----- Catégories (feuille glissante) ----- */
  function initCategories() {
    const sheetBackdrop = document.getElementById('sheetBackdrop');
    const sheet = document.getElementById('sheet');
    const sheetIcon = document.getElementById('sheetIcon');
    const sheetTitle = document.getElementById('sheetTitle');
    const sheetDesc = document.getElementById('sheetDesc');
    const sheetError = document.getElementById('sheetError');
    const sheetSend = document.getElementById('sheetSend');
    const sheetMicBtn = document.getElementById('sheetMicBtn');
    const sheetPhotoInput = document.getElementById('sheetPhotoInput');
    const sheetVideoInput = document.getElementById('sheetVideoInput');
    const sheetPhotoLabel = document.getElementById('sheetPhotoLabel');
    const sheetVideoLabel = document.getElementById('sheetVideoLabel');
    // Les <input> sont des frères des <label for="..."> (association via
    // l'attribut for), pas des enfants : .closest('label') ne les trouve pas.
    const sheetPhotoLabelEl = document.querySelector('label[for="sheetPhotoInput"]');
    const sheetVideoLabelEl = document.querySelector('label[for="sheetVideoInput"]');
    let currentType = null;

    // Dictée de la description — instance dédiée, distincte du bouton vocal
    // de l'accueil (catégorie déjà connue ici, pas de détection à faire).
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    let sheetRecognition = null;
    let sheetRecording = false;

    function stopDictation() {
      if (sheetRecognition) { sheetRecognition.stop(); sheetRecognition = null; }
      sheetRecording = false;
      sheetMicBtn.classList.remove('recording');
    }

    sheetMicBtn.addEventListener('click', () => {
      if (sheetRecording) { stopDictation(); return; }
      if (!SpeechRecognitionImpl) {
        showToast("La dictée vocale n'est pas disponible sur ce navigateur.");
        return;
      }
      sheetRecognition = new SpeechRecognitionImpl();
      sheetRecognition.lang = 'fr-FR';
      sheetRecognition.continuous = true;
      sheetRecognition.interimResults = false;
      sheetRecognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const morceau = e.results[i][0].transcript.trim();
            sheetDesc.value = sheetDesc.value ? `${sheetDesc.value} ${morceau}` : morceau;
            sheetError.classList.remove('show');
          }
        }
      };
      sheetRecognition.onerror = (e) => {
        stopDictation();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          showToast("Micro refusé ou indisponible (le site doit être en HTTPS sur la plupart des téléphones).");
        }
      };
      sheetRecognition.onend = () => { if (sheetRecording) stopDictation(); };
      sheetRecognition.start();
      sheetRecording = true;
      sheetMicBtn.classList.add('recording');
    });

    function resetMedia() {
      sheetPhotoInput.value = '';
      sheetVideoInput.value = '';
      sheetPhotoLabel.textContent = 'Photo';
      sheetVideoLabel.textContent = 'Vidéo';
      sheetPhotoLabelEl.classList.remove('has-file');
      sheetVideoLabelEl.classList.remove('has-file');
    }
    sheetPhotoInput.addEventListener('change', () => {
      const has = sheetPhotoInput.files.length > 0;
      sheetPhotoLabel.textContent = has ? 'Photo ajoutée ✓' : 'Photo';
      sheetPhotoLabelEl.classList.toggle('has-file', has);
    });
    sheetVideoInput.addEventListener('change', () => {
      const has = sheetVideoInput.files.length > 0;
      sheetVideoLabel.textContent = has ? 'Vidéo ajoutée ✓' : 'Vidéo';
      sheetVideoLabelEl.classList.toggle('has-file', has);
    });

    document.querySelectorAll('.cat').forEach((el) => {
      el.addEventListener('click', () => {
        const label = el.dataset.cat;
        currentType = toSlug(label);
        const icon = iconFor(currentType);
        sheetTitle.textContent = label;
        sheetIcon.style.background = icon.bg;
        sheetIcon.innerHTML = icon.svg;
        sheetDesc.value = '';
        sheetError.classList.remove('show');
        resetMedia();
        sheet.classList.add('open');
        sheetBackdrop.classList.add('open');
      });
    });

    function closeSheet() {
      stopDictation();
      sheet.classList.remove('open');
      sheetBackdrop.classList.remove('open');
    }
    document.getElementById('sheetCancel').addEventListener('click', closeSheet);
    sheetBackdrop.addEventListener('click', closeSheet);

    sheetSend.addEventListener('click', async () => {
      const description = sheetDesc.value.trim();
      if (!description) {
        sheetError.textContent = 'Merci de décrire les faits, par écrit ou à la voix (🎤), avant d\'envoyer.';
        sheetError.classList.add('show');
        return;
      }
      stopDictation();
      sheetSend.disabled = true;
      try {
        const photo = sheetPhotoInput.files[0] || null;
        const video = sheetVideoInput.files[0] || null;
        const alerte = await envoyerAlerte(currentType, description, photo, video);
        closeSheet();
        if (alerte.horsLigne) {
          showToast("Alerte enregistrée — sera envoyée dès le retour de la connexion.");
        } else {
          showToast(`Alerte envoyée — #${alerte.id.slice(0, 8).toUpperCase()}`);
        }
      } catch (err) {
        showToast(`Échec de l'envoi : ${err.message || 'réessaie'}`);
      } finally {
        sheetSend.disabled = false;
      }
    });
  }

  /* ----- Signalement vocal — MediaRecorder + reconnaissance fr-FR ----- */
  function initVoice() {
    const voiceBtn = document.getElementById('voiceBtn');
    const voiceSub = document.getElementById('voiceSub');
    const transcript = document.getElementById('transcript');
    const transcriptText = document.getElementById('transcriptText');
    const transcriptCat = document.getElementById('transcriptCat');
    const retryBtn = document.getElementById('retryBtn');
    const sendVoiceBtn = document.getElementById('sendVoiceBtn');

    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null, recording = false, finalText = '';

    function detectCategory(text) {
      const t = text.toLowerCase();
      if (/feu|incend|br[uû]l/.test(t)) return 'incendie';
      if (/accident|voiture|moto|collision/.test(t)) return 'accident';
      if (/agress|vol[eé]|arme|braqu/.test(t)) return 'agression';
      if (/inond|eau|pluie|crue/.test(t)) return 'inondation';
      if (/malaise|m[ée]dic|bless[ée]|secours|[ée]vanou/.test(t)) return 'secours médical';
      return 'autre';
    }

    function startRecording() {
      if (!SpeechRecognitionImpl) {
        showToast("La saisie vocale n'est pas disponible sur ce navigateur. Utilise une catégorie ci-dessous.");
        return;
      }

      finalText = '';
      transcript.classList.remove('show');
      // SpeechRecognition gère elle-même l'accès au micro (pas besoin de
      // getUserMedia ici) ; sur un site non-HTTPS, certains navigateurs la
      // bloquent silencieusement — on le détecte via onerror ci-dessous.
      recognition = new SpeechRecognitionImpl();
      recognition.lang = 'fr-FR';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += `${e.results[i][0].transcript} `;
        }
      };
      recognition.onerror = (e) => {
        recording = false;
        voiceBtn.classList.remove('recording');
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          showToast("Micro refusé ou indisponible (le site doit être en HTTPS sur la plupart des téléphones).");
        } else if (e.error === 'no-speech') {
          showToast('Aucune parole détectée, réessaie.');
        } else {
          showToast("Erreur d'écoute — réessaie.");
        }
        voiceSub.textContent = "Parlez, on s'occupe du reste";
      };
      recognition.start();

      recording = true;
      voiceBtn.classList.add('recording');
      voiceSub.textContent = 'Enregistrement en cours — touchez pour arrêter';
    }

    function stopRecording() {
      if (recognition) { recognition.stop(); recognition = null; }
      if (!recording) return;

      recording = false;
      voiceBtn.classList.remove('recording');
      voiceSub.textContent = "Parlez, on s'occupe du reste";

      const text = finalText.trim();
      if (text) {
        transcriptText.textContent = text;
        transcriptCat.value = detectCategory(text);
        transcript.classList.add('show');
      } else {
        showToast('Aucune parole détectée, réessaie.');
      }
    }

    voiceBtn.addEventListener('click', () => (recording ? stopRecording() : startRecording()));
    retryBtn.addEventListener('click', () => { transcript.classList.remove('show'); startRecording(); });

    sendVoiceBtn.addEventListener('click', async () => {
      sendVoiceBtn.disabled = true;
      try {
        const alerte = await envoyerAlerte(toSlug(transcriptCat.value), transcriptText.textContent);
        transcript.classList.remove('show');
        if (alerte.horsLigne) {
          showToast("Alerte enregistrée — sera envoyée dès le retour de la connexion.");
        } else {
          showToast(`Alerte envoyée — #${alerte.id.slice(0, 8).toUpperCase()}`);
        }
      } catch (err) {
        showToast(`Échec de l'envoi : ${err.message || 'réessaie'}`);
      } finally {
        sendVoiceBtn.disabled = false;
      }
    });
  }

  /* ----- Mes alertes récentes ----- */
  function recentCardHTML(alerte) {
    const icon = iconFor(alerte.type);
    return `
      <div class="recent">
        <div class="ri" style="background:${icon.bg}">${icon.svg}</div>
        <div class="rtext">
          <div class="rtitle">${typeLabel(alerte.type)}</div>
          <div class="rtime">#${alerte.id.slice(0, 8).toUpperCase()} · ${timeAgo(alerte.created_at)}</div>
        </div>
        <span class="pill ${statutPillClass(alerte.statut)}">${statutLabel(alerte.statut)}</span>
      </div>
    `;
  }

  async function loadRecentAlerts() {
    const home = document.getElementById('recentList');
    const full = document.getElementById('recentListFull');
    const empty = '<div class="empty-state">Aucune alerte envoyée pour le moment.</div>';
    if (!currentUser) { home.innerHTML = empty; full.innerHTML = empty; return; }

    try {
      const res = await fetch(`${API}/alertes`);
      const all = await res.json();
      const mine = all
        .filter((a) => a.user_id === currentUser.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (!mine.length) { home.innerHTML = empty; full.innerHTML = empty; return; }

      home.innerHTML = mine.slice(0, 5).map(recentCardHTML).join('');
      full.innerHTML = mine.map(recentCardHTML).join('');
    } catch {
      const erreur = '<div class="empty-state">Connexion au serveur impossible.</div>';
      home.innerHTML = erreur;
      full.innerHTML = erreur;
    }
  }

  /* ----- Navigation (bottom nav + cloche) ----- */
  function initNav() {
    const views = {
      accueil: document.getElementById('viewAccueil'),
      alertes: document.getElementById('viewAlertes'),
      carte: document.getElementById('viewCarte'),
      profil: document.getElementById('viewProfil'),
    };
    const navItems = document.querySelectorAll('.navitem');

    function showView(name) {
      Object.entries(views).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
      navItems.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
      if (name === 'carte') initCitizenMap();
      if (name === 'profil') renderProfile();
    }

    navItems.forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));

    document.getElementById('bellBtn').addEventListener('click', () => {
      document.getElementById('bellBtn').classList.remove('has-ping');
      showView('alertes');
    });
  }

  /* ----- Carte citoyenne (lecture seule) ----- */
  function colorForPriorite(priorite) {
    if (priorite === 'haute') return '#C8102E';
    if (priorite === 'basse' || priorite === 'faible') return '#009639';
    return '#FCD116';
  }

  function initCitizenMap() {
    if (citizenMap) { citizenMap.invalidateSize(); loadCitizenMapMarkers(); return; }
    const center = lastPosition ? [lastPosition.latitude, lastPosition.longitude] : LIBREVILLE;
    citizenMap = L.map('citizenMap').setView(center, 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(citizenMap);
    loadCitizenMapMarkers();
  }

  async function loadCitizenMapMarkers() {
    try {
      const res = await fetch(`${API}/alertes`);
      const alertes = await res.json();
      alertes.forEach((a) => {
        if (a.latitude == null || a.longitude == null) return;
        const icon = L.divIcon({
          className: '',
          html: `<span style="display:block;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(11,31,58,.4);background:${colorForPriorite(a.priorite)}"></span>`,
          iconSize: [14, 14],
        });
        L.marker([a.latitude, a.longitude], { icon }).addTo(citizenMap).bindPopup(`<strong>${typeLabel(a.type)}</strong>`);
      });
    } catch { /* silencieux : la carte reste affichée sans marqueurs */ }
  }

  /* ----- Profil ----- */
  function initProfile() {
    document.getElementById('profileResetBtn').addEventListener('click', () => {
      if (!confirm('Réinitialiser votre inscription ? Vous devrez recréer votre compte citoyen.')) return;
      localStorage.removeItem(COMPTE_KEY);
      window.location.reload();
    });
  }

  async function renderProfile() {
    if (!currentUser) return;
    document.getElementById('profileNom').textContent = `${currentUser.prenom || ''} ${currentUser.nom || ''}`.trim();
    document.getElementById('profileQuartier').textContent = currentUser.quartier || 'Quartier non renseigné';
    document.getElementById('profileTelephone').textContent = currentUser.telephone || '—';
    document.getElementById('profileWhatsapp').textContent = currentUser.whatsapp || '—';
    const avatar = document.getElementById('profileAvatar');
    if (currentUser.photo) avatar.innerHTML = `<img src="${currentUser.photo}" alt="Photo de profil" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;

    try {
      const res = await fetch(`${API}/comptes/${currentUser.id}`);
      const data = await res.json();
      const historique = data.historique || { totalAlertes: 0, alertesResolues: 0, fiabilite: 'Nouveau compte' };
      document.getElementById('profileTotalAlertes').textContent = historique.totalAlertes;
      document.getElementById('profileAlertesResolues').textContent = historique.alertesResolues;
      document.getElementById('profileFiabilite').textContent = historique.fiabilite;
    } catch { /* silencieux : les stats restent à leur valeur par défaut */ }
  }

  /* ===== Démarrage ===== */
  currentUser = getCompte();
  document.addEventListener('DOMContentLoaded', initOnboarding);
})();
