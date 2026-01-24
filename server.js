const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 별도의 public 폴더 없이 현재 폴더(Orbit)에서 파일을 찾도록 설정
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 게임 로직 (채팅 포함) ---
const MAP_SIZE = 3000;
let players = {};
let foods = [];

function spawnFood(count = 1) {
    const colors = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF'];
    for (let i = 0; i < count; i++) {
        foods.push({
            id: Math.random().toString(36).substr(2, 9),
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            radius: 5,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}
spawnFood(200);

io.on('connection', (socket) => {
    socket.on('join', (nickname) => {
        const colors = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF'];
        players[socket.id] = {
            id: socket.id,
            nickname: nickname || "Guest",
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            radius: 20,
            score: 0,
            color: colors[Math.floor(Math.random() * colors.length)]
        };
        socket.emit('initFood', foods);
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (p) {
            p.x = data.x; p.y = data.y;
            for (let i = foods.length - 1; i >= 0; i--) {
                const f = foods[i];
                if (Math.hypot(p.x - f.x, p.y - f.y) < p.radius + f.radius) {
                    foods.splice(i, 1);
                    p.score += 0.5; 
                    p.radius += 0.2;
                    spawnFood(1);
                    io.emit('updateFood', foods);
                }
            }
        }
    });

    // 채팅 기능 (15개 누적의 핵심!)
    socket.on('chat', (msg) => {
        const p = players[socket.id];
        if (p && msg.trim() !== "") {
            io.emit('chat', { nick: p.nickname, msg: msg });
        }
    });

    socket.on('shoot', (data) => {
        const p = players[socket.id];
        if (p && p.score >= 1) {
            p.score -= 1; p.radius -= 0.5;
            io.emit('enemyShoot', { x: data.x, y: data.y, vx: data.vx, vy: data.vy, color: p.color, ownerId: socket.id });
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => {
    const pArr = Object.values(players);
    const leaderboard = [...pArr].sort((a,b)=>b.score-a.score).slice(0,5).map(p=>({nickname:p.nickname, score:p.score, color:p.color}));
    pArr.forEach(p => {
        const myRank = [...pArr].sort((a,b)=>b.score-a.score).findIndex(i=>i.id===p.id)+1;
        io.to(p.id).emit('gameState', { players, leaderboard, myRank, totalPlayers: pArr.length });
    });
}, 33);

server.listen(3000, () => console.log(`서버 실행 중: http://localhost:3000`));