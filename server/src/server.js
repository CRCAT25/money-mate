import http from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db.js';
import { setIo } from './realtime.js';

await getDb().ready;
const server = http.createServer(createApp());
const io = new Server(server, { cors: { origin: config.clientUrl, credentials: true } });

io.use(async (socket, next) => {
  try {
    const payload = jwt.verify(socket.handshake.auth?.token, config.accessSecret);
    const member = await getDb().prepare('SELECT family_id FROM family_members WHERE user_id = ?').get(payload.sub);
    if (!member) return next(new Error('Unauthorized'));
    socket.familyId = member.family_id;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => socket.join(`family:${socket.familyId}`));
setIo(io);

server.listen(config.port, () => {
  console.info(`MoneyMate API listening on http://localhost:${config.port}`);
});
