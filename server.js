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

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const CELL = 4;
const players = {};  // socketId → player data
const lastSent = {};
const UPDATE_INTERVAL_MS = 50;

const SKIN_COLORS = {
  detective:0x4a6fa5, soldier:0x3d6b35, hacker:0x1a1a2e,
  survivor:0x8b4513, ghost:0xc8c8ff, medic:0xffffff,
  kauan:0x050003, reporter:0xd2a679,
};

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── JOIN ──────────────────────────────────────────────────────
  socket.on('player:join', ({ name, skinId, bio, avatar }) => {
    players[socket.id] = {
      id: socket.id,
      name: (name || 'DETETIVE').substring(0, 16),
      skinId: skinId || 'detective',
      color: SKIN_COLORS[skinId] ?? 0x4a6fa5,
      bio: (bio||'').substring(0,80),
      avatar: (avatar||'').substring(0,2000), // small base64 avatar
      x:0, z:0, yaw:0, alive:true,
    };
    lastSent[socket.id] = 0;
    socket.emit('player:init', { selfId:socket.id, players:Object.values(players) });
    socket.broadcast.emit('player:joined', players[socket.id]);
    console.log(`  JOIN: ${players[socket.id].name} (${socket.id})`);
  });

  // ── PROFILE UPDATE ────────────────────────────────────────────
  socket.on('player:profile', ({ name, bio, avatar, skinId }) => {
    const p = players[socket.id]; if(!p) return;
    if(name) p.name = name.substring(0,16);
    if(bio !== undefined) p.bio = bio.substring(0,80);
    if(avatar !== undefined) p.avatar = avatar.substring(0,2000);
    if(skinId) { p.skinId=skinId; p.color=SKIN_COLORS[skinId]??0x4a6fa5; }
    io.emit('player:profile_updated', { id:socket.id, name:p.name, bio:p.bio, avatar:p.avatar, skinId:p.skinId });
  });

  // ── MOVE ──────────────────────────────────────────────────────
  socket.on('player:move', (data) => {
    const p = players[socket.id]; if(!p) return;
    const now = Date.now();
    if(now - lastSent[socket.id] < UPDATE_INTERVAL_MS) return;
    lastSent[socket.id] = now;
    p.x = data.x ?? p.x; p.z = data.z ?? p.z; p.yaw = data.yaw ?? p.yaw;
    socket.broadcast.emit('player:moved', { id:socket.id, x:p.x, z:p.z, yaw:p.yaw });
  });

  // ── CHAT (global) ─────────────────────────────────────────────
  socket.on('chat:msg', (msg) => {
    const p = players[socket.id]; if(!p) return;
    const safe = String(msg).substring(0,120);
    io.emit('chat:msg', { from:p.name, fromId:socket.id, msg:safe });
  });

  // ── DM (private chat) ─────────────────────────────────────────
  socket.on('chat:dm', ({ toId, msg }) => {
    const p = players[socket.id]; if(!p) return;
    const safe = String(msg).substring(0,120);
    // Send to target
    io.to(toId).emit('chat:dm', { fromId:socket.id, from:p.name, msg:safe });
    // Echo back to sender
    socket.emit('chat:dm_sent', { toId, msg:safe });
  });

  // ── FRIEND REQUEST ────────────────────────────────────────────
  socket.on('friend:request', ({ toId }) => {
    const p = players[socket.id]; if(!p) return;
    io.to(toId).emit('friend:request', { fromId:socket.id, fromName:p.name });
  });
  socket.on('friend:accept', ({ toId }) => {
    const p = players[socket.id]; if(!p) return;
    io.to(toId).emit('friend:accepted', { fromId:socket.id, fromName:p.name });
    socket.emit('friend:accepted', { fromId:toId, fromName:players[toId]?.name||'?' });
  });
  socket.on('friend:decline', ({ toId }) => {
    io.to(toId).emit('friend:declined', { fromId:socket.id });
  });

  // ── VIEW PROFILE ──────────────────────────────────────────────
  socket.on('player:view_profile', ({ targetId }) => {
    const t = players[targetId]; if(!t) return;
    socket.emit('player:profile_data', { id:targetId, name:t.name, bio:t.bio, avatar:t.avatar, skinId:t.skinId });
  });

  // ── VOICE SIGNALING ───────────────────────────────────────────
  socket.on('voice:ready', () => {
    // Tell ALL other connected players this peer is ready for voice
    socket.broadcast.emit('voice:peer_ready', { from: socket.id });
  });
  socket.on('voice:offer',  ({to,sdp})       => { io.to(to).emit('voice:offer',  {from:socket.id,sdp}); });
  socket.on('voice:answer', ({to,sdp})       => { io.to(to).emit('voice:answer', {from:socket.id,sdp}); });
  socket.on('voice:ice',    ({to,candidate}) => { io.to(to).emit('voice:ice',    {from:socket.id,candidate}); });

  // ── CAPTURED ──────────────────────────────────────────────────
  socket.on('player:captured', () => {
    const p = players[socket.id]; if(!p) return;
    p.alive = false;
    io.emit('player:captured', { id:socket.id, name:p.name });
  });

  // ── DISCONNECT ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    socket.broadcast.emit('voice:peer_left', { from: socket.id });
    const p = players[socket.id];
    if(p){
      console.log(`[-] Left: ${p.name} (${socket.id})`);
      delete players[socket.id];
      delete lastSent[socket.id];
      io.emit('player:left', { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  SHADOWHOUSE — Servidor Multiplayer      ║`);
  console.log(`║  http://localhost:${PORT}                    ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});
