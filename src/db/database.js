const Database = require('better-sqlite3');
const path = require('path');
const { hasherMotDePasse } = require('../utils/password');

const db = new Database(path.join(__dirname, 'alertcitoyen.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS comptes (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'dispatch', 'entite', 'citoyen')),
    type_entite TEXT CHECK (type_entite IN ('police', 'pompiers', 'samu', 'mairie')),
    nom TEXT NOT NULL,
    prenom TEXT,
    telephone TEXT,
    whatsapp TEXT,
    quartier TEXT,
    photo TEXT,
    email TEXT UNIQUE,
    mot_de_passe_hash TEXT,
    mot_de_passe_sel TEXT,
    otp_verifie INTEGER NOT NULL DEFAULT 0,
    disponible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS unites_police (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('commissariat', 'piste_avancee', 'supervision')),
    latitude REAL,
    longitude REAL,
    zone_geojson TEXT,
    coordonnees_provisoires INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alertes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    description TEXT,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    accuracy REAL,
    position_timestamp TEXT,
    adresse TEXT,
    priorite TEXT NOT NULL DEFAULT 'moyenne',
    statut TEXT NOT NULL DEFAULT 'en_attente',
    entite_affectee TEXT,
    unite_police_id TEXT,
    dispatcher_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES comptes(id),
    FOREIGN KEY (dispatcher_id) REFERENCES comptes(id),
    FOREIGN KEY (unite_police_id) REFERENCES unites_police(id)
  );

  CREATE TABLE IF NOT EXISTS connexions (
    id TEXT PRIMARY KEY,
    compte_id TEXT,
    role TEXT NOT NULL,
    type_entite TEXT,
    nom TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (compte_id) REFERENCES comptes(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    alerte_id TEXT,
    message TEXT NOT NULL,
    lu INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES comptes(id),
    FOREIGN KEY (alerte_id) REFERENCES alertes(id)
  );
`);

// Migration légère : ajoute les colonnes apparues après la création initiale
// de la table sur une base existante (CREATE TABLE IF NOT EXISTS ne le fait pas).
const colonnesAlertes = db.prepare('PRAGMA table_info(alertes)').all().map((c) => c.name);
if (!colonnesAlertes.includes('unite_police_id')) {
  db.exec('ALTER TABLE alertes ADD COLUMN unite_police_id TEXT REFERENCES unites_police(id)');
}
if (!colonnesAlertes.includes('photo')) {
  db.exec('ALTER TABLE alertes ADD COLUMN photo TEXT');
}
if (!colonnesAlertes.includes('video')) {
  db.exec('ALTER TABLE alertes ADD COLUMN video TEXT');
}

const { count: comptesProCount } = db
  .prepare("SELECT COUNT(*) AS count FROM comptes WHERE role != 'citoyen'")
  .get();

if (comptesProCount === 0) {
  const insertCompte = db.prepare(`
    INSERT INTO comptes (id, role, type_entite, nom, prenom, email, mot_de_passe_hash, mot_de_passe_sel, otp_verifie, disponible)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
  `);

  const comptesParDefaut = [
    { id: 'admin-1', role: 'super_admin', type_entite: null, nom: 'Ministère', prenom: 'Intérieur', email: 'admin@interieur.ga', motDePasse: 'admin123' },
    { id: 'dispatch-1', role: 'dispatch', type_entite: null, nom: 'Centre', prenom: 'Dispatch National', email: 'dispatch@alertcitoyen.ga', motDePasse: 'dispatch123' },
    { id: 'entite-police', role: 'entite', type_entite: 'police', nom: 'Police Nationale', prenom: null, email: 'police@alertcitoyen.ga', motDePasse: 'police123' },
    { id: 'entite-pompiers', role: 'entite', type_entite: 'pompiers', nom: 'Sapeurs-Pompiers', prenom: null, email: 'pompiers@alertcitoyen.ga', motDePasse: 'pompiers123' },
    { id: 'entite-samu', role: 'entite', type_entite: 'samu', nom: 'SAMU', prenom: null, email: 'samu@alertcitoyen.ga', motDePasse: 'samu123' },
    { id: 'entite-mairie', role: 'entite', type_entite: 'mairie', nom: 'Mairie de Libreville', prenom: null, email: 'mairie@alertcitoyen.ga', motDePasse: 'mairie123' },
  ];

  for (const compte of comptesParDefaut) {
    const { hash, sel } = hasherMotDePasse(compte.motDePasse);
    insertCompte.run(compte.id, compte.role, compte.type_entite, compte.nom, compte.prenom, compte.email, hash, sel);
  }
}

const { count: unitesPoliceCount } = db.prepare('SELECT COUNT(*) AS count FROM unites_police').get();

if (unitesPoliceCount === 0) {
  // Coordonnées PROVISOIRES (à confirmer par le Ministère via la carte admin) :
  // simple répartition indicative autour de Libreville, ne reflète pas les
  // positions réelles des unités. coordonnees_provisoires = 1 tant que non corrigées.
  const insertUnite = db.prepare(`
    INSERT INTO unites_police (id, nom, type, latitude, longitude, coordonnees_provisoires)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const unitesParDefaut = [
    { id: 'commissariat-central', nom: 'Commissariat central', type: 'commissariat', latitude: 0.3924, longitude: 9.4536 },
    { id: 'commissariat-belle-vue-2', nom: 'Commissariat de Belle Vue 2', type: 'commissariat', latitude: 0.4050, longitude: 9.4450 },
    { id: 'commissariat-sogatol', nom: 'Commissariat de Sogatol', type: 'commissariat', latitude: 0.3800, longitude: 9.4400 },
    { id: 'commissariat-owendo', nom: "Commissariat d'Owendo", type: 'commissariat', latitude: 0.2900, longitude: 9.5000 },
    { id: 'commissariat-akanda', nom: "Commissariat d'Akanda", type: 'commissariat', latitude: 0.5200, longitude: 9.4200 },
    { id: 'commissariat-nzeng-ayong', nom: 'Commissariat de Nzeng-Ayong', type: 'commissariat', latitude: 0.4200, longitude: 9.4700 },
    { id: 'commissariat-aeroport', nom: "Commissariat de l'aéroport", type: 'commissariat', latitude: 0.4580, longitude: 9.4120 },
    { id: 'piste-bikele', nom: 'Bikélé', type: 'piste_avancee', latitude: 0.3500, longitude: 9.5200 },
    { id: 'piste-essassa', nom: 'Essassa', type: 'piste_avancee', latitude: 0.3300, longitude: 9.5400 },
    { id: 'piste-malibe', nom: 'Malibé', type: 'piste_avancee', latitude: 0.4500, longitude: 9.5500 },
    { id: 'piste-pk7', nom: 'PK7', type: 'piste_avancee', latitude: 0.3700, longitude: 9.5000 },
    { id: 'direction-surete-urbaine', nom: 'Direction de la Sûreté Urbaine', type: 'supervision', latitude: 0.3924, longitude: 9.4536 },
    { id: 'etat-major-pij', nom: "État-major de Police d'Investigation Judiciaire", type: 'supervision', latitude: 0.3950, longitude: 9.4550 },
  ];

  for (const unite of unitesParDefaut) {
    insertUnite.run(unite.id, unite.nom, unite.type, unite.latitude, unite.longitude);
  }
}

module.exports = db;
