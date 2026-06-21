const { point, polygon } = require('@turf/helpers');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;

// Distance en kilomètres entre deux points GPS (formule de haversine).
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// zoneGeojson : objet GeoJSON Polygon { type: 'Polygon', coordinates: [[[lon, lat], ...]] }
function pointDansZone(latitude, longitude, zoneGeojson) {
  if (!zoneGeojson || !zoneGeojson.coordinates) return false;
  try {
    const pt = point([longitude, latitude]);
    const poly = polygon(zoneGeojson.coordinates);
    return booleanPointInPolygon(pt, poly);
  } catch {
    return false;
  }
}

// Trouve l'unité dont la zone polygonale contient le point ; sinon l'unité
// territoriale la plus proche par distance (secours). Les unités de
// supervision ne participent pas à l'affectation automatique par périmètre.
function trouverUniteAssignee(latitude, longitude, unites) {
  if (latitude == null || longitude == null) return null;

  const unitesTerritoriales = unites.filter((u) => u.type !== 'supervision');

  for (const unite of unitesTerritoriales) {
    if (unite.zone_geojson) {
      let zone;
      try {
        zone = JSON.parse(unite.zone_geojson);
      } catch {
        zone = null;
      }
      if (zone && pointDansZone(latitude, longitude, zone)) {
        return unite.id;
      }
    }
  }

  let plusProche = null;
  let distanceMin = Infinity;
  for (const unite of unitesTerritoriales) {
    if (unite.latitude == null || unite.longitude == null) continue;
    const distance = haversineKm(latitude, longitude, unite.latitude, unite.longitude);
    if (distance < distanceMin) {
      distanceMin = distance;
      plusProche = unite.id;
    }
  }
  return plusProche;
}

module.exports = { haversineKm, pointDansZone, trouverUniteAssignee };
