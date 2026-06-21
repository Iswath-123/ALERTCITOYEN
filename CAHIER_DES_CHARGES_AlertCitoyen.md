# Cahier des charges — AlertCitoyen

**Plateforme d'alerte d'urgence géolocalisée — République Gabonaise**
Produit MINOR AFRICA · Document de référence pour le développement

---

## 1. Vision

AlertCitoyen est une plateforme d'alerte d'urgence qui connecte la population gabonaise aux forces de l'ordre et services de secours. Un citoyen signale un incident géolocalisé ; le système route automatiquement l'alerte vers l'unité responsable, qui peut contacter directement l'alerteur pour confirmer avant d'intervenir.

Cible institutionnelle : Ministère de l'Intérieur, Forces de Police Nationale, services de secours. Pilote sur le Grand Libreville, puis extension nationale et sous-régionale (CEMAC).

---

## 2. Contexte des forces de sécurité

Au Gabon, deux grandes forces nationales :

- **Forces de Police Nationale (FPN)** — rattachées au Ministère de l'Intérieur. **C'est l'interlocuteur du pilote AlertCitoyen** (zone urbaine du Grand Libreville).
- **Gendarmerie Nationale (GENA)** — rattachée au Ministère de la Défense, compétente sur les provinces et zones rurales. **Phase ultérieure** : l'architecture doit pouvoir l'accueillir, mais elle n'est pas développée maintenant.

---

## 3. Acteurs et rôles

Table `comptes` unifiée, champ `role` :

| Rôle | Description | Périmètre de données |
|------|-------------|----------------------|
| `super_admin` | Ministère de l'Intérieur | Tout, à l'échelle nationale |
| `dispatch` | Centre de dispatch national | Toutes les alertes ; route et corrige |
| `entite` | Force de réponse (voir champ `type_entite`) | Selon les règles ci-dessous |
| `citoyen` | Population | Ses propres alertes uniquement |

Champ `type_entite` pour les comptes `entite` : `police`, `pompiers`, `samu`, `mairie`.

### Règles d'accès des entités

- **Pompiers, SAMU, Mairie** : voient et traitent uniquement les alertes qui leur sont affectées.
- **Police** : accès élargi — traite ses propres alertes (agression, vol, trouble) **et** dispose d'un accès « lecture + intervention » sur les alertes pompiers et SAMU (consultation et intervention possible si besoin ; l'entité d'origine reste responsable de la clôture).

---

## 4. Unités de police — Grand Libreville

### Unités territoriales (reçoivent les alertes par périmètre)

Commissariats :
1. Commissariat central
2. Commissariat de Belle Vue 2
3. Commissariat de Sogatol
4. Commissariat d'Owendo
5. Commissariat d'Akanda
6. Commissariat de Nzeng-Ayong
7. Commissariat de l'aéroport

Pistes avancées :
8. Bikélé
9. Essassa
10. Malibé
11. PK7

### Unités de supervision / spécialisées (pas d'affectation automatique par zone)

- **Direction de la Sûreté Urbaine** — supervision : voit toutes les alertes police de Libreville (rôle de dispatch police central). *Hypothèse de travail à confirmer.*
- **État-major de Police d'Investigation Judiciaire (PIJ)** — escalade : reçoit les dossiers graves nécessitant enquête. *Hypothèse de travail à confirmer.*

> **À fournir par MINOR AFRICA** : coordonnées GPS réelles de chaque unité territoriale + tracé de sa zone de couverture. Ne jamais utiliser de coordonnées inventées. Saisie via la carte du dashboard admin.

---

## 5. Routage automatique des alertes

### Étape 1 — Routage par type

À la création d'une alerte, affectation automatique (champ `entite_affectee`) :

| Type d'alerte | Entité(s) |
|---------------|-----------|
| agression, vol, trouble, incendie, accident | police |
| incendie | pompiers + police + samu |
| accident | pompiers + samu |
| secours médical, malaise | samu |
| inondation | mairie + pompiers |
| autre | dispatch (routage manuel) |

Le centre de dispatch peut toujours corriger l'affectation manuellement.

### Étape 2 — Routage par périmètre (alertes police)

Système **hybride** :
1. **Zones de quartiers (primaire)** : chaque unité territoriale a un périmètre polygonal tracé. Si la position de l'alerte tombe dans un polygone → l'unité correspondante est désignée (test point-dans-polygone, ex. via turf.js).
2. **Unité la plus proche (secours)** : si l'alerte tombe hors de toute zone définie → l'unité territoriale la plus proche par distance GPS (formule de haversine).

L'unité désignée intervient en premier ; la Direction de la Sûreté Urbaine voit toutes les alertes police en supervision.

---

## 6. Géolocalisation haute précision

- `navigator.geolocation.getCurrentPosition` avec `{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }` pour forcer le GPS.
- Capturer et stocker : latitude, longitude, `accuracy` (précision en mètres), altitude, horodatage.
- Afficher la précision à l'opérateur (ex. « Position précise à 12 m »).
- Bouton SOS : activer `watchPosition` pour suivre un alerteur en mouvement, avec mise à jour temps réel sur la carte.

---

## 7. Inscription citoyenne

Écran d'inscription obligatoire à la première ouverture. Champs :
- Nom, prénom
- Numéro de téléphone
- Numéro WhatsApp (case « identique au téléphone » pour pré-remplir)
- Quartier de résidence
- Photo (optionnelle)

Pas de vérification OTP pour l'instant : valider directement le compte. Prévoir une fonction stub `verifierOTP()` et un commentaire pour brancher l'OTP par SMS plus tard sans refonte. Session conservée en `localStorage`.

---

## 8. Fiche alerteur (point critique)

Sur chaque alerte ouverte (dashboards dispatch et entités), afficher une fiche permettant de contacter directement l'alerteur pour confirmer :
- Nom, prénom, quartier
- Bouton **Appeler** : lien `tel:+241XXXXXXXX`
- Bouton **WhatsApp** : lien `https://wa.me/241XXXXXXXX`
- Photo de profil si disponible
- Historique : nombre d'alertes émises + indicateur de fiabilité (pour repérer les faux signalements)

---

## 9. Les 4 pages communes à chaque dashboard d'entité

Chaque entité dispose des mêmes 4 pages, mais ne voit que les données de son périmètre (la police voit en plus les données pompiers/SAMU ; le super admin voit tout au national).

1. **Alertes en direct** — carte Leaflet (Libreville) + liste temps réel. Pour la police, distinguer visuellement (couleur/filtre) ses alertes propres des alertes pompiers/SAMU supervisées. Fiche alerteur + actions : prendre en charge, en intervention, clôturer.
2. **Journal des alertes et connexions** — registre consultable et filtrable (date, type, quartier). Chaque ligne : alerte avec nom et contact de l'alerteur, horodatage, statut, entité affectée, agent ayant traité. Inclut le journal des connexions (qui, quand, quelle entité).
3. **Rapports d'activité automatiques** — génération PDF ou Word par période (jour/semaine/mois) : nombre d'alertes par type, temps de réponse moyen, zones à risque, taux de résolution, cartes. En-tête du rapport comportant les logos officiels : Armoiries / logo gouvernemental, Ministère de l'Intérieur, Ministère de la Défense Nationale, et le logo de l'entité de police chargée de la génération du rapport. Lib type pdfkit ou jsPDF (PDF) et docx (Word).
4. **Statistiques des alertes** — graphiques (volume par type, par quartier, pics horaires, évolution temporelle) + carte de chaleur des zones à risque. Chart.js + plugin heatmap de Leaflet.

---

## 10. Pages et fichiers

| Fichier | Rôle |
|---------|------|
| `public/index.html` | App citoyenne : SOS, signalement vocal, catégories, GPS précis, inscription |
| `public/login.html` | Connexion comptes professionnels (dispatch, entité, admin) |
| `public/dispatch.html` | Dashboard dispatch national : toutes alertes, routage, les 4 pages au national |
| `public/entite.html` | Dashboard entité : les 4 pages, périmètre selon `type_entite` et règles police |
| `public/admin.html` | Dashboard super admin : gestion des comptes, carte de placement des unités + tracé des zones, supervision nationale, les 4 pages |

---

## 11. Identité visuelle

- Fond principal blanc gris clair : `#F4F6F9`
- Surfaces / cartes : blanc `#FFFFFF` avec bordure subtile
- Bordures subtiles : `rgba(11,31,58,0.12)`
- Bande tricolore gabonaise sous le header : vert `#009639`, jaune `#FCD116`, bleu `#3A75C4`
- Rouge `#C8102E` réservé **uniquement** au bouton SOS d'urgence
- Vert `#1D9E75` pour le bouton de signalement vocal
- Texte : bleu marine `#0B1F3A` (principal), gris `#5A6E88` (secondaire), gris clair `#8FA3BF` (tertiaire)
- Header : barre bleu marine régalien `#0B1F3A` (préserve l'identité officielle) avec logo bouclier dans un carré rouge + « AlertCitoyen » et sous-titre « République Gabonaise »
- Gros caractères, fort contraste, lisibilité en situation de stress

---

## 12. Stack technique

- Backend : Node.js + Express
- Base de données : SQLite (local) → PostgreSQL + PostGIS (production)
- Temps réel : Socket.IO
- Cartographie : Leaflet.js + OpenStreetMap
- Calcul géographique : turf.js (point-dans-polygone), haversine (distance)
- Graphiques : Chart.js
- Rapports : PDF (pdfkit ou jsPDF) et Word (docx), avec en-tête à logos officiels
- Frontend : PWA, vanilla JS
- Librairies via CDN

---

## 13. Signalement vocal

- Enregistrement via `MediaRecorder`.
- Transcription via `webkitSpeechRecognition` en français (`fr-FR`) — fonctionne sur Chrome / navigateurs Chromium. Afficher la transcription en temps réel, puis permettre l'envoi.
- Prévoir un repli pour la production (solution de transcription plus universelle).

---

## 14. Plan de construction par étapes

Construire et valider étape par étape. Sauvegarder `alertcitoyen.db` avant toute migration.

1. **Fondations** — base de données, table `comptes` unifiée, rôles et permissions.
2. **Routage par type** — affectation automatique selon le type d'alerte.
3. **Routage par périmètre** — zones polygonales + unité la plus proche en secours ; carte admin de placement des unités.
4. **Inscription citoyenne** + app citoyenne (SOS, vocal, GPS précis).
5. **Fiche alerteur** (appel + WhatsApp) + dashboards entités.
6. **Les 4 pages** (alertes direct, journal, rapports, stats).
7. **Temps réel** (Socket.IO) + tests de bout en bout.

Vérifier que `npm run dev` démarre sans erreur après chaque étape.
