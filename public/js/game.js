var config = {
    type: Phaser.AUTO,
    parent: "phaser-example",
    width: 800,
    height: 600,
    physics: {
        default: "arcade",
        arcade: {
            debug: false,
            gravity: {y: 0},
        },
    },
    scene: {
        preload: preload,
        create: create,
        update: update,
    },
};

var projectileId = 0;
var game = new Phaser.Game(config);

function preload() {
    this.load.image("ship", "assets/spaceShips_001.png");
    this.load.image("otherPlayer", "assets/enemyBlack5.png");
    this.load.image("projectile", "assets/purple_ball.png")
}

function create() {
    var self = this;
    this.socket = io();
    this.otherPlayers = this.physics.add.group();
    this.otherProjectiles = this.physics.add.group();
    this.projectiles = this.physics.add.group()
    this.socket.on("currentPlayers", function (players) {
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                addPlayer(self, players[id]);
            } else {
                addOtherPlayers(self, players[id]);
            }
        });
    });
    // this.socket.on("currentProjectiles", function (projectiles){
    //   //   Object.keys(projectiles).forEach(function (id) {
    //   //       addOtherProjectiles(self, projectiles[id]);
    //   //   });
    //   // })
    this.socket.on("newPlayer", function (playerInfo) {
        console.log("new player added!")
        addOtherPlayers(self, playerInfo);
    });
    this.socket.on("newProjectile", function (projectileInfo) {
        console.log("new projectile added!")
        addOtherProjectiles(self, projectileInfo);
    });
    this.socket.on("disconnect", function (playerId) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerId === otherPlayer.playerId) {
                otherPlayer.destroy();
            }
        });
    });
    this.socket.on("playerMoved", function (playerInfo) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerInfo.playerId === otherPlayer.playerId) {
                otherPlayer.setRotation(playerInfo.rotation);
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
            }
        });
    });
    this.socket.on("projectileMoved", function (projectileInfo) {
        self.otherProjectiles.getChildren().forEach(function (otherProjectile) {
            if (projectileInfo.projectileId === otherProjectile.projectileId) {
                otherProjectile.setRotation(projectileInfo.rotation);
                otherProjectile.setPosition(projectileInfo.x, projectileInfo.y);
            }
        });
    });

    this.blueScoreText = this.add.text(16, 16, "", {
        fontSize: "32px",
        fill: "#0000FF",
    });
    this.redScoreText = this.add.text(584, 16, "", {
        fontSize: "32px",
        fill: "#FF0000",
    });

    this.socket.on("scoreUpdate", function (scores) {
        console.log("receive scoreUpdate");
        self.blueScoreText.setText("Blue: " + scores.blue);
        self.redScoreText.setText("Red: " + scores.red);
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceBar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.lastFired = 0;
    this.respawnTimer = [];


}

function update(time) {
    var self = this;
    if (this.ship) {
        // emit player movement
        var x = this.ship.x;
        var y = this.ship.y;
        var r = this.ship.rotation;
        if (
            this.ship.oldPosition &&
            (x !== this.ship.oldPosition.x ||
                y !== this.ship.oldPosition.y ||
                r !== this.ship.oldPosition.rotation)
        ) {
            this.socket.emit("playerMovement", {
                x: this.ship.x,
                y: this.ship.y,
                rotation: this.ship.rotation,
            });
        }

        // save old position data
        this.ship.oldPosition = {
            x: this.ship.x,
            y: this.ship.y,
            rotation: this.ship.rotation,
        };

        if (this.cursors.left.isDown) {
            this.ship.setAngularVelocity(-150);
        } else if (this.cursors.right.isDown) {
            this.ship.setAngularVelocity(150);
        } else {
            this.ship.setAngularVelocity(0);
        }

        if (this.cursors.up.isDown) {
            this.physics.velocityFromRotation(
                this.ship.rotation + 1.5,
                100,
                this.ship.body.acceleration
            );
        } else {
            this.ship.setAcceleration(0);
        }

        // if spacebar hold down, we shoot projectile
        if (this.spaceBar.isDown) {
            if (time - this.lastFired > 500) {
                addProjectile(self, this.ship.x, this.ship.y, this.ship.rotation);
                console.log("creating projectile");
                this.socket.emit("createProjectile", {
                    x: this.projectile.x,
                    y: this.projectile.y,
                    rotation: this.projectile.rotation,
                    projectileId: this.projectile.projectileId
                });
                this.physics.velocityFromRotation(
                    this.projectile.rotation + 1.5,
                    500,
                    this.projectile.body.acceleration
                );
                this.lastFired = time;
            }
        }

        // handle projectile physics here and send it to the server
        this.projectiles.getChildren().forEach(function (projectile) {
            if (!(projectile.x >= 820 || projectile.x < -20) && !(projectile.y >= 620 || projectile.y < -20)) {
                self.socket.emit("projectileMovement", {
                    x: projectile.x,
                    y: projectile.y,
                    rotation: projectile.rotation,
                    projectileId: projectile.projectileId
                });
            }
            else{
                projectile.destroy();
                console.log("Destroyed projectile");
                self.projectiles.remove(projectile);
            }
        });


        // check if ship hits a projectile, only if ship is alive
        this.otherProjectiles.getChildren().forEach(function (projectile){
            if (!(projectile.x >= 800 || projectile.x < 0  || projectile.y >= 800 || projectile.y < 0)) {
                if (self.ship.alpha === 1) {
                    if ((Math.abs(self.ship.x - projectile.x) <= 30) && (Math.abs(self.ship.y - projectile.y) <= 30)) {
                        console.log("Ship explode");
                        self.socket.emit("shipExploded");
                        self.ship.alpha = 0.5;
                        self.respawnTimer[self.ship.playerId] = time;
                    }
                }
            }
            else {
                console.log("Destroyed projectile");
                projectile.destroy();
                self.otherProjectiles.remove(projectile);
                }
        });

        // If ship is dead, respawn when 2.5s is up.
        if (self.ship.alpha === 0.5){
            // console.log(time);
            // console.log(self.respawnTimer);
            if (time - self.respawnTimer[self.ship.playerId] > 2500){
                console.log("Respawn");
                self.ship.alpha = 1.0;
            }
        }

        this.socket.on("shipExploded", function (socketId){
            self.otherPlayers.getChildren().forEach(function (otherPlayer) {
                if (otherPlayer.playerId === socketId) {
                    otherPlayer.alpha = 0.5;
                    self.respawnTimer[socketId] = time;
                }
            });
        });

        // render other ships alpha to 1 when time is up.
        this.otherPlayers.getChildren().forEach(function (player){
            if (player.alpha === 0.5){
                if (time - self.respawnTimer[player.playerId] > 2500){
                    console.log("Respawn other player");
                    player.alpha = 1.0;
                }
            }
        })
    }
}

function addPlayer(self, playerInfo) {
    self.ship = self.physics.add
        .image(playerInfo.x, playerInfo.y, "ship")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(53, 40);
    if (playerInfo.team === "blue") {
        self.ship.setTint(0x0000ff);
    } else {
        self.ship.setTint(0xff0000);
    }
    self.ship.setDrag(100);
    self.ship.setAngularDrag(100);
    self.ship.setMaxVelocity(200);
    self.ship.setCollideWorldBounds(true);
}

function addOtherPlayers(self, playerInfo) {
    const otherPlayer = self.add
        .sprite(playerInfo.x, playerInfo.y, "otherPlayer")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(53, 40);
    if (playerInfo.team === "blue") {
        otherPlayer.setTint(0x0000ff);
    } else {
        otherPlayer.setTint(0xff0000);
    }
    otherPlayer.playerId = playerInfo.playerId;
    self.otherPlayers.add(otherPlayer);
}

// this function adds our own projectile
function addProjectile(self, playerX, playerY, playerRotation) {
    self.projectile = self.physics.add
        .image(playerX, playerY, "projectile")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(20, 20);
    self.projectile.setDrag(0);
    self.projectile.setAngularDrag(0);
    self.projectile.rotation = playerRotation;
    self.projectile.setMaxVelocity(500);
    self.projectile.projectileId = projectileId;
    self.projectile.setCollideWorldBounds(true);
    self.projectile.body.onWorldBounds = true;
    self.projectile.body.world.on('worldbounds', function(body) {
        if (body.gameObject === this) {
            this.destroy();
            self.projectiles.remove(self.projectile);
        }
    }, self.projectile);
    projectileId = projectileId + 1;
    self.projectiles.add(self.projectile);
    // if (playerInfo.team === "blue") {
    //   self.ship.setTint(0x0000ff);
    // } else {
    //   self.ship.setTint(0xff0000);
    // }
    // self.ship.setDrag(100);
    // self.ship.setAngularDrag(100);
    // self.ship.setMaxVelocity(200);
}

// this function renderers enemy projectiles
function addOtherProjectiles(self, projectileInfo) {
    const otherProjectile = self.add
        .sprite(projectileInfo.x, projectileInfo.y, "projectile")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(20, 20);
    otherProjectile.setTint(0x0000ff);
    otherProjectile.projectileId = projectileInfo.projectileId;
    self.otherProjectiles.add(otherProjectile);
}
