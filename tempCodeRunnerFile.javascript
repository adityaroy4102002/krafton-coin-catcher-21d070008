/**
 * Krafton Multiplayer Assessment - Server Side
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// --- SERVER CONFIGURATION ---
const PORT = 3000;
const SIMULATED_LATENCY_MS = 200;
const SERVER_TICK_RATE = 30;
const MAP_DIMENSIONS = { width: 800, height: 600 };
const MOVEMENT_SPEED = 5;

// --- NETWORK SETUP ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

// --- GAME STATE ---
const matchState = {
    status: 'LOBBY',
    entities: {},    // <--- THIS IS WHAT THE CLIENT NEEDS
    collectibles: []
};

// --- HELPER FUNCTIONS ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const randomPos = (max) => Math.floor(Math.random() * max);

// --- WEBSOCKET HANDLER ---
wss.on('connection', (socket) => {
    const clientId = generateId();
    console.log(`[NET] New Client: ${clientId}`);

    // Init new player entity
    matchState.entities[clientId] = {
        x: randomPos(MAP_DIMENSIONS.width),
        y: randomPos(MAP_DIMENSIONS.height),
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        score: 0
    };

    broadcastWorldState();

    socket.on('message', (rawPayload) => {
        setTimeout(() => {
            try {
                const packet = JSON.parse(rawPayload);
                handlePacket(clientId, packet);
            } catch (err) {
                console.error(`[ERR] Malformed packet: ${err}`);
            }
        }, SIMULATED_LATENCY_MS);
    });

    socket.on('close', () => {
        console.log(`[NET] Client Disconnected: ${clientId}`);
        delete matchState.entities[clientId];
        if (Object.keys(matchState.entities).length === 0) {
            matchState.status = 'LOBBY';
            matchState.collectibles = [];
        }
    });
});

// --- CORE GAME LOGIC ---
function handlePacket(id, packet) {
    const player = matchState.entities[id];
    if (!player) return;

    if (packet.action === 'REQUEST_START' && matchState.status === 'LOBBY') {
        if (Object.keys(matchState.entities).length >= 2) {
            matchState.status = 'IN_PROGRESS';
            console.log('[GAME] Match Started');
        }
    }

    if (matchState.status === 'IN_PROGRESS' && packet.action === 'INPUT_MOVE') {
        const dir = packet.dir;
        if (dir === 'LEFT') player.x -= MOVEMENT_SPEED;
        if (dir === 'RIGHT') player.x += MOVEMENT_SPEED;
        if (dir === 'UP') player.y -= MOVEMENT_SPEED;
        if (dir === 'DOWN') player.y += MOVEMENT_SPEED;

        player.x = (player.x + MAP_DIMENSIONS.width) % MAP_DIMENSIONS.width;
        player.y = (player.y + MAP_DIMENSIONS.height) % MAP_DIMENSIONS.height;
    }
}

// --- PHYSICS LOOP ---
setInterval(() => {
    if (matchState.status === 'IN_PROGRESS') {
        if (matchState.collectibles.length < 5 && Math.random() < 0.03) {
            matchState.collectibles.push({
                id: generateId(),
                x: randomPos(MAP_DIMENSIONS.width),
                y: randomPos(MAP_DIMENSIONS.height)
            });
        }

        const grabRadius = 25;
        Object.values(matchState.entities).forEach(p => {
            for (let i = matchState.collectibles.length - 1; i >= 0; i--) {
                const c = matchState.collectibles[i];
                const dx = p.x - c.x;
                const dy = p.y - c.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < grabRadius) {
                    p.score += 10;
                    matchState.collectibles.splice(i, 1);
                }
            }
        });
    }
    broadcastWorldState();
}, 1000 / SERVER_TICK_RATE);

function broadcastWorldState() {
    const snapshot = JSON.stringify(matchState);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            setTimeout(() => client.send(snapshot), SIMULATED_LATENCY_MS);
        }
    });
}

server.listen(PORT, () => {
    console.log(`[SYSTEM] Server active on port ${PORT}`);
});