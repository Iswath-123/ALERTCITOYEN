const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db/database');

const router = express.Router();

function enregistrerConnexion(compte) {
  db.prepare(`
    INSERT INTO connexions (id, compte_id, role, type_entite, nom)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), compte.id, compte.role, compte.type_entite, `${compte.prenom ? `${compte.prenom} ` : ''}${compte.nom}`);
}

router.get('/', (req, res) => {
  const { role, type_entite, date_debut, date_fin } = req.query;
  let sql = 'SELECT * FROM connexions';
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
  if (date_debut) {
    conditions.push('date(created_at) >= date(?)');
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push('date(created_at) <= date(?)');
    params.push(date_fin);
  }
  if (conditions.length) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at DESC LIMIT 500';

  res.json(db.prepare(sql).all(...params));
});

module.exports = { router, enregistrerConnexion };
