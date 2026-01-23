const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {};
let foods = [];
const WORLD_SIZE = 3000;
const MAX_FOODS = 150;

function spawnFood() {
    while (foods.length < MAX_FOODS) {
        const rand = Math.random();
        let scoreBonus, sizeBonus, color, radius;
        if (rand < 0.7) { 
            scoreBonus = 1; sizeBonus = 1.2; color = '#ffdf11'; radius = 8;
        } else if (rand < 0.9) { 
            scoreBonus = 3; sizeBonus = 3.5; color = '#3498db'; radius = 13;
        } else { 
            scoreBonus = 8; sizeBonus = 8.0; color = '#e74c3c'; radius = 20;
        }
        foods.push({
            id: Math.random().toString(36).substr(2, 9),
            x: Math.random() * WORLD_SIZE, y: Math.random() * WORLD_SIZE,
            color, scoreBonus, sizeBonus, radius
        });
    }
}
spawnFood();

function updateLeaderboard() {
    const leaderboard = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(p => ({ nickname: p.nickname, score: p.score }));
    io.emit('updateLeaderboard', leaderboard);
}

io.on('connection', (socket) => {
    socket.on('join', (nickname) => {
        players[socket.id] = {
            id: socket.id,
            x: Math.random() * (WORLD_SIZE - 200) + 100,
            y: Math.random() * (WORLD_SIZE - 200) + 100,
            nickname: nickname.substring(0, 10) || "Player",
            score: 5, radius: 25,
            color: `hsl(${Math.random() * 360}, 75%, 55%)`
        };
        socket.emit('initFood', foods);
        io.emit('updatePlayers', players);
        updateLeaderboard();
    });

    socket.on('move', (data) => {
        const p = players[socket.id];
        if (p) {
            p.x = data.x; p.y = data.y;
            let eaten = false;
            foods.forEach((food, index) => {
                if (Math.hypot(p.x - food.x, p.y - food.y) < p.radius + food.radius) { 
                    p.score += food.scoreBonus;
                    p.radius += food.sizeBonus;
                    foods.splice(index, 1);
                    eaten = true;
                }
            });
            if (eaten) {
                spawnFood();
                io.emit('updateFood', foods);
                io.emit('updatePlayers', players); // 모든 유저에게 즉시 크기/점수 갱신
                updateLeaderboard();
            }
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    socket.on('shoot', (data) => {
        const p = players[socket.id];
        if (p && p.score > 1) {
            p.score -= 1;
            p.radius = Math.max(25, p.radius - 0.5);
            io.emit('enemyShoot', { ...data, ownerId: socket.id, color: p.color });
            io.emit('updatePlayers', players);
            updateLeaderboard();
        }
    });

    socket.on('hit', (targetId) => {
        if (players[targetId] && players[socket.id]) {
            players[targetId].score = Math.max(1, players[targetId].score - 3);
            players[targetId].radius = Math.max(25, players[targetId].radius - 4);
            players[socket.id].score += 5;
            players[socket.id].radius += 3.5;
            io.emit('updatePlayers', players);
            updateLeaderboard();
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

http.listen(3000, () => console.log('Game Server Ready: Port 3000'));