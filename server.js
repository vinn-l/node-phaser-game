/* Dependencies */
var express = require("express");
var app = express();
var server = require("http").Server(app);
var io = require("socket.io").listen(server);
var players = {};
var projectiles = [[]];
var scores = {
    white: 0,
    red: 0,
};

var alternateTeams = true;

/* Incorporate dependencies */
app.use(express.static(__dirname + "/public"));
app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});
server.listen(process.env.PORT ||8081, function () {
    console.log(`Listening on ${server.address().port}`);
});
io.on("connection", function (socket) {
    console.log("a user connected");

    // create a new player and add it to our players object
    players[socket.id] = {
        rotation: alternateTeams ? 0 : 3.14,
        x: Math.floor(Math.random() * 700) + 50,
        y: alternateTeams? Math.floor(Math.random() * 100) + 50 :  Math.floor(Math.random() * 100) + 350 + 50,
        playerId: socket.id,
        team: alternateTeams ? "red" : "white",
    };
    alternateTeams = !alternateTeams;

    // send the players object to the new player
    socket.emit("currentPlayers", players);
    // // send current projectiles to new player
    // socket.emit("currentProjectiles", projectiles);
    // send the current scores
    socket.emit("scoreUpdate", scores);

    // update all other players of the new player
    socket.broadcast.emit("newPlayer", players[socket.id]);

    socket.on("disconnect", function () {
        console.log("user disconnected");
        // remove this player from our players object
        delete players[socket.id];
        // emit a message to all players to remove this player
        io.emit("disconnect", socket.id);
        // when a player moves, update the player data
    });
    socket.on("playerMovement", function (movementData) {
        players[socket.id].x = movementData.x;
        players[socket.id].y = movementData.y;
        players[socket.id].rotation = movementData.rotation;
        // emit a message to all players about the player that moved
        socket.broadcast.emit("playerMoved", players[socket.id]);
    });
    socket.on("createProjectile", function (projectileInfo) {
        // socket.id will tell us which projectile belongs to which user
        // create a new projectile and add it to our projectiles object
        if (!projectiles[socket.id]) projectiles[socket.id] = [];
        projectiles[socket.id][projectileInfo.projectileId] = {
            rotation: 0,
            x: projectileInfo.x,
            y: projectileInfo.y,
            projectileId: projectileInfo.projectileId,
        };
        socket.broadcast.emit("newProjectile", projectiles[socket.id][projectileInfo.projectileId]);
    });

    socket.on("projectileMovement", function (projectileMovementData) {
        projectiles[socket.id][projectileMovementData.projectileId].x = projectileMovementData.x;
        projectiles[socket.id][projectileMovementData.projectileId].y = projectileMovementData.y;
        projectiles[socket.id][projectileMovementData.projectileId].rotation = projectileMovementData.rotation;
        // emit a message to all players about the projectile that moved
        socket.broadcast.emit("projectileMoved", projectiles[socket.id][projectileMovementData.projectileId])
    })

    socket.on("shipExploded", function() {
        if (players[socket.id].team === "white"){
            scores["red"] += 1;
            console.log("red + 1");

        }
        else{
            scores["white"] += 1;
            console.log("white + 1");

        }
        io.emit("shipExploded", socket.id);
        io.emit("scoreUpdate", scores);
        console.log("broadcast scoreUpdate");
    })
});
