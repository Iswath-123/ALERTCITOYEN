const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { hasherMotDePasse } = require('../utils/password');

const router = express.Router();

const CHAMPS_PUBLICS = `
  id, role, type_entite, nom, prenom, telephone, whatsapp, quartier, photo,
  email, disponible, created_at
`;

// TODO(OTP): brancher un vrai fournisseur SMS (ex: Twilio Verify, AWS SNS, Vonage)
// pour envoyer et vérifier un code à usage unique avant de valider l'inscription.
// Pour l'instant, cette fonction valide directement le numéro sans envoi réel de SMS.
function verifierOTP(telephone) {
  return true;
}

function calculerHistorique(compteId) {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM alertes WHERE user_id = ?').get(compteId);
  const { resolues } = db
    .prepare("SELECT COUNT(*) AS resolues FROM alertes WHERE user_id = ? AND statut = 'resolue'")
    .get(compteId);

  let fiabilite = 'Nouveau compte';
  if (total > 0) {
    const ratio = resolues / total;
    if (ratio >= 0.7) fiabilite = 'Fiabilité élevée';
    else if (ratio >= 0.3) fiabilite = 'Fiabilité moyenne';
    else fiabilite = 'Fiabilité à vérifier';
  }

  return { totalAlertes: total, alertesResolues: resolues, fiabilite };
}

router.post('/inscription-citoyen', (req, res) => {
  const { nom, prenom, telephone, whatsapp, quartier, photo } = req.body;

  if (!nom || !prenom || !telephone || !whatsapp || !quartier) {
    return res.status(400).json({
      erreur: 'Les champs "nom", "prenom", "telephone", "whatsapp" et "quartier" sont requis',
    });
  }

  if (!verifierOTP(telephone)) {
    return res.status(400).json({ erreur: 'Numéro de téléphone non vérifié' });
  }

  const id = randomUUID();

  db.prepare(`
    INSERT INTO comptes (id, role, nom, prenom, telephone, whatsapp, quartier, photo, otp_verifie)
    VALUES (?, 'citoyen', ?, ?, ?, ?, ?, ?, 1)
  `).run(id, nom, prenom, telephone, whatsapp, quartier, photo || null);

  const compte = db.prepare(`SELECT ${CHAMPS_PUBLICS} FROM comptes WHERE id = ?`).get(id);
  res.status(201).json(compte);
});

// Connexion citoyenne — pas de mot de passe (cf. inscription-citoyen) : la
// reconnaissance se fait uniquement par numéro de téléphone, pour les
// citoyens qui ont déjà un compte (autre appareil, stockage local effacé...).
router.post('/connexion-citoyen', (req, res) => {
  const { telephone } = req.body;

  if (!telephone) {
    return res.status(400).json({ erreur: 'Le numéro de téléphone est requis' });
  }

  const compte = db
    .prepare(`SELECT ${CHAMPS_PUBLICS} FROM comptes WHERE role = 'citoyen' AND telephone = ?`)
    .get(telephone);

  if (!compte) {
    return res.status(404).json({ erreur: 'Aucun compte citoyen trouvé avec ce numéro.' });
  }

  res.json(compte);
});

router.post('/', (req, res) => {
  const { nom, prenom, email, mot_de_passe, role, type_entite, telephone } = req.body;

  if (!nom || !email || !mot_de_passe || !role) {
    return res.status(400).json({ erreur: 'Les champs "nom", "email", "mot_de_passe" et "role" sont requis' });
  }

  if (!['super_admin', 'dispatch', 'entite'].includes(role)) {
    return res.status(400).json({ erreur: 'Rôle professionnel invalide' });
  }

  if (role === 'entite' && !['police', 'pompiers', 'samu', 'mairie'].includes(type_entite)) {
    return res.status(400).json({ erreur: 'Le champ "type_entite" est requis pour un compte entité' });
  }

  const existant = db.prepare('SELECT id FROM comptes WHERE email = ?').get(email);
  if (existant) {
    return res.status(409).json({ erreur: 'Un compte avec cet email existe déjà' });
  }

  const id = randomUUID();
  const { hash, sel } = hasherMotDePasse(mot_de_passe);

  db.prepare(`
    INSERT INTO comptes (id, role, type_entite, nom, prenom, telephone, email, mot_de_passe_hash, mot_de_passe_sel, otp_verifie)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, role, role === 'entite' ? type_entite : null, nom, prenom || null, telephone || null, email, hash, sel);

  const compte = db.prepare(`SELECT ${CHAMPS_PUBLICS} FROM comptes WHERE id = ?`).get(id);
  res.status(201).json(compte);
});

router.get('/', (req, res) => {
  const { role, type_entite } = req.query;
  let sql = `SELECT ${CHAMPS_PUBLICS} FROM comptes`;
  const conditions = [];
  const params = [];

  if (role) {
    conditions.push('role = ?');
    params.push(role);
  }
  if (type_entite) {
    conditions.push('type_entite = ?');
    params.push(type_entite);
  }
  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const compte = db.prepare(`SELECT ${CHAMPS_PUBLICS} FROM comptes WHERE id = ?`).get(req.params.id);
  if (!compte) {
    return res.status(404).json({ erreur: 'Compte introuvable' });
  }

  if (compte.role === 'citoyen') {
    compte.historique = calculerHistorique(compte.id);
  }

  res.json(compte);
});

router.put('/:id', (req, res) => {
  const existant = db.prepare('SELECT * FROM comptes WHERE id = ?').get(req.params.id);
  if (!existant) {
    return res.status(404).json({ erreur: 'Compte introuvable' });
  }

  const { nom, prenom, telephone, whatsapp, quartier, photo, role, type_entite, disponible, email, mot_de_passe } = req.body;

  let motDePasseHash = existant.mot_de_passe_hash;
  let motDePasseSel = existant.mot_de_passe_sel;
  if (mot_de_passe) {
    const { hash, sel } = hasherMotDePasse(mot_de_passe);
    motDePasseHash = hash;
    motDePasseSel = sel;
  }

  db.prepare(`
    UPDATE comptes
    SET nom = ?, prenom = ?, telephone = ?, whatsapp = ?, quartier = ?, photo = ?,
        role = ?, type_entite = ?, disponible = ?, email = ?, mot_de_passe_hash = ?, mot_de_passe_sel = ?
    WHERE id = ?
  `).run(
    nom ?? existant.nom,
    prenom ?? existant.prenom,
    telephone ?? existant.telephone,
    whatsapp ?? existant.whatsapp,
    quartier ?? existant.quartier,
    photo ?? existant.photo,
    role ?? existant.role,
    type_entite ?? existant.type_entite,
    disponible ?? existant.disponible,
    email ?? existant.email,
    motDePasseHash,
    motDePasseSel,
    req.params.id
  );

  const compte = db.prepare(`SELECT ${CHAMPS_PUBLICS} FROM comptes WHERE id = ?`).get(req.params.id);
  res.json(compte);
});

router.delete('/:id', (req, res) => {
  const existant = db.prepare('SELECT id FROM comptes WHERE id = ?').get(req.params.id);
  if (!existant) {
    return res.status(404).json({ erreur: 'Compte introuvable' });
  }

  try {
    db.prepare('DELETE FROM comptes WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch {
    res.status(409).json({ erreur: 'Ce compte est référencé par des alertes existantes et ne peut pas être supprimé' });
  }
});

module.exports = router;
