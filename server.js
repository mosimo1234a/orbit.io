const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let foods = [];
const WORLD_SIZE = 3000;
const MAX_FOODS = 150;

// 먹이 생성 (파스텔톤)
function spawnFood() {
    const colors = ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF'];
    while (foods.length < MAX_FOODS) {
        foods.push({
            id: Math.random().toString(36).substr(2, 9),
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE,
            color: colors[Math.floor(Math.random() * colors.length)],
            radius: 8
        });
    }
}
spawnFood();

io.on('connection', (socket) => {
    socket.on('join', (nick) => {
        const pastelColors = ['#FFB3BA', '#BAFFC9', '#BAE1FF', '#FFFFBA', '#FFDFBA', '#E0BBE4'];
        players[socket.id] = {
            id: socket.id,
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE,
            nickname: nick.substring(0, 10) || "익명",
            score: 5,
            radius: 25,
            color: pastelColors[Math.floor(Math.random() * pastelColors.length)]
        };
        socket.emit('initFood', foods);
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            
            // 먹이 충돌 감지
            for (let i = foods.length - 1; i >= 0; i--) {
                let f = foods[i];
                if (Math.hypot(players[socket.id].x - f.x, players[socket.id].y - f.y) < players[socket.id].radius + f.radius) {
                    players[socket.id].score += 1;
                    players[socket.id].radius += 0.5;
                    foods.splice(i, 1);
                    spawnFood();
                    io.emit('updateFood', foods);
                }
            }
        }
    });

    socket.on('shoot', (data) => {
        if (players[socket.id] && players[socket.id].score > 2) {
            players[socket.id].score -= 1;
            players[socket.id].radius = Math.max(20, players[socket.id].radius - 0.3);
            io.emit('enemyShoot', { ...data, ownerId: socket.id, color: players[socket.id].color });
        }
    });

    socket.on('hit', (targetId) => {
        const shooter = players[socket.id];
        const target = players[targetId];
        if (shooter && target) {
            target.score = Math.max(0, target.score - 3);
            target.radius = Math.max(20, target.radius - 1.5);
            shooter.score += 2;
            shooter.radius += 1;
            if (target.score <= 0) {
                shooter.score += 20;
                shooter.radius += 10;
                io.emit('killLog', { killer: shooter.nickname, victim: target.nickname });
                io.to(targetId).emit('gameOver');
                delete players[targetId];
            }
        }
    });

    socket.on('sendChat', (msg) => {
        if (players[socket.id]) {
            io.emit('receiveChat', { 
                nick: players[socket.id].nickname, 
                text: msg.substring(0, 50), 
                color: players[socket.id].color 
            });
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

// 실시간 순위 및 상태 전송 루프
setInterval(() => {
    const sorted = Object.values(players).sort((a,b) => b.score - a.score);
    const lb = sorted.slice(0, 5).map(p => ({nickname: p.nickname, score: Math.floor(p.score)}));
    
    sorted.forEach((p, i) => {
        io.to(p.id).emit('gameState', { 
            players, 
            leaderboard: lb,
            myRank: i + 1,
            totalPlayers: sorted.length
        });
    });
}, 33);

http.listen(3000, () => console.log('Server Start: 3000'));