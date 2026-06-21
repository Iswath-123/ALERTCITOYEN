(() => {
  const STORAGE_KEY = 'alertcitoyen_mes_alertes';
  const COMPTE_KEY = 'alertcitoyen_compte_citoyen';
  const SOS_HOLD_MS = 3000;
  const LIBREVILLE = [0.3924, 9.4536];
  const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

  const TYPE_INFO = {
    sos: { label: 'SOS Urgence', icon: '🚨' },
    agression: { label: 'Agression', icon: '🥊' },
    accident: { label: 'Accident', icon: '🚗' },
    incendie: { label: 'Incendie', icon: '🔥' },
    inondation: { label: 'Inondation', icon: '🌊' },
    secours_medical: { label: 'Secours médical', icon: '⛑️' },
    autre: { label: 'Autre', icon: '❓' },
  };

  const STATUT_LABEL = {
    en_attente: 'En attente',
    en_cours: 'En cours',
    en_intervention: 'En intervention',
    resolue: 'Résolue',
  };

  // -- Éléments
  const gpsBarText = document.getElementById('gps-bar-text');
  const gpsBarRefresh = document.getElementById('gps-bar-refresh');

  const sosBtn = document.getElementById('sos-btn');
  const sosProgressFill = document.getElementById('sos-progress-fill');

  const voiceMainBtn = document.getElementById('voice-main-btn');
  const voicePanel = document.getElementById('voice-panel');
  const voiceBack = document.getElementById('voice-back');
  const voiceMicBtn = document.getElementById('voice-mic-btn');
  const micIndicator = document.getElementById('mic-indicator');
  const voiceStatusText = document.getElementById('voice-status-text');
  const voiceTranscript = document.getElementById('voice-transcript');
  const voiceTypeDetected = document.getElementById('voice-type-detected');
  const voiceSendBtn = document.getElementById('voice-send-btn');

  const categoriesView = document.getElementById('categories-view');
  const sosView = document.getElementById('sos-view');
  const voiceSection = document.querySelector('.voice-section');

  const formSection = document.getElementById('form-section');
  const formTitle = document.getElementById('form-title');
  const formBack = document.getElementById('form-back');
  const descriptionInput = document.getElementById('description');
  const gpsBtn = document.getElementById('gps-btn');
  const positionPreview = document.getElementById('position-preview');
  const sendBtn = document.getElementById('send-btn');

  const confirmationSection = document.getElementById('confirmation-section');
  const trackingNumber = document.getElementById('tracking-number');
  const newAlertBtn = document.getElementById('new-alert-btn');

  const recentListHome = document.getElementById('recent-list-home');
  const recentListFull = document.getElementById('recent-list-full');

  const navButtons = document.querySelectorAll('.nav-btn');
  const views = {
    accueil: document.getElementById('view-accueil'),
    alertes: document.getElementById('view-alertes'),
    carte: document.getElementById('view-carte'),
    profil: document.getElementById('view-profil'),
  };

  const profileAvatar = document.getElementById('profile-avatar');
  const profileNomEl = document.getElementById('profile-nom');
  const profileQuartierEl = document.getElementById('profile-quartier');
  const profileTelephoneEl = document.getElementById('profile-telephone');
  const profileWhatsappEl = document.getElementById('profile-whatsapp');
  const profileResetBtn = document.getElementById('profile-reset-btn');
  const profileTotalAlertesEl = document.getElementById('profile-total-alertes');
  const profileAlertesResoluesEl = document.getElementById('profile-alertes-resolues');
  const profileFiabiliteEl = document.getElementById('profile-fiabilite');

  let currentType = null;
  let currentPosition = null;
  let citizenMap = null;

  // ===================================================================
  // Compte citoyen (inscription obligatoire, sans OTP pour l'instant)
  // ===================================================================

  function getCompte() {
    try {
      return JSON.parse(localStorage.getItem(COMPTE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setCompte(compte) {
    localStorage.setItem(COMPTE_KEY, JSON.stringify(compte));
  }

  // TODO(OTP): côté client, déclencher l'envoi du SMS ici (ex: appel à un
  // endpoint /api/comptes/envoyer-otp) puis demander la saisie du code avant
  // d'appeler inscription-citoyen. Pour l'instant la vérification est un stub
  // qui valide toujours le numéro (voir verifierOTP côté serveur).

  const registrationGate = document.getElementById('registration-gate');
  const regNom = document.getElementById('reg-nom');
  const regPrenom = document.getElementById('reg-prenom');
  const regTelephone = document.getElementById('reg-telephone');
  const regWhatsapp = document.getElementById('reg-whatsapp');
  const regWhatsappIdentique = document.getElementById('reg-whatsapp-identique');
  const regQuartier = document.getElementById('reg-quartier');
  const regPhotoBtn = document.getElementById('reg-photo-btn');
  const regPhotoInput = document.getElementById('reg-photo-input');
  const regPhotoPreview = document.getElementById('reg-photo-preview');
  const regError = document.getElementById('reg-error');
  const regSubmitBtn = document.getElementById('reg-submit-btn');

  let regPhotoDataUrl = null;

  regWhatsappIdentique.addEventListener('change', () => {
    regWhatsapp.disabled = regWhatsappIdentique.checked;
    if (regWhatsappIdentique.checked) regWhatsapp.value = regTelephone.value;
  });
  regTelephone.addEventListener('input', () => {
    if (regWhatsappIdentique.checked) regWhatsapp.value = regTelephone.value;
  });
  regWhatsapp.disabled = regWhatsappIdentique.checked;

  regPhotoBtn.addEventListener('click', () => regPhotoInput.click());
  regPhotoInput.addEventListener('change', () => {
    const file = regPhotoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      regPhotoDataUrl = reader.result;
      regPhotoPreview.innerHTML = `<img src="${regPhotoDataUrl}" alt="Photo de profil" />`;
    };
    reader.readAsDataURL(file);
  });

  async function submitRegistration() {
    const nom = regNom.value.trim();
    const prenom = regPrenom.value.trim();
    const telephone = regTelephone.value.trim();
    const whatsapp = (regWhatsappIdentique.checked ? telephone : regWhatsapp.value.trim());
    const quartier = regQuartier.value.trim();

    regError.classList.add('hidden');
    if (!nom || !prenom || !telephone || !whatsapp || !quartier) {
      regError.textContent = 'Tous les champs sont requis, sauf la photo.';
      regError.classList.remove('hidden');
      return;
    }

    regSubmitBtn.disabled = true;
    regSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Création du compte...';

    try {
      const res = await fetch('/api/comptes/inscription-citoyen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, prenom, telephone, whatsapp, quartier, photo: regPhotoDataUrl }),
      });
      const data = await res.json();

      if (!res.ok) {
        regError.textContent = data.erreur || 'Inscription impossible.';
        regError.classList.remove('hidden');
        return;
      }

      setCompte(data);
      registrationGate.classList.add('hidden');
      initApp();
    } catch {
      regError.textContent = 'Erreur réseau. Vérifiez votre connexion et réessayez.';
      regError.classList.remove('hidden');
    } finally {
      regSubmitBtn.disabled = false;
      regSubmitBtn.innerHTML = '<i class="fa-solid fa-user-check"></i> Créer mon compte';
    }
  }

  regSubmitBtn.addEventListener('click', submitRegistration);

  // ===================================================================
  // Position GPS haute précision
  // ===================================================================

  function detectPosition() {
    if (!navigator.geolocation) {
      gpsBarText.textContent = 'Géolocalisation non disponible sur cet appareil';
      return;
    }
    gpsBarText.textContent = 'Localisation en cours...';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        currentPosition = capturePosition(pos);
        gpsBarText.textContent = 'Position détectée — recherche du quartier...';
        const quartier = await reverseGeocode(currentPosition.latitude, currentPosition.longitude);
        const precision = `Position précise à ${Math.round(currentPosition.accuracy)} m`;
        gpsBarText.textContent = quartier ? `📍 ${quartier} · ${precision}` : `📍 ${precision}`;
        if (!regQuartier.value && quartier) regQuartier.value = quartier;
      },
      () => {
        gpsBarText.textContent = 'Position non disponible — autorisez la géolocalisation';
      },
      GPS_OPTIONS
    );
  }

  function capturePosition(pos) {
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      timestamp: pos.timestamp,
    };
  }

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};
      return addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || addr.city || addr.town || null;
    } catch {
      return null;
    }
  }

  gpsBarRefresh.addEventListener('click', detectPosition);

  // ===================================================================
  // Bouton SOS — appui maintenu 3 secondes + suivi temps réel
  // ===================================================================

  const circumference = 2 * Math.PI * 79;
  sosProgressFill.style.strokeDasharray = String(circumference);
  sosProgressFill.style.strokeDashoffset = String(circumference);

  let sosPressStart = null;
  let sosTimer = null;
  let sosRafId = null;
  let sosTriggered = false;

  let activeSosWatchId = null;
  let activeSosAlerteId = null;

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
        const position = capturePosition(pos);
        currentPosition = position;

        fetch(`/api/alertes/${alerteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: position.latitude,
            longitude: position.longitude,
            accuracy: position.accuracy,
            altitude: position.altitude,
            position_timestamp: new Date(position.timestamp).toISOString(),
          }),
        }).catch(() => {});
      },
      () => {},
      GPS_OPTIONS
    );
  }

  function stopSosWatch() {
    if (activeSosWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(activeSosWatchId);
    }
    activeSosWatchId = null;
    activeSosAlerteId = null;
  }

  function sosAnimate() {
    const elapsed = (performance.now ? performance.now() : Date.now()) - sosPressStart;
    const ratio = Math.min(elapsed / SOS_HOLD_MS, 1);
    sosProgressFill.style.strokeDashoffset = String(circumference * (1 - ratio));
    if (ratio < 1 && sosTimer) {
      sosRafId = requestAnimationFrame(sosAnimate);
    }
  }

  function sosStartPress(e) {
    e.preventDefault();
    if (sosTimer) return;
    sosTriggered = false;
    sosPressStart = performance.now ? performance.now() : Date.now();
    sosBtn.classList.add('pressing');
    sosRafId = requestAnimationFrame(sosAnimate);
    sosTimer = setTimeout(sosTrigger, SOS_HOLD_MS);
  }

  function sosResetRing() {
    sosProgressFill.style.transition = 'stroke-dashoffset 0.3s ease';
    sosProgressFill.style.strokeDashoffset = String(circumference);
    setTimeout(() => { sosProgressFill.style.transition = 'none'; }, 320);
  }

  function sosCancelPress() {
    clearTimeout(sosTimer);
    sosTimer = null;
    cancelAnimationFrame(sosRafId);
    sosBtn.classList.remove('pressing');
    if (!sosTriggered) {
      sosResetRing();
    }
  }

  function sosTrigger() {
    sosTimer = null;
    sosTriggered = true;
    sosBtn.classList.remove('pressing');
    sosProgressFill.style.strokeDashoffset = '0';
    sendAlert('sos', null);
    setTimeout(sosResetRing, 400);
  }

  sosBtn.addEventListener('pointerdown', sosStartPress);
  sosBtn.addEventListener('pointerup', sosCancelPress);
  sosBtn.addEventListener('pointerleave', sosCancelPress);
  sosBtn.addEventListener('pointercancel', sosCancelPress);

  // ===================================================================
  // Navigation entre vues
  // ===================================================================

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
    navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
    if (name === 'carte') initCitizenMap();
    if (name === 'profil') renderProfile();
  }

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // ===================================================================
  // Formulaire catégorie
  // ===================================================================

  function showForm(type, label) {
    currentType = type;
    descriptionInput.value = '';
    positionPreview.classList.add('hidden');
    positionPreview.innerHTML = '';
    formTitle.textContent = `${TYPE_INFO[type]?.icon || ''} ${label}`.trim();

    sosView.classList.add('hidden');
    voiceSection.classList.add('hidden');
    categoriesView.classList.add('hidden');
    confirmationSection.classList.add('hidden');
    formSection.classList.remove('hidden');
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    requestGpsForForm();
  }

  function showCategories() {
    formSection.classList.add('hidden');
    voicePanel.classList.add('hidden');
    confirmationSection.classList.add('hidden');
    sosView.classList.remove('hidden');
    voiceSection.classList.remove('hidden');
    categoriesView.classList.remove('hidden');
    currentType = null;
    stopSosWatch();
  }

  function requestGpsForForm() {
    if (currentPosition) {
      renderPositionPreview(currentPosition);
    }
    if (!navigator.geolocation) return;

    gpsBtn.disabled = true;
    gpsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Localisation en cours...';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentPosition = capturePosition(pos);
        renderPositionPreview(currentPosition);
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Mettre à jour ma position';
      },
      (err) => {
        positionPreview.classList.remove('hidden');
        positionPreview.textContent = `Impossible d'obtenir la position (${err.message}).`;
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Utiliser ma position GPS';
      },
      GPS_OPTIONS
    );
  }

  function renderPositionPreview({ latitude, longitude, accuracy }) {
    const lat = latitude.toFixed(5);
    const lon = longitude.toFixed(5);
    const delta = 0.01;
    const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join(',');
    const precise = accuracy != null && accuracy <= 30;

    positionPreview.classList.remove('hidden');
    positionPreview.innerHTML = `
      <div><i class="fa-solid fa-map-pin"></i> Position détectée : ${lat}, ${lon}</div>
      ${accuracy != null ? `<span class="accuracy-badge ${precise ? '' : 'imprecise'}"><i class="fa-solid fa-crosshairs"></i> Position précise à ${Math.round(accuracy)} m</span>` : ''}
      <iframe loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${latitude},${longitude}"></iframe>
    `;
  }

  document.getElementById('categories-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;
    showForm(btn.dataset.type, btn.dataset.label);
  });

  formBack.addEventListener('click', showCategories);
  gpsBtn.addEventListener('click', requestGpsForForm);
  sendBtn.addEventListener('click', () => sendAlert(currentType, descriptionInput.value.trim() || null));
  newAlertBtn.addEventListener('click', showCategories);

  // ===================================================================
  // Envoi d'alerte (commun SOS / catégorie / vocal)
  // ===================================================================

  function getMyAlertIds() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function addMyAlertId(id) {
    const ids = getMyAlertIds();
    if (!ids.includes(id)) {
      ids.unshift(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
  }

  async function sendAlert(type, description) {
    const compte = getCompte();
    [sendBtn, voiceSendBtn].forEach((btn) => {
      btn.disabled = true;
    });

    try {
      const res = await fetch('/api/alertes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          description,
          latitude: currentPosition?.latitude ?? null,
          longitude: currentPosition?.longitude ?? null,
          accuracy: currentPosition?.accuracy ?? null,
          altitude: currentPosition?.altitude ?? null,
          position_timestamp: currentPosition?.timestamp ? new Date(currentPosition.timestamp).toISOString() : null,
          user_id: compte?.id ?? null,
        }),
      });

      if (!res.ok) throw new Error('Échec de l\'envoi');

      const alerte = await res.json();
      addMyAlertId(alerte.id);
      showConfirmation(alerte);
      loadRecentAlertes();

      if (type === 'sos') {
        startSosWatch(alerte.id);
      }
    } catch {
      alert("Erreur lors de l'envoi de l'alerte. Vérifiez votre connexion et réessayez.");
    } finally {
      [sendBtn, voiceSendBtn].forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  function showConfirmation(alerte) {
    formSection.classList.add('hidden');
    voicePanel.classList.add('hidden');
    confirmationSection.classList.remove('hidden');
    trackingNumber.textContent = `#${alerte.id.slice(0, 8).toUpperCase()}`;
  }

  // ===================================================================
  // Signalement vocal — MediaRecorder + reconnaissance vocale fr-FR
  // ===================================================================

  let mediaRecorder = null;
  let mediaStream = null;
  let recognition = null;
  let isRecording = false;
  let finalTranscript = '';

  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

  voiceMainBtn.addEventListener('click', () => {
    sosView.classList.add('hidden');
    voiceSection.classList.add('hidden');
    categoriesView.classList.add('hidden');
    confirmationSection.classList.add('hidden');
    finalTranscript = '';
    voiceTranscript.innerHTML = '<span class="placeholder">La transcription apparaîtra ici...</span>';
    voiceTypeDetected.classList.add('hidden');
    voiceSendBtn.classList.add('hidden');
    voicePanel.classList.remove('hidden');

    if (!SpeechRecognitionImpl) {
      voiceStatusText.textContent = 'Reconnaissance vocale non supportée sur ce navigateur. Utilisez la saisie par catégorie.';
      voiceMicBtn.disabled = true;
    }
  });

  voiceBack.addEventListener('click', () => {
    stopVoiceCapture();
    showCategories();
  });

  function detectTypeFromText(text) {
    const t = text.toLowerCase();
    if (/agress|attaqu|vol[eé]|braqu/.test(t)) return 'agression';
    if (/incendie|feu|br[uû]l/.test(t)) return 'incendie';
    if (/accident|collision|renvers/.test(t)) return 'accident';
    if (/inond|crue|d[ée]bord/.test(t)) return 'inondation';
    if (/secours|m[ée]dical|malaise|bless[ée]|[ée]vanou/.test(t)) return 'secours_medical';
    return 'autre';
  }

  async function startVoiceCapture() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.start();
    } catch {
      voiceStatusText.textContent = "Microphone indisponible — vérifiez les autorisations.";
      return;
    }

    finalTranscript = '';
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += `${transcriptPart} `;
        } else {
          interim += transcriptPart;
        }
      }
      voiceTranscript.textContent = (finalTranscript + interim).trim() || '...';
    };

    recognition.onerror = () => {
      voiceStatusText.textContent = 'Erreur de reconnaissance vocale. Réessayez.';
    };

    recognition.start();

    isRecording = true;
    micIndicator.classList.add('recording');
    voiceMicBtn.classList.add('recording');
    voiceMicBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Arrêter l\'enregistrement';
    voiceStatusText.textContent = 'Enregistrement en cours... parlez clairement';
  }

  function stopVoiceCapture() {
    if (recognition) {
      recognition.stop();
      recognition = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (isRecording) {
      isRecording = false;
      micIndicator.classList.remove('recording');
      voiceMicBtn.classList.remove('recording');
      voiceMicBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Redémarrer l\'enregistrement';
      voiceStatusText.textContent = 'Enregistrement terminé';

      const transcript = finalTranscript.trim();
      if (transcript) {
        const detectedType = detectTypeFromText(transcript);
        const info = TYPE_INFO[detectedType];
        voiceTypeDetected.classList.remove('hidden');
        voiceTypeDetected.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Catégorie détectée : <strong>${info.icon} ${info.label}</strong>`;
        voiceSendBtn.classList.remove('hidden');
        voiceSendBtn.dataset.type = detectedType;
        voiceSendBtn.dataset.description = transcript;
      }
    }
  }

  voiceMicBtn.addEventListener('click', () => {
    if (isRecording) {
      stopVoiceCapture();
    } else {
      requestGpsForForm();
      startVoiceCapture();
    }
  });

  voiceSendBtn.addEventListener('click', () => {
    sendAlert(voiceSendBtn.dataset.type || 'autre', voiceSendBtn.dataset.description || null);
  });

  // ===================================================================
  // Mes alertes récentes
  // ===================================================================

  function formatHeure(createdAt) {
    const date = new Date(createdAt.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function recentCardHTML(alerte) {
    const info = TYPE_INFO[alerte.type] || { label: alerte.type, icon: '📍' };
    return `
      <li class="recent-card">
        <div class="recent-info">
          <span class="recent-type">${info.icon} ${info.label}</span>
          <span class="recent-meta">#${alerte.id.slice(0, 8).toUpperCase()} · ${formatHeure(alerte.created_at)}</span>
        </div>
        <span class="badge statut-${alerte.statut}">${STATUT_LABEL[alerte.statut] || alerte.statut}</span>
      </li>
    `;
  }

  async function loadRecentAlertes() {
    const myIds = getMyAlertIds();
    if (!myIds.length) {
      const empty = '<li class="empty-state">Aucune alerte envoyée pour le moment.</li>';
      recentListHome.innerHTML = empty;
      recentListFull.innerHTML = empty;
      return;
    }

    try {
      const res = await fetch('/api/alertes');
      const alertes = await res.json();
      const mine = alertes.filter((a) => myIds.includes(a.id));

      if (!mine.length) {
        const empty = '<li class="empty-state">Aucune alerte envoyée pour le moment.</li>';
        recentListHome.innerHTML = empty;
        recentListFull.innerHTML = empty;
        return;
      }

      const html = mine.map(recentCardHTML).join('');
      recentListHome.innerHTML = mine.slice(0, 3).map(recentCardHTML).join('');
      recentListFull.innerHTML = html;

      const sosActive = mine.find((a) => a.id === activeSosAlerteId);
      if (sosActive && sosActive.statut === 'resolue') {
        stopSosWatch();
      }
    } catch {
      const errState = '<li class="empty-state">Impossible de charger vos alertes.</li>';
      recentListHome.innerHTML = errState;
      recentListFull.innerHTML = errState;
    }
  }

  // ===================================================================
  // Carte citoyenne (lecture seule)
  // ===================================================================

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

  function initCitizenMap() {
    if (citizenMap) {
      citizenMap.invalidateSize();
      loadCitizenMapMarkers();
      return;
    }

    const center = currentPosition ? [currentPosition.latitude, currentPosition.longitude] : LIBREVILLE;
    citizenMap = L.map('citizen-map').setView(center, 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(citizenMap);

    loadCitizenMapMarkers();
  }

  async function loadCitizenMapMarkers() {
    try {
      const res = await fetch('/api/alertes');
      const alertes = await res.json();
      alertes.forEach((a) => {
        if (a.latitude == null || a.longitude == null) return;
        const icon = L.divIcon({
          className: '',
          html: `<span class="map-marker" style="background:${colorForPriorite(a.priorite)}"></span>`,
          iconSize: [16, 16],
        });
        const info = TYPE_INFO[a.type] || { label: a.type, icon: '📍' };
        L.marker([a.latitude, a.longitude], { icon })
          .addTo(citizenMap)
          .bindPopup(`<strong>${info.icon} ${info.label}</strong><br>${STATUT_LABEL[a.statut] || a.statut}`);
      });
    } catch {
      // silencieux : la carte reste affichée sans marqueurs
    }
  }

  // ===================================================================
  // Profil (fiche issue de l'inscription obligatoire)
  // ===================================================================

  async function renderProfile() {
    const compte = getCompte();
    if (!compte) return;

    profileNomEl.textContent = `${compte.prenom || ''} ${compte.nom || ''}`.trim();
    profileQuartierEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${compte.quartier || 'Quartier non renseigné'}`;
    profileTelephoneEl.innerHTML = `<i class="fa-solid fa-phone"></i> ${compte.telephone || '—'}`;
    profileWhatsappEl.innerHTML = `<i class="fa-brands fa-whatsapp"></i> ${compte.whatsapp || '—'}`;
    profileAvatar.innerHTML = compte.photo
      ? `<img src="${compte.photo}" alt="Photo de profil" />`
      : '<i class="fa-solid fa-user"></i>';

    try {
      const res = await fetch(`/api/comptes/${compte.id}`);
      const data = await res.json();
      const historique = data.historique || { totalAlertes: 0, alertesResolues: 0, fiabilite: 'Nouveau compte' };
      profileTotalAlertesEl.textContent = historique.totalAlertes;
      profileAlertesResoluesEl.textContent = historique.alertesResolues;
      profileFiabiliteEl.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${historique.fiabilite}`;
    } catch {
      // silencieux : les stats restent à leur valeur par défaut
    }
  }

  profileResetBtn.addEventListener('click', () => {
    if (!confirm('Réinitialiser votre inscription ? Vous devrez recréer votre compte citoyen.')) return;
    localStorage.removeItem(COMPTE_KEY);
    window.location.reload();
  });

  // ===================================================================
  // Socket.IO — mise à jour temps réel du statut de mes alertes
  // ===================================================================

  function setupSocket() {
    if (!window.io) return;
    const socket = window.io();
    socket.on('alerte_mise_a_jour', (alerte) => {
      if (getMyAlertIds().includes(alerte.id)) {
        loadRecentAlertes();
      }
    });
  }

  // ===================================================================
  // Initialisation
  // ===================================================================

  function initApp() {
    detectPosition();
    loadRecentAlertes();
    setupSocket();
  }

  const compteExistant = getCompte();
  if (!compteExistant) {
    registrationGate.classList.remove('hidden');
    detectPosition();
  } else {
    initApp();
  }
})();
