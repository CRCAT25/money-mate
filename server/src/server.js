import http from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db.js';
import { setIo } from './realtime.js';
import { listUserSpaces } from './spaces.js';

await getDb().ready;
const server = http.createServer(createApp());
const io = new Server(server, { cors: { origin: config.clientUrl, credentials: true } });

io.use(async (socket, next) => {
  try {
    const payload = jwt.verify(socket.handshake.auth?.token, config.accessSecret);
    const spaces = await listUserSpaces(getDb(), payload.sub);
    if (!spaces.length) return next(new Error('Unauthorized'));
    socket.spaceIds = spaces.map((space) => space.id);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => socket.join(socket.spaceIds.map((spaceId) => `space:${spaceId}`)));
setIo(io);

server.listen(config.port, () => {
  console.info(`MoneyMate API listening on http://localhost:${config.port}`);
});
