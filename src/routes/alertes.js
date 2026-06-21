const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { trouverUniteAssignee } = require('../utils/geo');

const router = express.Router();

const TYPES_PRIORITE_HAUTE = ['agression', 'incendie', 'accident', 'sos'];

// Cahier des charges section 5, étape 1 — routage par type :
// agression/vol/trouble/incendie/accident impliquent la police ; incendie et
// accident impliquent en plus pompiers + samu ; secours médical/malaise → samu ;
// inondation → mairie + pompiers ; autre → dispatch (routage manuel).
const ROUTAGE_PAR_TYPE = {
  agression: ['police'],
  vol: ['police'],
  trouble: ['police'],
  incendie: ['police', 'pompiers', 'samu'],
  accident: ['police', 'pompiers', 'samu'],
  secours_medical: ['samu'],
  malaise: ['samu'],
  inondation: ['mairie', 'pompiers'],
  sos: ['police', 'samu'],
};

function calculerPriorite(type) {
  if (TYPES_PRIORITE_HAUTE.includes(String(type).toLowerCase())) {
    return 'haute';
  }
  return 'moyenne';
}

function calculerEntiteAffectee(type) {
  const entites = ROUTAGE_PAR_TYPE[String(type).toLowerCase()];
  return entites ? entites.join(',') : 'dispatch';
}

// Cahier des charges section 5, étape 2 — routage par périmètre (police) :
// zone polygonale en priorité (point-dans-polygone), sinon l'unité
// territoriale la plus proche par distance GPS (haversine, en secours).
function calculerUnitePolice(entiteAffectee, latitude, longitude) {
  if (!(entiteAffectee || '').split(',').includes('police')) return null;
  const unites = db.prepare('SELECT * FROM unites_police').all();
  return trouverUniteAssignee(latitude, longitude, unites);
}

function emettreAuxRooms(io, evenement, alerte) {
  if (!io) return;
  // Un seul emit chaîné sur l'union des rooms ciblées : un socket abonné à
  // plusieurs d'entre elles (ex. la police, qui supervise aussi pompiers/samu)
  // ne reçoit l'événement qu'une seule fois, au lieu d'une fois par room.
  let cible = io.to('role:dispatch').to('role:super_admin');
  if (alerte.user_id) {
    // Le citoyen à l'origine de l'alerte reçoit aussi la mise à jour de
    // statut en temps réel sur sa propre room.
    cible = cible.to(`citoyen:${alerte.user_id}`);
  }
  (alerte.entite_affectee || '').split(',').filter(Boolean).forEach((entite) => {
    if (entite !== 'dispatch') {
      cible = cible.to(`entite:${entite}`);
    }
  });
  cible.emit(evenement, alerte);
}

router.get('/', (req, res) => {
  const { statut, priorite, entite, dispatcher_id } = req.query;
  let sql = 'SELECT * FROM alertes';
  const conditions = [];
  const params = [];

  if (statut) {
    conditions.push('statut = ?');
    params.push(statut);
  }
  if (priorite) {
    conditions.push('priorite = ?');
    params.push(priorite);
  }
  if (entite) {
    // "entite" accepte une liste séparée par virgules (ex: police,pompiers,samu)
    // pour permettre à la police de superviser en lecture+intervention les
    // alertes pompiers/SAMU, sans changer leur entite_affectee d'origine.
    const entites = entite.split(',').filter(Boolean);
    conditions.push(`(${entites.map(() => 'entite_affectee LIKE ?').join(' OR ')})`);
    entites.forEach((e) => params.push(`%${e}%`));
  }
  if (dispatcher_id) {
    conditions.push('dispatcher_id = ?');
    params.push(dispatcher_id);
  }
  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at DESC';

  const alertes = db.prepare(sql).all(...params);
  res.json(alertes);
});

// Journal consultable/filtrable : alertes enrichies des coordonnées de
// l'alerteur et de l'agent ayant traité, pour les dashboards dispatch/entité/admin.
router.get('/journal', (req, res) => {
  const { entite, type, quartier, date_debut, date_fin } = req.query;

  let sql = `
    SELECT
      a.*,
      c.nom AS citoyen_nom, c.prenom AS citoyen_prenom, c.telephone AS citoyen_telephone, c.quartier AS citoyen_quartier,
      d.nom AS agent_nom, d.role AS agent_role, d.type_entite AS agent_type_entite
    FROM alertes a
    LEFT JOIN comptes c ON a.user_id = c.id
    LEFT JOIN comptes d ON a.dispatcher_id = d.id
  `;
  const conditions = [];
  const params = [];

  if (entite) {
    const entites = entite.split(',').filter(Boolean);
    conditions.push(`(${entites.map(() => 'a.entite_affectee LIKE ?').join(' OR ')})`);
    entites.forEach((e) => params.push(`%${e}%`));
  }
  if (type) {
    conditions.push('a.type = ?');
    params.push(type);
  }
  if (quartier) {
    conditions.push('(c.quartier LIKE ? OR a.adresse LIKE ?)');
    params.push(`%${quartier}%`, `%${quartier}%`);
  }
  if (date_debut) {
    conditions.push('date(a.created_at) >= date(?)');
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push('date(a.created_at) <= date(?)');
    params.push(date_fin);
  }
  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY a.created_at DESC LIMIT 500';

  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const alerte = db.prepare('SELECT * FROM alertes WHERE id = ?').get(req.params.id);
  if (!alerte) {
    return res.status(404).json({ erreur: 'Alerte introuvable' });
  }
  res.json(alerte);
});

router.post('/', (req, res) => {
  const { type, description, latitude, longitude, altitude, accuracy, position_timestamp, adresse, user_id } = req.body;

  if (!type) {
    return res.status(400).json({ erreur: 'Le champ "type" est requis' });
  }

  const id = randomUUID();
  const priorite = calculerPriorite(type);
  const entiteAffectee = calculerEntiteAffectee(type);
  const unitePoliceId = calculerUnitePolice(entiteAffectee, latitude, longitude);

  db.prepare(`
    INSERT INTO alertes (
      id, type, description, latitude, longitude, altitude, accuracy, position_timestamp,
      adresse, priorite, entite_affectee, unite_police_id, user_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, type, description || null,
    latitude ?? null, longitude ?? null, altitude ?? null, accuracy ?? null, position_timestamp ?? null,
    adresse || null, priorite, entiteAffectee, unitePoliceId, user_id || null
  );

  const alerte = db.prepare('SELECT * FROM alertes WHERE id = ?').get(id);

  emettreAuxRooms(req.app.get('io'), 'nouvelle_alerte', alerte);

  res.status(201).json(alerte);
});

router.put('/:id', (req, res) => {
  const existante = db.prepare('SELECT * FROM alertes WHERE id = ?').get(req.params.id);
  if (!existante) {
    return res.status(404).json({ erreur: 'Alerte introuvable' });
  }

  const {
    type, description, latitude, longitude, altitude, accuracy, position_timestamp,
    adresse, statut, dispatcher_id, entite_affectee, unite_police_id,
  } = req.body;

  const nouveauType = type ?? existante.type;
  const priorite = type ? calculerPriorite(type) : existante.priorite;
  const nouvelleEntiteAffectee = entite_affectee ?? existante.entite_affectee;

  db.prepare(`
    UPDATE alertes
    SET type = ?, description = ?, latitude = ?, longitude = ?, altitude = ?, accuracy = ?, position_timestamp = ?,
        adresse = ?, priorite = ?, statut = ?, dispatcher_id = ?, entite_affectee = ?, unite_police_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    nouveauType,
    description ?? existante.description,
    latitude ?? existante.latitude,
    longitude ?? existante.longitude,
    altitude ?? existante.altitude,
    accuracy ?? existante.accuracy,
    position_timestamp ?? existante.position_timestamp,
    adresse ?? existante.adresse,
    priorite,
    statut ?? existante.statut,
    dispatcher_id ?? existante.dispatcher_id,
    nouvelleEntiteAffectee,
    // Correction manuelle possible (dispatch/police) ; sinon on conserve
    // l'affectation existante sans la recalculer à chaque mise à jour.
    unite_police_id ?? existante.unite_police_id,
    req.params.id
  );

  const alerte = db.prepare('SELECT * FROM alertes WHERE id = ?').get(req.params.id);

  emettreAuxRooms(req.app.get('io'), 'alerte_mise_a_jour', alerte);

  res.json(alerte);
});

router.delete('/:id', (req, res) => {
  const existante = db.prepare('SELECT * FROM alertes WHERE id = ?').get(req.params.id);
  if (!existante) {
    return res.status(404).json({ erreur: 'Alerte introuvable' });
  }

  db.prepare('DELETE FROM alertes WHERE id = ?').run(req.params.id);

  emettreAuxRooms(req.app.get('io'), 'alerte_supprimee', { id: req.params.id, entite_affectee: existante.entite_affectee });

  res.status(204).send();
});

module.exports = router;
