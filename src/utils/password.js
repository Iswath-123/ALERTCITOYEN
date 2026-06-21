const { randomBytes, pbkdf2Sync } = require('crypto');

function hasherMotDePasse(motDePasse) {
  const sel = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(motDePasse, sel, 100000, 64, 'sha512').toString('hex');
  return { hash, sel };
}

function verifierMotDePasse(motDePasse, hash, sel) {
  const candidat = pbkdf2Sync(motDePasse, sel, 100000, 64, 'sha512').toString('hex');
  return candidat === hash;
}

module.exports = { hasherMotDePasse, verifierMotDePasse };
