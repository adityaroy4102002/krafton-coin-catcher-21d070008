const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// 1. SETUP SERVER
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve the "public" folder to the browser (where your client code will live)
app.use(express.static('public'));

// 2. GAME STATE (Server Authority) [cite: 11, 21]
// We store everything here. Clients only receive this data.
const gameState = {
    players: {}, // Stores player positions: { id: { x, y, color } }
    coins: [],   // Stores coin positions: [{ x, y, id }]
    gameActive: false // Waits for 2 players [cite: 14]
};

// Configuration
const PORT = 3000;
const LATENCY_MS = 200; // REQUIRED: Simulated Network Lag 
const TICK_RATE = 30;   // How many times per second the server updates (30 FPS)
const SPEED = 5;        // How fast players move

// 3. HANDLE CONNECTIONS
wss.on('connection', (ws) => {
    // Generate a simple unique ID for this player
    const playerId = Date.now().toString();
    console.log(`Player connected: ${playerId}`);

    // Initialize the player in the server state
    gameState.players[playerId] = {
        x: Math.random() * 500, // Random start position
        y: Math.random() * 500,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16), // Random color
        score: 0
    };

    // Check Lobby Requirement: Need 2 players to start [cite: 14]
    if (Object.keys(gameState.players).length >= 2) {
        gameState.gameActive = true;
        console.log("Game Session Started!");
    }

    // HANDLE INCOMING MESSAGES (INPUTS)
    ws.on('message', (message) => {
        // CONSTRAINT: Introduce ~200ms latency to received data 
        setTimeout(() => {
            try {
                const data = JSON.parse(message);

                // SECURITY: Server Authority [cite: 22, 23]
                // We only accept "intent" (direction), NOT position.
                // We calculate the new position here on the server.
                const player = gameState.players[playerId];
                if (player && gameState.gameActive) {
                    if (data.input === 'left') player.x -= SPEED;
                    if (data.input === 'right') player.x += SPEED;
                    if (data.input === 'up') player.y -= SPEED;
                    if (data.input === 'down') player.y += SPEED;

                    // Basic boundary collision (keep inside 800x600 map)
                    player.x = Math.max(0, Math.min(800, player.x));
                    player.y = Math.max(0, Math.min(600, player.y));
                }
            } catch (e) {
                console.error("Invalid JSON received");
            }
        }, LATENCY_MS); // <--- The Artificial Lag
    });

    // HANDLE DISCONNECT
    ws.on('close', () => {
        console.log(`Player disconnected: ${playerId}`);
        delete gameState.players[playerId];
        // Stop game if less than 2 players? (Optional logic)
        if (Object.keys(gameState.players).length < 2) {
            gameState.gameActive = false;
        }
    });
});

// 4. THE GAME LOOP (The Heartbeat)
// The server updates the game and sends snapshots to clients
setInterval(() => {
    if (!gameState.gameActive) return;

    // A. GAME LOGIC (Coin Spawning & Collision)
    // Spawn a coin randomly every few seconds (simplified logic)
    if (gameState.coins.length < 3 && Math.random() < 0.02) {
        gameState.coins.push({
            id: Date.now(),
            x: Math.random() * 780,
            y: Math.random() * 580
        });
    }

    // Check collisions between players and coins [cite: 25]
    Object.keys(gameState.players).forEach(id => {
        const player = gameState.players[id];
        gameState.coins = gameState.coins.filter(coin => {
            const distance = Math.hypot(player.x - coin.x, player.y - coin.y);
            if (distance < 30) { // Collision radius
                player.score += 1; // Server updates score [cite: 20]
                return false; // Remove coin
            }
            return true; // Keep coin
        });
    });

    // B. BROADCAST STATE
    // Send the "World State" to all connected clients
    const stateSnapshot = JSON.stringify(gameState);

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            // CONSTRAINT: Introduce ~200ms latency to sent data 
            setTimeout(() => {
                client.send(stateSnapshot);
            }, LATENCY_MS);
        }
    });

}, 1000 / TICK_RATE); // Run 30 times per second

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});