// Module partagé : modale "fiche alerteur" utilisée par dispatch.html et entite.html.
window.FicheAlerteur = (() => {
  let overlayEl = null;

  function close() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function digitsOnly(value) {
    return (value || '').replace(/[^\d]/g, '');
  }

  function formatAccuracy(accuracy) {
    if (accuracy == null) return null;
    const precise = accuracy <= 30;
    return `<span class="accuracy-badge ${precise ? '' : 'imprecise'}"><i class="fa-solid fa-crosshairs"></i> Position précise à ${Math.round(accuracy)} m</span>`;
  }

  async function open(alerte) {
    close();

    overlayEl = document.createElement('div');
    overlayEl.className = 'modal-overlay';
    overlayEl.innerHTML = `
      <div class="modal-card">
        <button class="modal-close-btn" aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
        <div id="fiche-alerteur-content">
          <p class="empty-state">Chargement de la fiche alerteur...</p>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });
    overlayEl.querySelector('.modal-close-btn').addEventListener('click', close);

    const content = overlayEl.querySelector('#fiche-alerteur-content');

    if (!alerte.user_id) {
      content.innerHTML = `
        ${renderAlerteDetail(alerte)}
        <p class="empty-state">Aucun compte citoyen associé à cette alerte (signalement anonyme).</p>
      `;
      return;
    }

    try {
      const res = await fetch(`/api/comptes/${alerte.user_id}`);
      if (!res.ok) throw new Error('introuvable');
      const compte = await res.json();
      content.innerHTML = renderFiche(compte, alerte);
    } catch {
      content.innerHTML = `
        ${renderAlerteDetail(alerte)}
        <p class="empty-state">Impossible de charger la fiche de l'alerteur.</p>
      `;
    }
  }

  function renderAlerteDetail(alerte) {
    const positionLine = alerte.latitude != null
      ? `<div><i class="fa-solid fa-location-dot"></i> ${alerte.latitude.toFixed(5)}, ${alerte.longitude.toFixed(5)} ${formatAccuracy(alerte.accuracy) || ''}</div>`
      : '<div><i class="fa-solid fa-location-dot"></i> Position non transmise</div>';

    return `
      <div class="alerte-detail-section">
        ${positionLine}
        ${alerte.adresse ? `<div><i class="fa-solid fa-map"></i> ${alerte.adresse}</div>` : ''}
        ${alerte.description ? `<div><i class="fa-solid fa-comment"></i> ${alerte.description}</div>` : ''}
      </div>
    `;
  }

  function renderFiche(compte, alerte) {
    const telDigits = digitsOnly(compte.telephone);
    const whatsappDigits = digitsOnly(compte.whatsapp || compte.telephone);
    const initiales = `${(compte.prenom || '')[0] || ''}${(compte.nom || '')[0] || ''}`.toUpperCase();
    const historique = compte.historique || { totalAlertes: '—', alertesResolues: '—', fiabilite: 'Inconnue' };

    return `
      <div class="alerteur-card">
        <div class="alerteur-avatar">
          ${compte.photo ? `<img src="${compte.photo}" alt="Photo de ${compte.nom}" />` : initiales || '<i class="fa-solid fa-user"></i>'}
        </div>
        <h3>${compte.prenom || ''} ${compte.nom || ''}</h3>
        <div class="alerteur-quartier"><i class="fa-solid fa-location-dot"></i> ${compte.quartier || 'Quartier non renseigné'}</div>
      </div>

      <div class="alerteur-contact-actions">
        ${telDigits ? `<a class="alerteur-call-btn" href="tel:+${telDigits}"><i class="fa-solid fa-phone"></i> Appeler</a>` : ''}
        ${whatsappDigits ? `<a class="alerteur-whatsapp-btn" href="https://wa.me/${whatsappDigits}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ''}
      </div>

      <div class="alerteur-stats">
        <div class="stat-card">
          <span class="stat-value">${historique.totalAlertes}</span>
          <span class="stat-label">Alertes émises</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${historique.alertesResolues}</span>
          <span class="stat-label">Résolues</span>
        </div>
      </div>

      <div class="alerteur-fiabilite"><i class="fa-solid fa-gauge-high"></i> ${historique.fiabilite}</div>

      ${renderAlerteDetail(alerte)}
    `;
  }

  return { open, close };
})();
