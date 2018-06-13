//require statements
const express = require('express');
const hbs = require('hbs');
var app = express();
const socketIO = require('socket.io');
const http = require('http');
const bodyParser = require('body-parser');
const url = require('url');
const uniqId = require('uniqid');
var {Game} = require('../models/games');

//check game middleware
var gameCheck = ((req, res, next) => {
    //check active games
    if(req.query.id == undefined) {
        res.redirect('/');
    } else {
        next();
    }
});

//setting hbs module
app.set('view engine', 'hbs');

//connecting statics
app.use(express.static('views'));
app.use(express.static('online'));

//port
const port = process.env.PORT || 3000;

//socket.io config
var server = http.createServer(app);
var io = socketIO(server);
app.io = io;

//body parser
app.use(bodyParser.json());
var urlencodedParser = bodyParser.urlencoded({ extended: false });

//getting home page
app.get('/', (req, res) => {
    res.render('home');
});

//route for online multiplayer mode
app.get('/online', (req, res) => {
    res.render('select');
});

//route to create a room
app.get('/online/create',(req, res) => {
    res.render('create');
});

//posting room data
app.post('/online/create/redirect', urlencodedParser, (req, res) => {
    var id = uniqId();
    var game = new Game({
        gameId : id,
        host : req.body.name,
        pair : undefined
    });
    game.save().then(() => {
        console.log('room joined');
    }).catch(() => {
        console.log('error saving to db');
    });
    //fix this lol
    res.redirect(url.format({
        pathname:"/online/room/",
        query: {
            "id": id,
            "host": true
        }
    }));

    hbs.registerHelper('getRoomId', () => {
        return id;
    });
    hbs.registerHelper('getHostName', () => {
        return req.body.name;
    });
    hbs.registerHelper('fetchMsg', () => {
        return "HOST CONNECTED";
    });

    hbs.registerHelper('getP2Name', () => {
        return "Player 2 ...";
    });
});

//joining room data
app.post('/online/join/redirect', urlencodedParser, (req, res) => {
    console.log(req.body.id);
    var room = io.sockets.adapter.rooms[req.body.id];
    if(room.length < 2) {
        //get game by id
        //if found update pair and save
        //else res.send
        res.redirect(url.format({
            pathname:"/online/room/",
            query: {
                "id": req.body.id,
            },
    }));
    hbs.registerHelper('getP2Name', () => {
    return req.body.name;
    });

    hbs.registerHelper('fetchMsg', () => {
    return "P2 CONNECTED";
    });

    io.in(req.body.id).emit('p2Update', {
    name: req.body.name
    });

    io.in(req.body.id).emit('startGameBtn');
    } else {
        res.send('Sorry but it seems that the room is full.')
    }
});

//route to join a room
app.get('/online/join', (req, res) => {
    res.render('join');
});

//route to join a room
app.get('/online/room', gameCheck, (req, res) => {
    res.render('room');
    //use url module
});


//socket serverside connection
io.on('connection', (socket) => {
    console.log('User connected.');

    //join
    socket.on('join', (query) => {
        console.log(io.of('/').in(query.id).clients);
        if((io.of('/').in(query.id).clients.length) < 2) {
            socket.join(query.id);
            console.log('joined room', query.id);
        } else {
            console.log('max players exceeded');
        }
    });

    //roll request
    socket.on('requestTurnScore', (data) => {
        io.in(data.id).emit('updateTurnScore', {
            score: data.roundScore,
            turn: data.playerTurn,
            dice:data.dice
        });
    });

    //hold request
    socket.on('requestHold', (data) => {
        io.in(data.id).emit('updateHoldScore', {
            scores: data.scores,
            turn: data.playerTurn,
        });
    });

    //new game request
    socket.on('requestNew', (data) => {
        console.log('request new');
        io.in(data.id).emit('updateNew');
        io.in(data.id).emit('pairOff');
        socket.emit('startGameBtn');
    });

    //request to start game
    socket.on('hostTurnRequestFirst', (data) => {
        socket.emit('hostTurnFirst');
        io.in(data.id).emit('gameStartMessage');
    });

    //emits 0
    socket.on('zeroRequest', (data) => {
        io.in(data.id).emit('zero');
    });

    //switch color
    socket.on('switchcolor', function(data) {
        io.in(data.id).emit('switchColor');
    });

    //changes UI on turn
    socket.on('requestHostTurn', (data) => {
        socket.emit('pairOff', {
            data
        });
        socket.broadcast.to(data.id).emit('hostOn', {
            data
        });
        io.in(data.id).emit('hostTurnMessage', {
            hostName: data.hostName  
        });
    });

    //changes UI on turn
    socket.on('requestPairTurn', (data) => {
       socket.emit('hostOff', {
           data
       });
       socket.broadcast.to(data.id).emit('pairOn', {
           data
       });
       socket.emit('startBtnDisable');
       io.in(data.id).emit('pairTurnMessage', {
        pairName: data.pairName   
        });
    });

    //emits player turn
    socket.on('playerTurnVar', (data) => {
        io.in(data.id).emit('playerTurn', {
            turn:data.turn
        });
    });

    //player wins
    socket.on('playerWinRequest', (data) => {
        io.in(data.id).emit('pairOff');
        io.in(data.id).emit('playerWin', {
            name: data.name,
            turn: data.playerTurn
        });
    });

    //turn dice 1 config
    socket.on('diceOneRequest', (data) => {
        io.in(data.id).emit('diceOne');
    });

    //create game
    socket.on('createGame', () => {
        socket.emit('hostJoined', {
            
        })
    })

    //disconnect
    socket.on('disconnect', () => {
        io.in(socket.id).emit('disconnecting');
        console.log(socket.id);
        //delete room from db
    });
});

//listen
server.listen(port, () => {
    console.log(`started ${port}`);
});