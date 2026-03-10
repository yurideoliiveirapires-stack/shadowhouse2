/**
 * SHADOWHOUSE — A Vingança de Kauan
 * Multiplayer Server (Node.js + Socket.IO)
 */

const express = require('express');
const http    = require('http');
const path    = require('path');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  pingInterval: 2000,
  pingTimeout:  5000,
});

// ── Static files ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Map layout (mirrors client) for spawn validation ──────────────
const MAP = [
  '1111111111111111111111111111111111',
  '1000000001110001100001110000000001',
  '1000000001110001100001110000000001',
  '1000000000000000000000000000000001',
  '1000000000000000000000000000000001',
  '1000000001110D01100D01110000000001',
  '1000000001110001100001110000000001',
  '1000000001110001100001110000000001',
  '1111D1111111111D111111111111D11111',
  '1000000000000000000000000000000001',
  '1000000000000000000000000000000001',
  '1000000000000000A00000000000000001',
  '100000000000G000000000000000000001',
  '100000000000000000000000000000001',
  '1111111111D111111111111111D1111111',
  '1000001100000001100000011000000001',
  '1000001100000001100000011000000001',
  '1000001100000001100000011000000001',
  '1000D011000000D11000000110000D0001',
  '1000001100000001100000011000000001',
  '1000001100000001F00000011000000001',
  '1000001100000001100000011000000001',
  '1111111111111111111111111111111111',
];
const CELL = 4;

// Safe open-floor spawn candidates
const SPAWN_CELLS = [];
for (let r = 1; r < MAP.length - 1; r++) {
  for (let c = 1; c < MAP[0].length - 1; c++) {
    if (MAP[r][c] === '0') SPAWN_CELLS.push({ r, c });
  }
}

function randomSpawn() {
  // Pick a random open cell away from Kauan's start (row ~12, col ~18)
  const safe = SPAWN_CELLS.filter(p =>
    Math.hypot(p.r - 12, p.c - 18) > 6
  );
  const cell = safe[Math.floor(Math.random() * safe.length)];
  return {
    x: cell.c * CELL + CELL / 2,
    z: cell.r * CELL + CELL / 2,
  };
}

// ── Player store ──────────────────────────────────────────────────
// players[socketId] = { id, name, x, z, yaw, skinId, alive }
const players = {};

// Skin colour lookup so other clients can tint the mesh
const SKIN_COLORS = {
  detective:   0x4a6fa5,
  soldier:     0x3d6b35,
  hacker:      0x1a1a2e,
  survivor:    0x8b4513,
  ghost:       0xc8c8ff,
  medic:       0xffffff,
  kauan:       0x050003,
  reporter:    0xd2a679,
};

// Network-update throttle: max 20 pos updates/sec per player
const UPDATE_INTERVAL_MS = 50;
const lastSent = {};

// ── Socket.IO ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── JOIN ────────────────────────────────────────────────────────
  socket.on('player:join', ({ name, skinId }) => {
    const spawn = randomSpawn();
    const color = SKIN_COLORS[skinId] ?? 0x4a6fa5;

    players[socket.id] = {
      id:     socket.id,
      name:   (name || 'DETETIVE').substring(0, 16),
      skinId: skinId || 'detective',
      color,
      x:      spawn.x,
      z:      spawn.z,
      yaw:    0,
      alive:  true,
    };

    lastSent[socket.id] = 0;

    // Tell the joining player their own ID + all current players
    socket.emit('player:init', {
      selfId:  socket.id,
      players: Object.values(players),
    });

    // Tell everyone else about the new player
    socket.broadcast.emit('player:joined', players[socket.id]);

    console.log(`  JOIN: ${players[socket.id].name} (${socket.id}) at (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)})`);
  });

  // ── MOVE ────────────────────────────────────────────────────────
  socket.on('player:move', (data) => {
    const p = players[socket.id];
    if (!p) return;

    const now = Date.now();
    if (now - lastSent[socket.id] < UPDATE_INTERVAL_MS) return;
    lastSent[socket.id] = now;

    // Clamp values to reasonable world bounds
    p.x   = Math.max(0, Math.min(CELL * MAP[0].length, data.x ?? p.x));
    p.z   = Math.max(0, Math.min(CELL * MAP.length,    data.z ?? p.z));
    p.yaw = data.yaw ?? p.yaw;

    // Broadcast to everyone except sender
    socket.broadcast.emit('player:moved', {
      id:  socket.id,
      x:   p.x,
      z:   p.z,
      yaw: p.yaw,
    });
  });

  // ── CHAT ────────────────────────────────────────────────────────
  // ── VOICE CHAT SIGNALING ──────────────────────────────────
  socket.on('voice:ready', () => {
    // Notify existing players that this peer supports voice
    socket.to(socket.data?.room||'main').emit('voice:peer_ready', { from: socket.id });
  });
  socket.on('voice:offer',  ({to, sdp})      => { io.to(to).emit('voice:offer',  { from: socket.id, sdp }); });
  socket.on('voice:answer', ({to, sdp})      => { io.to(to).emit('voice:answer', { from: socket.id, sdp }); });
  socket.on('voice:ice',    ({to, candidate})=> { io.to(to).emit('voice:ice',    { from: socket.id, candidate }); });

  socket.on('chat:msg', (msg) => {
    const p = players[socket.id];
    if (!p) return;
    const safe = String(msg).substring(0, 120);
    io.emit('chat:msg', { from: p.name, msg: safe });
  });

  // ── CAPTURED ────────────────────────────────────────────────────
  socket.on('player:captured', () => {
    const p = players[socket.id];
    if (!p) return;
    p.alive = false;
    io.emit('player:captured', { id: socket.id, name: p.name });
  });

  // ── DISCONNECT ──────────────────────────────────────────────────
  socket.on('disconnect', () => {
    socket.broadcast.emit('voice:peer_left', { from: socket.id });
    const p = players[socket.id];
    if (p) {
      console.log(`[-] Left: ${p.name} (${socket.id})`);
      delete players[socket.id];
      delete lastSent[socket.id];
      io.emit('player:left', { id: socket.id });
    }
  });
});

// ── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  SHADOWHOUSE — Servidor Multiplayer      ║`);
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});
