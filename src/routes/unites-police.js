const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db/database');

const router = express.Router();

function serialiser(unite) {
  return {
    ...unite,
    zone_geojson: unite.zone_geojson ? JSON.parse(unite.zone_geojson) : null,
    coordonnees_provisoires: Boolean(unite.coordonnees_provisoires),
  };
}

router.get('/', (req, res) => {
  const unites = db.prepare('SELECT * FROM unites_police ORDER BY type, nom').all();
  res.json(unites.map(serialiser));
});

router.get('/:id', (req, res) => {
  const unite = db.prepare('SELECT * FROM unites_police WHERE id = ?').get(req.params.id);
  if (!unite) {
    return res.status(404).json({ erreur: 'Unité introuvable' });
  }
  res.json(serialiser(unite));
});

router.post('/', (req, res) => {
  const { nom, type, latitude, longitude } = req.body;

  if (!nom || !['commissariat', 'piste_avancee', 'supervision'].includes(type)) {
    return res.status(400).json({ erreur: 'Les champs "nom" et "type" (commissariat|piste_avancee|supervision) sont requis' });
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO unites_police (id, nom, type, latitude, longitude, coordonnees_provisoires)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, nom, type, latitude ?? null, longitude ?? null);

  const unite = db.prepare('SELECT * FROM unites_police WHERE id = ?').get(id);
  res.status(201).json(serialiser(unite));
});

router.put('/:id', (req, res) => {
  const existante = db.prepare('SELECT * FROM unites_police WHERE id = ?').get(req.params.id);
  if (!existante) {
    return res.status(404).json({ erreur: 'Unité introuvable' });
  }

  const { nom, latitude, longitude, zone_geojson, coordonnees_provisoires } = req.body;

  db.prepare(`
    UPDATE unites_police
    SET nom = ?, latitude = ?, longitude = ?, zone_geojson = ?, coordonnees_provisoires = ?
    WHERE id = ?
  `).run(
    nom ?? existante.nom,
    latitude ?? existante.latitude,
    longitude ?? existante.longitude,
    zone_geojson !== undefined ? JSON.stringify(zone_geojson) : existante.zone_geojson,
    coordonnees_provisoires !== undefined ? (coordonnees_provisoires ? 1 : 0) : existante.coordonnees_provisoires,
    req.params.id
  );

  const unite = db.prepare('SELECT * FROM unites_police WHERE id = ?').get(req.params.id);
  res.json(serialiser(unite));
});

router.delete('/:id', (req, res) => {
  const existante = db.prepare('SELECT id FROM unites_police WHERE id = ?').get(req.params.id);
  if (!existante) {
    return res.status(404).json({ erreur: 'Unité introuvable' });
  }

  try {
    db.prepare('DELETE FROM unites_police WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch {
    res.status(409).json({ erreur: 'Cette unité est référencée par des alertes existantes et ne peut pas être supprimée' });
  }
});

module.exports = router;
