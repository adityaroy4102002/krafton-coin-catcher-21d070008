
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

//CONFIG
const PORT = 3000;
const SIMULATED_LATENCY_MS = 200;
const SERVER_TICK_RATE = 30;
const MAP_DIMENSIONS = { width: 800, height: 600 };
const MOVEMENT_SPEED = 5;
const WINNING_SCORE = 50;

// SETUP
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

//STATE
let matchState = {
    status: 'LOBBY',
    entities: {},
    collectibles: [],
    bombs: [],
    winner: null
};

const generateId = () => Math.random().toString(36).substr(2, 9);
const randomPos = (max) => Math.floor(Math.random() * max);

function resetMatch() {
    matchState.status = 'IN_PROGRESS';
    matchState.collectibles = [];
    matchState.bombs = [];
    matchState.winner = null;

    Object.keys(matchState.entities).forEach(id => {
        matchState.entities[id].x = randomPos(MAP_DIMENSIONS.width);
        matchState.entities[id].y = randomPos(MAP_DIMENSIONS.height);
        matchState.entities[id].score = 0;
    });
    console.log('[GAME] Match Restarted');
}

//CONNECT
wss.on('connection', (socket) => {
    const clientId = generateId();
    console.log(`[NET] New Client: ${clientId}`);

    //  IDENTITY HANDSHAKE
    const initPacket = JSON.stringify({ type: 'INIT', id: clientId });
    socket.send(initPacket);

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
            } catch (err) { }
        }, SIMULATED_LATENCY_MS);
    });

    socket.on('close', () => {
        delete matchState.entities[clientId];
        if (Object.keys(matchState.entities).length === 0) {
            matchState.status = 'LOBBY';
            matchState.collectibles = [];
            matchState.bombs = [];
        }
    });
});

function handlePacket(id, packet) {
    const player = matchState.entities[id];
    if (!player) return;

    if (packet.action === 'REQUEST_START' && matchState.status === 'LOBBY') {
        if (Object.keys(matchState.entities).length >= 2) resetMatch();
    }
    if (packet.action === 'REQUEST_RESTART' && matchState.status === 'GAME_OVER') {
        resetMatch();
    }
    if (matchState.status === 'IN_PROGRESS' && packet.action === 'INPUT_MOVE') {
        const dir = packet.dir;
        if (dir === 'LEFT') player.x -= MOVEMENT_SPEED;
        if (dir === 'RIGHT') player.x += MOVEMENT_SPEED;
        if (dir === 'UP') player.y -= MOVEMENT_SPEED;
        if (dir === 'DOWN') player.y += MOVEMENT_SPEED;

        // Wrap Around
        player.x = (player.x + MAP_DIMENSIONS.width) % MAP_DIMENSIONS.width;
        player.y = (player.y + MAP_DIMENSIONS.height) % MAP_DIMENSIONS.height;
    }
}

//GAME LOOP 
setInterval(() => {
    if (matchState.status === 'IN_PROGRESS') {
        if (matchState.collectibles.length < 5 && Math.random() < 0.03) {
            matchState.collectibles.push({ id: generateId(), x: randomPos(MAP_DIMENSIONS.width), y: randomPos(MAP_DIMENSIONS.height) });
        }
        if (matchState.bombs.length < 3 && Math.random() < 0.01) {
            matchState.bombs.push({ id: generateId(), x: randomPos(MAP_DIMENSIONS.width), y: randomPos(MAP_DIMENSIONS.height) });
        }

        const grabRadius = 25;
        const playerIds = Object.keys(matchState.entities);

        playerIds.forEach(id => {
            const p = matchState.entities[id];

            // Coin Logic
            for (let i = matchState.collectibles.length - 1; i >= 0; i--) {
                const c = matchState.collectibles[i];
                if (Math.hypot(p.x - c.x, p.y - c.y) < grabRadius) {
                    p.score += 10;
                    matchState.collectibles.splice(i, 1);
                    if (p.score >= WINNING_SCORE) {
                        matchState.status = 'GAME_OVER';
                        matchState.winner = id;
                    }
                }
            }

            // Bomb Logic
            for (let b of matchState.bombs) {
                if (Math.hypot(p.x - b.x, p.y - b.y) < grabRadius) {
                    matchState.status = 'GAME_OVER';
                    const winnerId = playerIds.find(pid => pid !== id);
                    matchState.winner = winnerId || "NOBODY";
                }
            }
        });
    }
    broadcastWorldState();
}, 1000 / SERVER_TICK_RATE);

function broadcastWorldState() {
    const snapshot = JSON.stringify({ type: 'UPDATE', state: matchState });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            setTimeout(() => client.send(snapshot), SIMULATED_LATENCY_MS);
        }
    });
}

server.listen(PORT, () => {
    console.log(`Krafton Multiplayer Test running on http://localhost:${PORT}`);
});