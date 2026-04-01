/**
 * Hive Remote PvP — WebSocket Game Server
 * 
 * Run with: node server.js
 * Listens on port 3001
 * 
 * Protocol:
 *   Client → Server:
 *     { type: "create_room" }
 *     { type: "join_room", code: "ABC123" }
 *     { type: "move", move: { type, pieceType?, from?, to? } }
 *     { type: "leave" }
 *
 *   Server → Client:
 *     { type: "room_created", code: "ABC123", color: "white" }
 *     { type: "room_joined", code: "ABC123", color: "black" }
 *     { type: "game_start", white: true/false }
 *     { type: "opponent_move", move: {...} }
 *     { type: "opponent_left" }
 *     { type: "error", message: "..." }
 */

import { WebSocketServer } from 'ws';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Static Files ────────────────────────────────────────────────────────────
// Serve frontend build from 'dist' folder
app.use(express.static(path.join(__dirname, 'dist')));

// SPA support: redirect all other requests to index.html
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);

// ─── Room Management ────────────────────────────────────────────────────────

const rooms = new Map(); // code → { white: ws, black: ws, currentTurn: 'white' }

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getUniqueCode() {
  let code;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
  } while (rooms.has(code) && attempts < 100);
  return code;
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function findRoomByClient(ws) {
  for (const [code, room] of rooms.entries()) {
    if (room.white === ws || room.black === ws) {
      return { code, room };
    }
  }
  return null;
}

function send(ws, data) {
  if (ws && ws.readyState === 1) { // WebSocket.OPEN
    ws.send(JSON.stringify(data));
  }
}

// ─── WebSocket Server ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

const localIP = getLocalIP();

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         🐝  HIVE Online Game Server  🐝             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Server:  http://localhost:${PORT}                     ║`);
  if (process.env.PORT) {
    console.log(`║  Mode:    PRODUCTION (Cloud Hosting)               ║`);
  } else {
    console.log(`║  Network: ws://${localIP}:${PORT}${' '.repeat(Math.max(0, 22 - localIP.length))}║`);
  }
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  The frontend is now served alongside multiplayer!  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

wss.on('connection', (ws) => {
  console.log(`[+] Client connected (total: ${wss.clients.size})`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      // ─── Create Room ────────────────────────────────────────────
      case 'create_room': {
        // Leave any existing room first
        leaveRoom(ws);

        const code = getUniqueCode();
        rooms.set(code, {
          white: ws,
          black: null,
          currentTurn: 'white',
          moveCount: 0,
        });

        ws._roomCode = code;
        ws._color = 'white';

        send(ws, { type: 'room_created', code, color: 'white' });
        console.log(`[🏠] Room ${code} created (waiting for opponent)`);
        break;
      }

      // ─── Join Room ──────────────────────────────────────────────
      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);

        if (!room) {
          send(ws, { type: 'error', message: 'Oda bulunamadı. Kodu kontrol edin.' });
          return;
        }

        if (room.black !== null) {
          send(ws, { type: 'error', message: 'Oda dolu. Başka bir oda deneyin.' });
          return;
        }

        // Leave any existing room
        leaveRoom(ws);

        room.black = ws;
        ws._roomCode = code;
        ws._color = 'black';

        send(ws, { type: 'room_joined', code, color: 'black' });

        // Notify both players that game is starting
        if (room.white) send(room.white, { type: 'game_start', yourColor: 'white', opponentConnected: true });
        if (room.black) send(room.black, { type: 'game_start', yourColor: 'black', opponentConnected: true });

        console.log(`[🎮] Room ${code} — Game started! White vs Black`);
        break;
      }

      // ─── Move ───────────────────────────────────────────────────
      case 'move': {
        const found = findRoomByClient(ws);
        if (!found) {
          send(ws, { type: 'error', message: 'Bir odada değilsiniz.' });
          return;
        }

        const { code, room } = found;
        const playerColor = ws._color;

        // Validate turn
        if (playerColor !== room.currentTurn) {
          send(ws, { type: 'error', message: 'Sıra sizde değil!' });
          return;
        }

        // Switch turn
        room.currentTurn = room.currentTurn === 'white' ? 'black' : 'white';
        room.moveCount++;

        // Send move to opponent
        const opponent = playerColor === 'white' ? room.black : room.white;
        if (opponent) {
          send(opponent, { type: 'opponent_move', move: msg.move });
        }

        // Acknowledge to sender
        send(ws, { type: 'move_ack', moveCount: room.moveCount });

        console.log(`[♟] Room ${code} — ${playerColor} made move #${room.moveCount}`);
        break;
      }

      // ─── Game Over ──────────────────────────────────────────────
      case 'game_over': {
        const found = findRoomByClient(ws);
        if (!found) return;

        const { code, room } = found;
        const opponent = ws._color === 'white' ? room.black : room.white;
        if (opponent) {
          send(opponent, { type: 'game_over', winner: msg.winner });
        }

        console.log(`[🏆] Room ${code} — Game over! Winner: ${msg.winner}`);

        // Clean up room
        rooms.delete(code);
        break;
      }

      // ─── Leave ──────────────────────────────────────────────────
      case 'leave': {
        leaveRoom(ws);
        break;
      }

      default:
        send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  });

  ws.on('close', () => {
    console.log(`[-] Client disconnected (total: ${wss.clients.size})`);
    leaveRoom(ws);
  });

  ws.on('error', (err) => {
    console.error('[!] WebSocket error:', err.message);
  });
});

function leaveRoom(ws) {
  const found = findRoomByClient(ws);
  if (!found) return;

  const { code, room } = found;
  const playerColor = ws._color;
  const opponent = playerColor === 'white' ? room.black : room.white;

  // Notify opponent
  if (opponent) {
    send(opponent, { type: 'opponent_left' });
  }

  // Clean up
  if (room.white === ws) room.white = null;
  if (room.black === ws) room.black = null;

  // Delete room if empty
  if (!room.white && !room.black) {
    rooms.delete(code);
    console.log(`[🗑] Room ${code} deleted (empty)`);
  } else {
    console.log(`[🚪] ${playerColor} left room ${code}`);
    // Reset turn to remaining player if needed
    room.currentTurn = 'white';
    room.moveCount = 0;
  }
}

// Periodic cleanup of stale rooms
setInterval(() => {
  for (const [code, room] of rooms.entries()) {
    const whiteAlive = room.white && room.white.readyState === 1;
    const blackAlive = room.black && room.black.readyState === 1;
    if (!whiteAlive && !blackAlive) {
      rooms.delete(code);
      console.log(`[🗑] Stale room ${code} cleaned up`);
    }
  }
}, 30000);

// ─── Keep-Alive Ping (Render Free Tier) ──────────────────────────────────────
const RENDER_URL = 'https://hive-multiplayer.onrender.com';
setInterval(() => {
  https.get(RENDER_URL, (res) => {
    if (res.statusCode === 200) {
      console.log(`[+] Self-ping successful, keeping server awake.`);
    }
  }).on('error', (err) => {
    console.log(`[!] Self-ping failed:`, err.message);
  });
}, 10 * 60 * 1000); // Ping every 10 minutes
