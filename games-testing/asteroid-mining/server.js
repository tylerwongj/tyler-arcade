// Legacy standalone server - BaseGame implementation is in asteroid-mining-game.js
import express from 'express'
import { createServer } from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)

const PORT = process.env.PORT || 3004

app.use(express.static('public'))
app.use('/node_modules', express.static('../../node_modules'))

console.log('Legacy standalone server - use unified server for BaseGame integration')

// Legacy game state class for standalone mode
class AsteroidMiningGame {
  constructor() {
    this.players = []
    this.gamePhase = 'lobby'
    this.worldWidth = 1200
    this.worldHeight = 800
    this.asteroids = []
    this.collectibles = []
    this.gameTime = 300 // 5 minutes
    this.currentTime = 0
    
    this.generateAsteroids()
  }

  generateAsteroids() {
    // Generate initial asteroids
    for (let i = 0; i < 25; i++) {
      this.createAsteroid()
    }
  }

  createAsteroid() {
    const asteroid = {
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * this.worldWidth,
      y: Math.random() * this.worldHeight,
      radius: 20 + Math.random() * 30,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 2,
      velocityX: (Math.random() - 0.5) * 50,
      velocityY: (Math.random() - 0.5) * 50,
      health: 100,
      maxHealth: 100,
      resources: {
        iron: Math.floor(Math.random() * 50) + 10,
        gold: Math.floor(Math.random() * 20) + 5,
        rare: Math.floor(Math.random() * 5) + 1
      },
      type: this.getAsteroidType()
    }
    
    this.asteroids.push(asteroid)
    return asteroid
  }

  getAsteroidType() {
    const rand = Math.random()
    if (rand < 0.5) return 'iron'
    if (rand < 0.8) return 'gold'
    return 'rare'
  }

  addPlayer(socketId, playerName) {
    if (this.players.length >= 4) return false
    
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12']
    const player = {
      id: socketId,
      name: playerName,
      ship: {
        x: 100 + this.players.length * 200,
        y: 400,
        angle: 0,
        velocityX: 0,
        velocityY: 0,
        radius: 15,
        health: 100,
        maxHealth: 100,
        energy: 100,
        maxEnergy: 100,
        shield: 50,
        maxShield: 50
      },
      color: colors[this.players.length],
      inventory: {
        iron: 0,
        gold: 0,
        rare: 0
      },
      equipment: {
        drillPower: 1,
        cargoCapacity: 100,
        enginePower: 1,
        shieldGenerator: 1
      },
      score: 0,
      credits: 0
    }
    
    this.players.push(player)
    return true
  }

  removePlayer(socketId) {
    const index = this.players.findIndex(p => p.id === socketId)
    if (index !== -1) {
      this.players.splice(index, 1)
    }
  }

  startGame() {
    if (this.players.length >= 1) {
      this.gamePhase = 'playing'
      this.currentTime = 0
      return true
    }
    return false
  }

  update(deltaTime) {
    if (this.gamePhase !== 'playing') return

    this.currentTime += deltaTime
    if (this.currentTime >= this.gameTime) {
      this.gamePhase = 'ended'
      return
    }

    // Update asteroids
    this.asteroids.forEach(asteroid => {
      asteroid.x += asteroid.velocityX * deltaTime
      asteroid.y += asteroid.velocityY * deltaTime
      asteroid.rotation += asteroid.rotationSpeed * deltaTime

      // Wrap around screen
      if (asteroid.x < -asteroid.radius) asteroid.x = this.worldWidth + asteroid.radius
      if (asteroid.x > this.worldWidth + asteroid.radius) asteroid.x = -asteroid.radius
      if (asteroid.y < -asteroid.radius) asteroid.y = this.worldHeight + asteroid.radius
      if (asteroid.y > this.worldHeight + asteroid.radius) asteroid.y = -asteroid.radius
    })

    // Update players
    this.players.forEach(player => {
      const ship = player.ship
      
      // Update ship position
      ship.x += ship.velocityX * deltaTime
      ship.y += ship.velocityY * deltaTime

      // Keep ship in bounds
      ship.x = Math.max(ship.radius, Math.min(this.worldWidth - ship.radius, ship.x))
      ship.y = Math.max(ship.radius, Math.min(this.worldHeight - ship.radius, ship.y))

      // Apply friction
      ship.velocityX *= 0.98
      ship.velocityY *= 0.98

      // Regenerate energy and shield
      ship.energy = Math.min(ship.maxEnergy, ship.energy + 20 * deltaTime)
      ship.shield = Math.min(ship.maxShield, ship.shield + 10 * deltaTime)
    })

    // Check collisions
    this.checkCollisions()

    // Randomly spawn new asteroids
    if (Math.random() < 0.02 && this.asteroids.length < 30) {
      this.createAsteroid()
    }

    // Calculate scores
    this.calculateScores()
  }

  checkCollisions() {
    this.players.forEach(player => {
      const ship = player.ship
      const shipCircle = { x: ship.x, y: ship.y, radius: ship.radius }

      // Check asteroid collisions
      this.asteroids.forEach((asteroid, asteroidIndex) => {
        const asteroidCircle = { x: asteroid.x, y: asteroid.y, radius: asteroid.radius }
        
        if (CollisionDetection.circleCircleCollision(shipCircle, asteroidCircle)) {
          // Damage both ship and asteroid
          const damage = 10
          ship.health -= damage
          asteroid.health -= damage * player.equipment.drillPower

          // Push ship away
          const dx = ship.x - asteroid.x
          const dy = ship.y - asteroid.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const pushForce = 200
          
          if (distance > 0) {
            ship.velocityX += (dx / distance) * pushForce
            ship.velocityY += (dy / distance) * pushForce
          }

          // If asteroid is destroyed
          if (asteroid.health <= 0) {
            this.harvestAsteroid(player, asteroid)
            this.asteroids.splice(asteroidIndex, 1)
          }
        }
      })
    })
  }

  harvestAsteroid(player, asteroid) {
    const totalCapacity = Object.values(player.inventory).reduce((sum, val) => sum + val, 0)
    if (totalCapacity >= player.equipment.cargoCapacity) return

    // Add resources to player inventory
    Object.keys(asteroid.resources).forEach(resource => {
      const amount = Math.min(asteroid.resources[resource], 
                             player.equipment.cargoCapacity - totalCapacity)
      player.inventory[resource] += amount
    })

    // Create collectible effects
    this.createCollectible(asteroid.x, asteroid.y, asteroid.type)
  }

  createCollectible(x, y, type) {
    const collectible = {
      id: Math.random().toString(36).substr(2, 9),
      x: x,
      y: y,
      type: type,
      lifetime: 5,
      collected: false
    }
    
    this.collectibles.push(collectible)
    
    // Remove after lifetime
    setTimeout(() => {
      const index = this.collectibles.findIndex(c => c.id === collectible.id)
      if (index !== -1) {
        this.collectibles.splice(index, 1)
      }
    }, collectible.lifetime * 1000)
  }

  calculateScores() {
    this.players.forEach(player => {
      const ironValue = 1
      const goldValue = 5
      const rareValue = 20
      
      player.score = player.inventory.iron * ironValue +
                    player.inventory.gold * goldValue +
                    player.inventory.rare * rareValue
      
      player.credits = Math.floor(player.score * 0.1)
    })
  }

  processPlayerInput(socketId, input) {
    const player = this.players.find(p => p.id === socketId)
    if (!player) return

    const ship = player.ship
    const acceleration = 300 * player.equipment.enginePower

    // Movement
    if (input.thrust && ship.energy > 0) {
      const angleRad = ship.angle
      ship.velocityX += Math.cos(angleRad) * acceleration * 0.016
      ship.velocityY += Math.sin(angleRad) * acceleration * 0.016
      ship.energy -= 5 * 0.016
    }

    // Rotation
    if (input.left) {
      ship.angle -= 3 * 0.016
    }
    if (input.right) {
      ship.angle += 3 * 0.016
    }

    // Boost
    if (input.boost && ship.energy > 20) {
      const angleRad = ship.angle
      ship.velocityX += Math.cos(angleRad) * acceleration * 2 * 0.016
      ship.velocityY += Math.sin(angleRad) * acceleration * 2 * 0.016
      ship.energy -= 20 * 0.016
    }
  }

  processPlayerAction(socketId, action) {
    const player = this.players.find(p => p.id === socketId)
    if (!player) return false

    switch (action.type) {
      case 'upgrade':
        return this.upgradeEquipment(player, action.equipment)
      case 'sell':
        return this.sellResources(player, action.resource, action.amount)
    }
    return false
  }

  upgradeEquipment(player, equipmentType) {
    const costs = {
      drillPower: player.equipment.drillPower * 50,
      cargoCapacity: Math.floor(player.equipment.cargoCapacity / 20) * 30,
      enginePower: player.equipment.enginePower * 40,
      shieldGenerator: player.equipment.shieldGenerator * 60
    }

    if (player.credits >= costs[equipmentType]) {
      player.credits -= costs[equipmentType]
      
      switch (equipmentType) {
        case 'drillPower':
          player.equipment.drillPower += 0.5
          break
        case 'cargoCapacity':
          player.equipment.cargoCapacity += 20
          break
        case 'enginePower':
          player.equipment.enginePower += 0.3
          break
        case 'shieldGenerator':
          player.equipment.shieldGenerator += 0.5
          player.ship.maxShield += 25
          break
      }
      return true
    }
    return false
  }

  sellResources(player, resource, amount) {
    if (player.inventory[resource] >= amount) {
      player.inventory[resource] -= amount
      
      const prices = { iron: 2, gold: 10, rare: 50 }
      player.credits += amount * prices[resource]
      return true
    }
    return false
  }

  getGameState() {
    return {
      players: this.players,
      gamePhase: this.gamePhase,
      asteroids: this.asteroids,
      collectibles: this.collectibles,
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      currentTime: this.currentTime,
      gameTime: this.gameTime,
      timeRemaining: Math.max(0, this.gameTime - this.currentTime)
    }
  }
}

// Legacy standalone mode - game logic moved to BaseGame implementation
const gameState = new AsteroidMiningGame()

console.log('Legacy server running - for BaseGame integration, use unified server')

server.listen(PORT, () => {
  console.log(`Asteroid Mining server running on http://localhost:${PORT}`)
})