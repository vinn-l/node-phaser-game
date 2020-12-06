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
    this.load.image("sky", "assets/bluemoon.png");
    this.load.image("shipWhite", "assets/spaceship.png");
    this.load.image("shipRed", "assets/spaceshipEnemy.png");
    this.load.image("projectile", "assets/purple_ball.png")
}

function create() {
    var self = this;

    this.socket = io();
    this.otherPlayers = this.physics.add.group();
    this.otherProjectiles = this.physics.add.group();
    this.projectiles = this.physics.add.group()

    // Add background image
    this.add.image(400, 300, 'sky');

    // Render current players on the field received from server when we just joined the game.
    this.socket.on("currentPlayers", function (players) {
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                addPlayer(self, players[id]);
            } else {
                addOtherPlayers(self, players[id]);
            }
        });
    });

    // Render new player ship when received from server.
    this.socket.on("newPlayer", function (playerInfo) {
        console.log("new player added!")
        addOtherPlayers(self, playerInfo);
    });

    // Render new projectile created when received from server.
    this.socket.on("newProjectile", function (projectileInfo) {
        console.log("new projectile added!")
        addOtherProjectiles(self, projectileInfo);
    });

    // Destroy ship if player disconnected
    this.socket.on("disconnect", function (playerId) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerId === otherPlayer.playerId) {
                otherPlayer.destroy();
            }
        });
    });

    // Render movement of ships when received data from server.
    this.socket.on("playerMoved", function (playerInfo) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerInfo.playerId === otherPlayer.playerId) {
                otherPlayer.setRotation(playerInfo.rotation);
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
            }
        });
    });

    // Render movement of projectiles when received data from server.
    this.socket.on("projectileMoved", function (projectileInfo) {
        self.otherProjectiles.getChildren().forEach(function (otherProjectile) {
            if (projectileInfo.projectileId === otherProjectile.projectileId) {
                otherProjectile.setRotation(projectileInfo.rotation);
                otherProjectile.setPosition(projectileInfo.x, projectileInfo.y);
            }
        });
    });

    // Text display for the scores of each team.
    this.whiteScoreText = this.add.text(16, 16, "", {
        font: 'bold 20pt Roboto',
        fill: "#FFFFFF",
    });
    this.redScoreText = this.add.text(16, 60, "", {
        // fontStyle: "Arial",
        font: 'bold 20pt Roboto',
        // fontSize: "25px",
        fill: "#FF0000"
    });

    this.socket.on("scoreUpdate", function (scores) {
        console.log("receive scoreUpdate");
        self.whiteScoreText.setText("White: " + scores.white);
        self.redScoreText.setText("Red: " + scores.red);
    });

    // Create cursors and spacebar input recognizer
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceBar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Variables for projectile firing cooldown and respawn timer.
    this.lastFired = 0;
    this.respawnTimer = [];

    // Handler for movement of own spaceship.
    this.MovementHandler = new MovementHandler(this);
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

        this.MovementHandler.handleMovement();

        // handle projectile physics here and send it to the server
        this.projectiles.getChildren().forEach(function (projectile) {
            if (!(projectile.x >= 900 || projectile.x < -100) && !(projectile.y >= 700 || projectile.y < -100)) {
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

        // CollisionHandler
        // check if ship hits a projectile, only if ship is alive
        collisionHandler(self);

        // If ship is dead, respawn when 2.5s is up.
        if (self.ship.alpha === 0.5){
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

// Handles collision between spaceship and projectile
function collisionHandler(self) {
    self.otherProjectiles.getChildren().forEach(function (projectile){
            if (self.ship.alpha === 1) {
                if ((Math.abs(self.ship.x - projectile.x) <= 30) && (Math.abs(self.ship.y - projectile.y) <= 30)) {
                    console.log("Ship explode");
                    self.socket.emit("shipExploded");
                    self.ship.alpha = 0.5;
                    self.respawnTimer[self.ship.playerId] = self.time.now;
                }
            }
    });
}

function addPlayer(self, playerInfo) {
    self.ship = playerInfo.team === "white"?
        self.physics.add
            .sprite(playerInfo.x, playerInfo.y, "shipWhite")
            .setOrigin(0.5, 0.5)
            .setDisplaySize(53, 40)
        :
        self.physics.add
            .sprite(playerInfo.x, playerInfo.y, "shipRed")
            .setOrigin(0.5, 0.5)
            .setDisplaySize(53, 40);
    self.ship.rotation = playerInfo.rotation;
    self.ship.setDrag(20);
    self.ship.setAngularDrag(20);
    self.ship.setMaxVelocity(400);
    self.ship.setCollideWorldBounds(true);
}

function addOtherPlayers(self, playerInfo) {
    const otherPlayer = playerInfo.team === "white"?
        self.add
            .sprite(playerInfo.x, playerInfo.y, "shipWhite")
            .setOrigin(0.5, 0.5)
            .setDisplaySize(53, 40)
        :
        self.add
            .sprite(playerInfo.x, playerInfo.y, "shipRed")
            .setOrigin(0.5, 0.5)
            .setDisplaySize(53, 40);
    otherPlayer.rotation = playerInfo.rotation;
    otherPlayer.playerId = playerInfo.playerId;
    self.otherPlayers.add(otherPlayer);
}

// this function adds our own projectile
function addProjectile(self, playerX, playerY, playerRotation) {
    self.projectile = self.physics.add
        .image(playerX, playerY, "projectile")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(14, 14);
    self.projectile.setDrag(0);
    self.projectile.setAngularDrag(0);
    self.projectile.rotation = playerRotation;
    self.projectile.setMaxVelocity(1000);
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
    // if (playerInfo.team === "white") {
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
        .setDisplaySize(14, 14);
    otherProjectile.projectileId = projectileInfo.projectileId;
    self.otherProjectiles.add(otherProjectile);
}

const movesets = {
    ACCELERATE_FORWARD: 'accelerate_forward',
    ROTATE_LEFT: 'rotate_left',
    ROTATE_RIGHT: 'rotate_right',
    DECELERATE_ROTATION: 'decelerate_rotation',
    DECELERATE_FORWARD: 'decelerate_forward',
    SHOOT: 'shoot'
}

class MovementHandler {
    constructor(parent) {
        this.parent = parent;
    }

    handleMovement() {
        if (this.parent.cursors.left.isDown) {
            this.performAction(movesets.ROTATE_LEFT);
        } else if (this.parent.cursors.right.isDown) {
            this.performAction(movesets.ROTATE_RIGHT);
        } else {
            this.performAction(movesets.DECELERATE_ROTATION);
        }

        if (this.parent.cursors.up.isDown) {
            this.performAction(movesets.ACCELERATE_FORWARD);
        } else {
            this.performAction(movesets.DECELERATE_FORWARD);
        }

// if spacebar hold down, we shoot projectile
        if (this.parent.spaceBar.isDown) {
            this.performAction(movesets.SHOOT);
        }
    }

    performAction(action){

        switch (action) {
            case movesets.ACCELERATE_FORWARD:
                this.parent.physics.velocityFromRotation(
                    this.parent.ship.rotation + 1.5,
                    300,
                    this.parent.ship.body.acceleration
                );
                break;
            case movesets.ROTATE_LEFT:
                this.parent.ship.setAngularVelocity(-300);
                break;
            case movesets.ROTATE_RIGHT:
                this.parent.ship.setAngularVelocity(300);
                break;
            case movesets.DECELERATE_ROTATION:
                this.parent.ship.setAngularVelocity(0);
                break;
            case movesets.DECELERATE_FORWARD:
                this.parent.ship.setAcceleration(0);
                break;
            case movesets.SHOOT:
                if (this.parent.time.now - this.parent.lastFired > 500) {
                    console.log("addProjectile")
                    addProjectile(this.parent, this.parent.ship.x, this.parent.ship.y, this.parent.ship.rotation);
                    console.log("creating projectile");
                    this.parent.socket.emit("createProjectile", {
                        x: this.parent.projectile.x,
                        y: this.parent.projectile.y,
                        rotation: this.parent.projectile.rotation,
                        projectileId: this.parent.projectile.projectileId
                    });
                    this.parent.physics.velocityFromRotation(
                        this.parent.projectile.rotation + 1.5,
                        1000,
                        this.parent.projectile.body.acceleration
                    );
                    this.parent.lastFired = this.parent.time.now;
                };
                break;
            default:
                break;
        }
    }
}