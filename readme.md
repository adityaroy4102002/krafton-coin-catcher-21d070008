Coin Catcher - Multiplayer Sync Test
A real-time multiplayer arcade game demonstrating server authority  under high-latency conditions. Built with Node.js and raw WebSockets.

Objective: synchronize player movement and game state across clients with a forced 200ms network latency.
* Build with- Node.js, Express, `ws` (WebSocket library), HTML5 Canvas.
* PARTS-Lobby system, authoritative physics, entity interpolation, and win/loss conditions.

##TO RUN
1. **Install**
    ```bash
    npm install
    ```

2.  **Start the Server**
    ```bash
    node server.js
    ```

3.  **Play**
    * Open two separate browser windows/tabs at `http://localhost:3000`.
    * Wait for both clients to connect (Lobby UI will update).
    * Click **START MATCH** on either client.
    * **Controls:** Arrow Keys or WASD.

Technical Implementation

1. Network Quality Simulation (Latency)
Per the assignment requirements, a **200ms delay** is strictly enforced on the server.
* Incoming: `socket.on('message')` is wrapped in a `setTimeout` to delay input processing.
* Outgoing: `broadcastWorldState()` delays the packet sending by 200ms.
* 

2. Entity Interpolation (Smoothness)
To counter the jitter caused by the 200ms delay, the client does not render the raw state immediately.It is tackled by
* Jitter Buffer:Incoming server snapshots are stored in a `packetBuffer`.
* Time-Offset Rendering: The client renders the game state 100ms in the past.
* **Linear Interpolation (Lerp):** The render loop finds the two snapshots surrounding the render time and interpolates position `x = start + (end - start) * t`.
* **Screen Wrapping:** Custom logic handles interpolation edge-cases when players wrap around the map boundaries (0 -> 800).

3. Server Authority (Security)
The client is a "dumb terminal" that only visualizes data.
* **Input Only:** Clients send `{ action: 'INPUT_MOVE', dir: 'LEFT' }`. They do **not** send coordinates.
* **Validation:** The server calculates velocity, position, and map wrapping.
* **Collision:** Coin collection and Bomb hits are calculated strictly on the server using `Math.hypot()`. The client cannot spoof a score.

## Extra Features
* **Lobby System:** Game state management (`LOBBY`, `IN_PROGRESS`, `GAME_OVER`) to ensure synchronized starts.
* **Win Conditions:** First to 50 points (Score Win) or if the opponent hits a bomb (Survival Win).
* **Identity System:** Server assigns IDs and the Client visually highlights "YOU" vs "Opponent".

