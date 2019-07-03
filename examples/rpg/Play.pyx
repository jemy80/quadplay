Play
============================================================================

const shopKeeperPos = xy(300, 139)

// Layer indices for the map
const BASE = 0
const WALL = 1
const COLLECTABLE = 3

const WATER_SPRITES = []
const ANIMATE_WATER = []
const ANIMATE_LIGHTS = []

const castleSprite = castleMap.spritesheetTable["dawnlike-level-16x16"]

let lastBumped = 0

// Make the water animate
for 13 ≤ y ≤ 23:
   const w = castleSprite[32][y]
   push(WATER_SPRITES, w); push(ANIMATE_WATER, w, castleSprite[33][y])

// Portal and candelabra
push(ANIMATE_LIGHTS,
     castleSprite[43][27], castleSprite[44][27],
     castleSprite[42][24], castleSprite[42][25])

// Don't play the bump into a wall sound too often
def hitWall():
   if lastBumped < modeFrames - 20:
      playAudioClip(bumpSound)
      lastBumped = modeFrames


def updatePlayer(P, input):
   with dir, pos, sprite, spriteSheet ∈ P:

      // Set the change in x and y
      let Δx = input.x
      let Δy = input.y
      const footOffset = 6
      
      // Check for collisions at the base of the sprite and then move
      if getMapSpriteByDrawCoord(castleMap, pos + xy(4 Δx, footOffset), WALL):
         hitWall()
      else:
         pos.x += Δx
         
      if getMapSpriteByDrawCoord(castleMap, pos + xy(0, 2 Δy + footOffset), WALL):
         hitWall()
      else:
         pos.y += Δy

      // Animation frame (zeroed when not moving)
      let f = loop(⌊⅙ modeFrames⌋, 4)

      // Change direction if moving, giving preference to x over y
      if Δx < 0:
         dir = 1
      else if Δx > 0:
         dir = 2
      else if Δy < 0:
         dir = 3
      else if Δy > 0:
         dir = 0
      else:
         // don't change direction or animate when not moving
         f = 0

      // See if we've picked anything up
      let item = getMapSpriteByDrawCoord(castleMap, pos, COLLECTABLE)
      if item:
         // Remove from map
         setMapSpriteByDrawCoord(castleMap, pos, ∅, COLLECTABLE)
         // Add to inventory
         push(P.inventory, item)
         playAudioClip(pickupSound)

      sprite = spriteSheet[f][dir]

      
enter
────────────────────────────────────────────────────────────────────────────
lastBumped = 0
player = makeEntity({sprite:playerSprite[0][0], spriteSheet:playerSprite, inventory:[], dir:1, pos:xy(128, 128), z:3.5})

frame
────────────────────────────────────────────────────────────────────────────
// Replace animated sprites half of the time
let animate = []
if loop(modeFrames, 80) < 40: extend(animate, ANIMATE_WATER)
if loop(modeFrames, 30) < 15: extend(animate, ANIMATE_LIGHTS)

// Shopkeeper
drawSprite(npcSprite[16][10 + loop(floor(modeFrames / 20), 2)], shopKeeperPos, nil, nil, nil, 0.5)
if magnitude(shopKeeperPos - player.pos) < 32:
   drawSpriteRect(dialogueSprite[4][1], shopKeeperPos - xy(27, 19), xy(31, 7), 8)
   drawText(smallFont, "Press ⓒ", shopKeeperPos - xy(12, 16), #000, nil, nil, 0, 0, 8)
   if joy.cc: pushMode(Shop, "Press ⓒ")

drawMap(castleMap, ∅, ∅, animate)
updatePlayer(player, pad[0])
drawEntity(player)

// Mode transitions
if joy.pp: pushMode(Inventory, "Press ⓟ")
for P ∈ pad: if P.qq: pushMode(Pause, "Press ⓠ")
if find(WATER_SPRITES, getMapSpriteByDrawCoord(castleMap, player.pos, BASE)) != ∅: setMode(GameOver, "Drown")
if size(player.inventory) > 3: setMode(Win, "Collect all items")

