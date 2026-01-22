const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

let players = {};

io.on('connection', (socket) => {
    console.log('유저 접속:', socket.id);

    // 새 플레이어 생성
    players[socket.id] = {
        x: 1500, y: 1500,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        orbitals: 5
    };

    // 접속한 유저에게 현재 상태 전송
    io.emit('updatePlayers', players);

    // 이동 데이터 수신
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            io.emit('updatePlayers', players); // 모든 유저에게 방송
        }
    });

    // 위성 발사 데이터 중계
    socket.on('shoot', (data) => {
        io.emit('enemyShoot', { id: socket.id, ...data });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

// 기존: http.listen(3000, ...
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});