const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

require('./db/database');
const alertesRouter = require('./routes/alertes');
const comptesRouter = require('./routes/comptes');
const authRouter = require('./routes/auth');
const { router: connexionsRouter } = require('./routes/connexions');
const rapportsRouter = require('./routes/rapports');
const unitesPoliceRouter = require('./routes/unites-police');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('io', io);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/alertes', alertesRouter);
app.use('/api/comptes', comptesRouter);
app.use('/api/auth', authRouter);
app.use('/api/connexions', connexionsRouter);
app.use('/api/rapports', rapportsRouter);
app.use('/api/unites-police', unitesPoliceRouter);

io.on('connection', (socket) => {
  console.log('Client connecté:', socket.id);

  // Les comptes professionnels rejoignent une room dédiée pour ne recevoir
  // que les alertes qui les concernent (dispatch/admin reçoivent tout).
  socket.on('auth:join', ({ role, type_entite, user_id }) => {
    if (role === 'dispatch' || role === 'super_admin') {
      socket.join(`role:${role}`);
    } else if (role === 'entite' && type_entite) {
      socket.join(`entite:${type_entite}`);
      // La police a un accès élargi (lecture + intervention) sur les alertes
      // pompiers/SAMU : elle rejoint aussi leurs rooms temps réel.
      if (type_entite === 'police') {
        socket.join('entite:pompiers');
        socket.join('entite:samu');
      }
    } else if (role === 'citoyen' && user_id) {
      // Permet au citoyen de recevoir la mise à jour temps réel de ses
      // propres alertes (changement de statut), sans accès aux autres.
      socket.join(`citoyen:${user_id}`);
    }
  });

  socket.on('disconnect', () => console.log('Client déconnecté:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`AlertCitoyen démarré sur http://localhost:${PORT}`);
});

module.exports = { app, io };
