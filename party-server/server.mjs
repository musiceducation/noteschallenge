import http from 'node:http';
import crypto from 'node:crypto';
import { PartyRoomManager } from './game-engine.mjs';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Minimal RFC 6455 WebSocket Frame Encoder / Decoder (zero external npm deps).
 */
function encodeWsFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuf]);
}

function sendWsJson(socket, obj) {
  if (!socket || socket.destroyed || !socket.writable) return;
  try {
    const buf = Buffer.from(JSON.stringify(obj), 'utf8');
    socket.write(encodeWsFrame(0x1, buf));
  } catch (e) {}
}

function attachWsDecoder(socket, onMessage, onClose) {
  let buffer = Buffer.alloc(0);
  let closed = false;

  function finish() {
    if (closed) return;
    closed = true;
    try { socket.destroy(); } catch (e) {}
    onClose();
  }

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      if (payloadLen > 256 * 1024) {
        finish();
        return;
      }

      const maskLen = masked ? 4 : 0;
      if (buffer.length < offset + maskLen + payloadLen) return;

      const payload = Buffer.allocUnsafe(payloadLen);
      if (masked) {
        const mask = buffer.subarray(offset, offset + 4);
        const raw = buffer.subarray(offset + 4, offset + 4 + payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = raw[i] ^ mask[i & 3];
        }
      } else {
        buffer.copy(payload, 0, offset, offset + payloadLen);
      }

      buffer = buffer.subarray(offset + maskLen + payloadLen);

      if (opcode === 0x8) { // Close
        finish();
        return;
      } else if (opcode === 0x9) { // Ping -> Pong
        try { socket.write(encodeWsFrame(0xA, payload)); } catch (e) {}
      } else if (opcode === 0x1) { // Text
        try {
          const msg = JSON.parse(payload.toString('utf8'));
          onMessage(msg);
        } catch (e) {
          sendWsJson(socket, { type: 'error', code: 'BAD_JSON', error: '無效的 JSON 訊息' });
        }
      }
    }
  });

  socket.on('close', finish);
  socket.on('error', finish);
  socket.on('end', finish);
}

export function startPartyServer(options = {}) {
  const port = options.port ?? (Number(process.env.PARTY_PORT) || 8788);
  const host = options.host || '127.0.0.1';

  // Per-room active sockets: roomCode -> Set<ClientSession>
  const roomSockets = new Map();
  const allClients = new Set();

  function addSocketToRoom(roomCode, client) {
    if (client.roomCode && client.roomCode !== roomCode) {
      removeSocketFromRoom(client);
    }
    client.roomCode = roomCode;
    let set = roomSockets.get(roomCode);
    if (!set) {
      set = new Set();
      roomSockets.set(roomCode, set);
    }
    set.add(client);
  }

  function removeSocketFromRoom(client) {
    if (!client.roomCode) return;
    const set = roomSockets.get(client.roomCode);
    if (set) {
      set.delete(client);
      if (set.size === 0) roomSockets.delete(client.roomCode);
    }
  }

  function broadcastToRoom(roomCode, message) {
    const set = roomSockets.get(roomCode);
    if (!set) return;
    const buf = encodeWsFrame(0x1, Buffer.from(JSON.stringify(message), 'utf8'));
    for (const c of set) {
      if (c.socket && !c.socket.destroyed && c.socket.writable) {
        try { c.socket.write(buf); } catch (e) {}
      }
    }
  }

  const manager = new PartyRoomManager({
    ...options,
    onBroadcast: (roomCode, msg) => broadcastToRoom(roomCode, msg)
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        service: 'notes-party-server',
        rooms: manager.rooms.size,
        connections: allClients.size,
        serverTime: manager.now()
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const client = {
      socket,
      roomCode: null,
      playerId: null,
      hostToken: null
    };
    allClients.add(client);

    attachWsDecoder(socket, (msg) => {
      if (!msg || typeof msg !== 'object') return;
      const reqId = msg.reqId || null;
      const reply = (payload) => sendWsJson(socket, { type: 'reply', reqId, ...payload });
      const action = String(msg.type || '');

      if (action === 'ping') {
        reply({ ok: true, serverTime: manager.now(), clientTime: msg.clientTime || 0 });
        return;
      }

      if (action === 'create_room') {
        const res = manager.createRoom(msg);
        if (res.ok) {
          client.playerId = res.playerId;
          client.hostToken = res.hostToken;
          addSocketToRoom(res.roomCode, client);
        }
        reply(res);
        return;
      }

      if (action === 'join_room') {
        const res = manager.joinRoom(msg.roomCode, msg);
        if (res.ok) {
          client.playerId = res.playerId;
          client.hostToken = null;
          addSocketToRoom(res.roomCode, client);
        }
        reply(res);
        return;
      }

      if (action === 'reconnect') {
        const res = manager.reconnectPlayer(msg.roomCode, msg);
        if (res.ok) {
          client.playerId = res.playerId;
          client.hostToken = msg.hostToken || null;
          addSocketToRoom(res.roomCode, client);
        }
        reply(res);
        return;
      }

      // All subsequent actions must belong to the client's current room (strict room isolation)
      const targetRoom = String(msg.roomCode || client.roomCode || '').trim().toUpperCase();
      if (!client.roomCode || !client.playerId || targetRoom !== client.roomCode) {
        reply({ ok: false, code: 'CROSS_ROOM_DENIED', error: '無權存取其他房間或尚未加入房間' });
        return;
      }

      if (action === 'leave_room') {
        const res = manager.leaveRoom(client.roomCode, client.playerId);
        removeSocketFromRoom(client);
        client.roomCode = null;
        client.playerId = null;
        client.hostToken = null;
        reply(res);
        return;
      }

      if (action === 'set_ready') {
        reply(manager.setReady(client.roomCode, client.playerId, msg.ready));
        return;
      }

      if (action === 'update_config') {
        reply(manager.updateConfig(client.roomCode, client.playerId, msg.hostToken || client.hostToken, msg.config || msg));
        return;
      }

      if (action === 'assign_team') {
        reply(manager.assignTeam(client.roomCode, client.playerId, msg.hostToken || client.hostToken, msg.targetPlayerId, msg.team));
        return;
      }

      if (action === 'kick_player') {
        const targetId = msg.targetPlayerId;
        const res = manager.kickPlayer(client.roomCode, client.playerId, msg.hostToken || client.hostToken, targetId);
        if (res.ok) {
          const set = roomSockets.get(client.roomCode);
          if (set) {
            for (const other of set) {
              if (other.playerId === targetId) {
                sendWsJson(other.socket, { type: 'kicked', message: '你已被老師移出房間' });
                removeSocketFromRoom(other);
                other.roomCode = null;
                other.playerId = null;
              }
            }
          }
        }
        reply(res);
        return;
      }

      if (action === 'start_match') {
        reply(manager.startMatch(client.roomCode, client.playerId, msg.hostToken || client.hostToken));
        return;
      }

      if (action === 'next_round') {
        reply(manager.nextRound(client.roomCode, client.playerId, msg.hostToken || client.hostToken));
        return;
      }

      if (action === 'return_lobby') {
        reply(manager.returnToLobby(client.roomCode, client.playerId, msg.hostToken || client.hostToken));
        return;
      }

      if (action === 'move') {
        const res = manager.handleMove(client.roomCode, client.playerId, msg);
        if (!res.ok) reply(res);
        return;
      }

      if (action === 'submit_answer') {
        reply(manager.submitAnswer(client.roomCode, client.playerId, msg));
        return;
      }

      reply({ ok: false, code: 'UNKNOWN_ACTION', error: `不支援的指令：${action}` });
    }, () => {
      allClients.delete(client);
      if (client.roomCode && client.playerId) {
        const rc = client.roomCode;
        const pid = client.playerId;
        removeSocketFromRoom(client);
        manager.disconnectPlayer(rc, pid);
      }
    });
  });

  // Authoritative 10Hz state tick + movement snapshot broadcast
  const tickInterval = setInterval(() => {
    manager.tick();
    for (const [code, set] of roomSockets.entries()) {
      if (set.size > 0 && manager.rooms.has(code)) {
        broadcastToRoom(code, {
          type: 'state_tick',
          snapshot: manager.getPublicSnapshot(code)
        });
      }
    }
  }, options.tickMs ?? 100);

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      clearInterval(tickInterval);
      reject(err);
    });
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        server,
        manager,
        port: addr.port,
        wsUrl: `ws://${host}:${addr.port}/ws`,
        httpUrl: `http://${host}:${addr.port}`,
        close: () => new Promise((res) => {
          clearInterval(tickInterval);
          for (const c of allClients) {
            try { c.socket.destroy(); } catch (e) {}
          }
          allClients.clear();
          server.close(() => res());
        })
      });
    });
  });
}

// Run standalone if invoked directly via `node party-server/server.mjs`
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  startPartyServer({ host: process.env.PARTY_HOST || '0.0.0.0' }).then((info) => {
    console.log(`[party-server] listening on ${info.wsUrl} (health: ${info.httpUrl}/health)`);
  });
}
