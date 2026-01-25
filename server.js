const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const MAP_SIZE = 3000;
const BOTS_COUNT = 8; // 봇 숫자 증가
let rooms = {
    ffa: { players: {}, foods: [], bullets: [] },
    team: { players: {}, foods: [], bullets: [] }
};

function spawnFood(mode, count = 1) {
    const colors = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF'];
    for (let i = 0; i < count; i++) {
        rooms[mode].foods.push({
            id: Math.random().toString(36).substr(2, 9),
            x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
            radius: 6, color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}
spawnFood('ffa', 300); spawnFood('team', 300);

// 플레이어 사망 및 리스폰 함수
function respawnPlayer(mode, id) {
    const p = rooms[mode].players[id];
    if (!p) return;
    p.x = Math.random() * MAP_SIZE;
    p.y = Math.random() * MAP_SIZE;
    p.score = 0;
    p.radius = 20;
}

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        const mode = data.mode || 'ffa';
        const nick = String(data.nickname || "Guest").substring(0, 10);
        socket.join(mode);
        socket.gameMode = mode;
        rooms[mode].players[socket.id] = {
            id: socket.id, nickname: nick, x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
            radius: 20, score: 0, color: `hsl(${Math.random() * 360}, 70%, 70%)`, isBot: false
        };
    });

    socket.on('move', (data) => {
        const mode = socket.gameMode;
        const p = rooms[mode]?.players[socket.id];
        if (!p) return;
        p.x = data.x; p.y = data.y;
        
        // 먹이 충돌 판정
        const foods = rooms[mode].foods;
        for (let i = foods.length - 1; i >= 0; i--) {
            if (Math.hypot(p.x - foods[i].x, p.y - foods[i].y) < p.radius) {
                foods.splice(i, 1); p.score += 1; p.radius += 0.2;
                spawnFood(mode, 1);
                io.to(mode).emit('updateFood', foods);
            }
        }
    });

    socket.on('shoot', (data) => {
        const mode = socket.gameMode;
        const p = rooms[mode]?.players[socket.id];
        if (p && p.score >= 2) {
            p.score -= 2; p.radius -= 0.4;
            rooms[mode].bullets.push({
                x: p.x, y: p.y, vx: data.vx, vy: data.vy,
                radius: 10, color: p.color, ownerId: socket.id, dist: 0
            });
        }
    });

    socket.on('disconnect', () => { if (socket.gameMode) delete rooms[socket.gameMode].players[socket.id]; });
});

setInterval(() => {
    ['ffa', 'team'].forEach(mode => {
        const room = rooms[mode];
        const pArr = Object.values(room.players);

        // 봇 생성 및 이동 로직 (먹이 추적)
        if (pArr.length < BOTS_COUNT) {
            const bId = 'bot_' + Math.random().toString(36).substr(2, 5);
            room.players[bId] = {
                id: bId, nickname: "BOT_" + bId.substr(4), isBot: true,
                x: Math.random() * MAP_SIZE, y: Math.random() * MAP_SIZE,
                radius: 20, score: 5, color: `hsl(${Math.random() * 360}, 50%, 60%)`
            };
        }

        pArr.forEach(p => {
            if (p.isBot) {
                // 가장 가까운 먹이 찾기
                let target = room.foods[0];
                let minDist = Math.hypot(p.x - target.x, p.y - target.y);
                for(let i=1; i<20; i++) { // 성능을 위해 가까운 20개만 체크
                    let f = room.foods[i];
                    let d = Math.hypot(p.x - f.x, p.y - f.y);
                    if(d < minDist) { minDist = d; target = f; }
                }
                const angle = Math.atan2(target.y - p.y, target.x - p.x);
                p.x += Math.cos(angle) * 3.5;
                p.y += Math.sin(angle) * 3.5;

                // 봇 먹이 먹기
                if (minDist < p.radius) {
                    room.foods = room.foods.filter(f => f.id !== target.id);
                    p.score += 1; p.radius += 0.2; spawnFood(mode, 1);
                }
            }
        });

        // 총알 이동 및 플레이어 충돌 판정 (죽이기 로직)
        for (let i = room.bullets.length - 1; i >= 0; i--) {
            const b = room.bullets[i];
            b.x += b.vx; b.y += b.vy; b.dist++;

            pArr.forEach(p => {
                if (p.id !== b.ownerId) { // 자신이 쏜 총알이 아닐 때
                    const d = Math.hypot(b.x - p.x, b.y - p.y);
                    if (d < p.radius + b.radius) {
                        p.score -= 10; p.radius -= 2; // 총 맞으면 점수 대폭 하락
                        room.bullets.splice(i, 1);
                        if (p.score < -5 || p.radius < 10) { // 사망 조건
                            respawnPlayer(mode, p.id);
                        }
                    }
                }
            });

            if (b && (b.dist > 100 || b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE)) {
                room.bullets.splice(i, 1);
            }
        }

        const leaderboard = [...pArr].sort((a, b) => b.score - a.score).slice(0, 5);
        pArr.forEach(p => {
            if (!p.isBot) io.to(p.id).emit('gameState', {
                players: room.players, bullets: room.bullets,
                leaderboard: leaderboard.map(l => ({ nickname: l.nickname, score: Math.floor(l.score), color: l.color })),
                myRank: pArr.sort((a,b)=>b.score-a.score).findIndex(u=>u.id===p.id)+1, totalPlayers: pArr.length
            });
        });
    });
}, 33);

server.listen(3000);