
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const uiLayer = document.getElementById('ui-layer');
const titleLabel = document.querySelector('.hud-title');
const playerCountLabel = document.getElementById('player-count');
const startBtn = document.getElementById('start-btn');
const rulesBox = document.getElementById('rules-box');
const kraftonTag = document.getElementById('krafton-tag');

const SERVER_URL = 'ws://' + window.location.host;
const INTERP_BUFFER_MS = 100;

let socket;
let packetBuffer = [];
let isGameRunning = false;
let myClientId = null;
const activeKeys = new Set();

function init() {
    socket = new WebSocket(SERVER_URL);

    socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);

        if (payload.type === 'INIT') {
            myClientId = payload.id;
            return;
        }

        if (payload.type === 'UPDATE') {
            handleServerUpdate(payload.state);
        }
    };

    socket.onopen = () => console.log("Connected");
    startGameLoop();
}

function handleServerUpdate(state) {
    const connectedCount = Object.keys(state.entities).length;
    playerCountLabel.innerText = `${connectedCount} Players Connected`;

    if (state.status === 'LOBBY') {
        uiLayer.style.display = 'flex';
        if (kraftonTag) kraftonTag.style.display = 'block';
        if (rulesBox) rulesBox.style.display = 'block';

        titleLabel.innerText = "COIN CATCHER";
        titleLabel.style.color = "#ffffff";

        startBtn.onclick = () => sendIntent('REQUEST_START');
        startBtn.disabled = connectedCount < 2;
        startBtn.innerText = connectedCount < 2 ? "WAITING FOR PLAYERS..." : "START MATCH";
        isGameRunning = false;

    } else if (state.status === 'GAME_OVER') {
        uiLayer.style.display = 'flex';
        if (kraftonTag) kraftonTag.style.display = 'none';
        if (rulesBox) rulesBox.style.display = 'none';

        if (state.winner === myClientId) {
            titleLabel.innerText = "VICTORY";
            titleLabel.style.color = "#00aeff"; 
        } else if (state.winner === "NOBODY") {
            titleLabel.innerText = "DRAW";
            titleLabel.style.color = "#ffe000";
        } else {
            titleLabel.innerText = "DEFEAT";
            titleLabel.style.color = "#ff4444";
        }

        startBtn.disabled = false;
        startBtn.innerText = "PLAY AGAIN";
        startBtn.onclick = () => sendIntent('REQUEST_RESTART');
        isGameRunning = false;

    } else {
        uiLayer.style.display = 'none';
        isGameRunning = true;
    }

    packetBuffer.push({ state: state, timestamp: Date.now() });
    if (packetBuffer.length > 10) packetBuffer.shift();
}

function sendIntent(action, data = {}) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action, ...data }));
    }
}

window.addEventListener('keydown', (e) => activeKeys.add(e.code));
window.addEventListener('keyup', (e) => activeKeys.delete(e.code));

setInterval(() => {
    if (!isGameRunning) return;
    if (activeKeys.has('ArrowLeft') || activeKeys.has('KeyA')) sendIntent('INPUT_MOVE', { dir: 'LEFT' });
    if (activeKeys.has('ArrowRight') || activeKeys.has('KeyD')) sendIntent('INPUT_MOVE', { dir: 'RIGHT' });
    if (activeKeys.has('ArrowUp') || activeKeys.has('KeyW')) sendIntent('INPUT_MOVE', { dir: 'UP' });
    if (activeKeys.has('ArrowDown') || activeKeys.has('KeyS')) sendIntent('INPUT_MOVE', { dir: 'DOWN' });
}, 1000 / 30);

function startGameLoop() {
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid();

        const renderTime = Date.now() - INTERP_BUFFER_MS;
        const frames = getInterpolationFrames(renderTime);

        if (frames) {
            renderWorld(frames.previous, frames.next, frames.ratio);
        }
        requestAnimationFrame(draw);
    }
    draw();
}

function getInterpolationFrames(renderTime) {
    if (packetBuffer.length < 2) return null;
    for (let i = 1; i < packetBuffer.length; i++) {
        if (packetBuffer[i].timestamp >= renderTime) {
            const prev = packetBuffer[i - 1];
            const next = packetBuffer[i];
            const ratio = (renderTime - prev.timestamp) / (next.timestamp - prev.timestamp);
            return { previous: prev.state, next: next.state, ratio: Math.max(0, Math.min(1, ratio)) };
        }
    }
    return null;
}

function renderWorld(stateA, stateB, t) {
    Object.keys(stateB.entities).forEach(id => {
        const pNow = stateB.entities[id];
        const pPrev = stateA.entities[id];

        if (pPrev) {
            let x = lerp(pPrev.x, pNow.x, t);
            let y = lerp(pPrev.y, pNow.y, t);

            if (Math.abs(pNow.x - pPrev.x) > 400) x = pNow.x;
            if (Math.abs(pNow.y - pPrev.y) > 300) y = pNow.y;

            
            if (id === myClientId) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 3;
                ctx.strokeRect(x - 4, y - 4, 28, 28);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 11px sans-serif";
                ctx.fillText(`YOU: ${pNow.score}`, x - 2, y - 8);
            } else {
                // Dimmer score for opponents
                ctx.fillStyle = "#888";
                ctx.font = "11px sans-serif";
                ctx.fillText(pNow.score, x, y - 8);
            }

            ctx.fillStyle = pNow.color;
            ctx.fillRect(x, y, 20, 20);
        }
    });

    // COINS 
    ctx.fillStyle = "#FFD700";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#FFD700";
    stateB.collectibles.forEach(c => {
        ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;

    // BOMBS 
    ctx.fillStyle = "#ff2222";
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#ff0000";
    (stateB.bombs || []).forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, 10, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
}

const lerp = (start, end, t) => start + (end - start) * t;

function drawGrid() {
    ctx.strokeStyle = '#333'; 
    ctx.lineWidth = 1;
    for (let x = 0; x <= 800; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke(); }
    for (let y = 0; y <= 600; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke(); }
}

init();