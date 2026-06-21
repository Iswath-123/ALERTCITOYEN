const path = require('path');
const fs = require('fs');
const db = require('../db/database');

const TYPE_LABEL = {
  sos: 'SOS Urgence',
  agression: 'Agression',
  vol: 'Vol',
  trouble: 'Trouble',
  accident: 'Accident',
  incendie: 'Incendie',
  inondation: 'Inondation',
  secours_medical: 'Secours médical',
  malaise: 'Malaise',
  autre: 'Autre',
};

const PERIODE_LABEL = { jour: "Aujourd'hui", semaine: '7 derniers jours', mois: '30 derniers jours' };
const ENTITE_NOM = { police: 'Police Nationale', pompiers: 'Sapeurs-Pompiers', samu: 'SAMU', mairie: 'Mairie de Libreville' };

const LOGOS_DIR = path.join(__dirname, '../../public/images/logos');

// Logos officiels attendus en en-tête (cahier des charges section 9.3).
// Certains ne sont pas encore fournis : ils sont simplement omis de l'en-tête
// tant que les fichiers correspondants n'existent pas dans public/images/logos/.
function logosEnTete(entite) {
  const candidats = [
    { fichier: 'logo-armoiries.png', label: 'Armoiries de la République Gabonaise' },
    { fichier: 'logo-armoiries.jpg', label: 'Armoiries de la République Gabonaise' },
    { fichier: 'logo-ministere-interieur.jpg', label: "Ministère de l'Intérieur" },
    { fichier: 'logo-ministere-interieur.png', label: "Ministère de l'Intérieur" },
    { fichier: 'logo-ministere-defense.png', label: 'Ministère de la Défense Nationale' },
    { fichier: 'logo-ministere-defense.jpg', label: 'Ministère de la Défense Nationale' },
  ];

  if ((entite || '').split(',').includes('police')) {
    candidats.push(
      { fichier: 'logo-forces-police-nationale.jpg', label: 'Forces de Police Nationale' },
      { fichier: 'logo-forces-police-nationale.png', label: 'Forces de Police Nationale' }
    );
  }

  return candidats
    .map((c) => ({ ...c, chemin: path.join(LOGOS_DIR, c.fichier) }))
    .filter((c) => fs.existsSync(c.chemin));
}

function calculerDateDebut(periode) {
  const maintenant = new Date();
  const jours = { jour: 1, semaine: 7, mois: 30 }[periode] || 1;
  const debut = new Date(maintenant.getTime() - jours * 24 * 60 * 60 * 1000);
  return debut.toISOString().slice(0, 10);
}

function recupererDonnees({ periode, entite }) {
  const dateDebut = calculerDateDebut(periode);

  let sql = `
    SELECT a.*, c.quartier AS citoyen_quartier
    FROM alertes a
    LEFT JOIN comptes c ON a.user_id = c.id
    WHERE date(a.created_at) >= date(?)
  `;
  const params = [dateDebut];

  if (entite) {
    const entites = entite.split(',').filter(Boolean);
    sql += ` AND (${entites.map(() => 'a.entite_affectee LIKE ?').join(' OR ')})`;
    entites.forEach((e) => params.push(`%${e}%`));
  }

  const alertes = db.prepare(sql).all(...params);

  const parType = {};
  const parQuartier = {};
  let resolues = 0;
  let totalMinutesTraitement = 0;
  let nbTraitees = 0;

  alertes.forEach((a) => {
    parType[a.type] = (parType[a.type] || 0) + 1;

    const quartier = a.citoyen_quartier || a.adresse || 'Non renseigné';
    parQuartier[quartier] = (parQuartier[quartier] || 0) + 1;

    if (a.statut === 'resolue') resolues += 1;

    if (a.statut !== 'en_attente') {
      const created = new Date(a.created_at.replace(' ', 'T'));
      const updated = new Date(a.updated_at.replace(' ', 'T'));
      totalMinutesTraitement += Math.max(0, (updated - created) / 60000);
      nbTraitees += 1;
    }
  });

  const zonesARisque = Object.entries(parQuartier)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return {
    dateDebut,
    total: alertes.length,
    resolues,
    tauxResolution: alertes.length ? Math.round((resolues / alertes.length) * 100) : 0,
    tempsReponseMoyen: nbTraitees ? Math.round(totalMinutesTraitement / nbTraitees) : null,
    parType: Object.entries(parType).sort((a, b) => b[1] - a[1]),
    zonesARisque,
  };
}

function perimetreLabel(entite) {
  return entite
    ? entite.split(',').map((e) => ENTITE_NOM[e] || e).join(' + ')
    : 'National (toutes entités)';
}

module.exports = { TYPE_LABEL, PERIODE_LABEL, ENTITE_NOM, logosEnTete, recupererDonnees, perimetreLabel };
