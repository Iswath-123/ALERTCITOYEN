const express = require('express');
const db = require('../db/database');
const { verifierMotDePasse } = require('../utils/password');
const { enregistrerConnexion } = require('./connexions');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, mot_de_passe } = req.body;

  if (!email || !mot_de_passe) {
    return res.status(400).json({ erreur: 'Les champs "email" et "mot_de_passe" sont requis' });
  }

  const compte = db.prepare("SELECT * FROM comptes WHERE email = ? AND role != 'citoyen'").get(email);
  if (!compte || !verifierMotDePasse(mot_de_passe, compte.mot_de_passe_hash, compte.mot_de_passe_sel)) {
    return res.status(401).json({ erreur: 'Identifiants invalides' });
  }

  enregistrerConnexion(compte);

  const { mot_de_passe_hash, mot_de_passe_sel, ...compteSansMotDePasse } = compte;
  res.json(compteSansMotDePasse);
});

module.exports = router;
