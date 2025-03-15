<div align="center">
<h1>Lost City - May 18, 2004</h1>
</div>

> [!NOTE]
> Learn about our history and ethos on our forum: https://lostcity.rs/t/faq-what-is-lost-city/16

## Getting Started

> [!IMPORTANT]
> If you run into issues please see our [common issues](#common-issues).

1. Download and extract this repo somewhere on your computer
2. Install our [dependencies](#environment-dependencies)
3. Open the folder you downloaded: **Run the quickstart script and follow the on-screen prompts.** You may disregard any severity warnings you see

Once your setup process has completed, wait for it to tell you the world has started before trying to play.

The server includes its own webclient, so you don't have to download a client!

## Dependencies

- [NodeJS 22](https://nodejs.org/)
- [Java 17](https://adoptium.net/) - later LTS versions are also fine.

> [!TIP]
> If you're using VS Code (recommended), [we have an extension to install on the marketplace.](https://marketplace.visualstudio.com/items?itemName=2004scape.runescriptlanguage)

## Workflow

Content developers should run `npm start`. The server will watch for changes to scripts and configs, then automatically repack everything.

Engine developers should run `npm run dev`. This does what `npm start` does above, but also completely restarts the server when engine code has changed.

## Common Issues

* `bad option: --import`  
You are using an older version of Node. Reinstall and re-run.

* `'"java"' is not recognized as an internal or external command`  
You do not have Java installed.

* `has been compiled by a more recent version of the Java Runtime (class file version 61.0), this version of the Java Runtime only recognizes class file versions up to 52.0`  
You are using Java 8 or Java 11. If you have multiple java versions, you are now an "advanced user," go ahead and set `JAVA_PATH=path-to-java.exe` in your .env file.

# NPC Spawning and AI Behavior in the Game Engine

## NPC Spawning Overview

After analyzing the codebase, here's how NPCs are typically handled:

1. **Permanent NPCs** are defined in map data files (`.jm2`) and loaded during server startup through the `GameMap.loadNpcs()` method. These NPCs include shopkeepers, quest NPCs, and standard monsters in their typical locations.
2. **Dynamic NPCs** are spawned using the `npc_add` function in RS2 scripts. These NPCs are temporary and used in specific game events like:
   - Quest-specific NPCs appearing only at certain stages
   - Combat encounters triggered by player actions
   - Random events
3. **Best practice for adding permanent NPCs:**
   - Modify the appropriate map data file
   - Use the server's build process to compile the map data
   - Let the game load it naturally during initialization

### Issues with Player-Triggered NPC Spawning

The login-based approach to spawning NPCs has several drawbacks:
- It relies on a player logging in to trigger the spawn
- Uses a global variable (`%lumbridge_demon_spawned`), which may reset during server operations
- It’s inconsistent with how other permanent NPCs are defined

For a quick test, spawning NPCs via player login works, but for proper implementation, adding them to the map data is the correct method.

---

## Skill System: Player and AI Interactions

### How Players Perform Skills

1. The `Player` class in TypeScript tracks player state, including skills and actions.
2. `ScriptRunner` bridges TypeScript and RuneScript:
   - Executes RuneScript code from TypeScript via `ScriptRunner.execute()`
   - Players trigger scripts with `player.executeScript()` or `player.enqueueScript()`
3. **Example: Woodcutting Mechanics**
   - RuneScript files (`.rs2`) in `data/src/scripts/skill_woodcutting/`
   - A player clicks a tree, triggering an `OPLOC` event
   - The event runs a RuneScript that:
     - Checks skill level requirements
     - Verifies the player has an axe
     - Calculates success chance
     - Awards XP and adds logs to inventory
     - Handles tree depletion and respawn
4. **Communication Flow:**
   - TypeScript (`Player actions`) → `ScriptRunner` → RuneScript (`skill logic`) → `ScriptRunner` → TypeScript (`state updates`)

### How AI Bots Can Use the Skill System

To make an AI bot perform skills like woodcutting, mining, or fishing, simulate the same interactions a human player would:

```typescript
// Find a resource node in the world (tree, rock, or fishing spot)
const resource = World.getObj(resourceId, resourceX, resourceY, resourceLevel);

// Set interaction with the resource (first option/click)
aiPlayer.setInteraction({
  type: Interaction.ENGINE,
  triggerType: ServerTriggerType.APOBJ1,
  obj: resource
});

// Set opcalled flag to true
aioPlayer.opcalled = true;
```

This leverages existing RuneScript mechanics, ensuring the AI:
- Checks for the necessary tool in inventory/equipment (axe, pickaxe, fishing net, etc.)
- Verifies skill level requirements
- Plays animations
- Gains XP and collects resources

---

## **ServerTriggerType Explained**

### Key Categories

| Category | Description | Example Values |
|----------|------------|---------------|
| Object Interactions | Click actions on world objects like trees, rocks, doors | `OPLOC1`, `OPLOC2`, `AI_OPLOC1` |
| NPC Interactions | Clicking on NPCs (fishing, talking, attacking) | `OPNPC1`, `AI_OPNPC1` |
| Player Interactions | Clicking on other players (trading, dueling, PvP) | `OPPLAYER1`, `AI_OPPLAYER1` |
| Item Interactions | Clicking inventory items | `OPHELD1`, `OPHELD2` |
| Interface Actions | Clicking UI buttons | `IF_BUTTON`, `IF_CLOSE` |
| AI-Specific Actions | AI-controlled events like walking, timers | `AI_WALKTRIGGER`, `AI_TIMER`, `AI_QUEUE1` |

### Most Important for AI Bots

- **`AI_OPLOC1`**: AI "clicks" a world object (like a tree)
- **`AI_OPNPC1`**: AI interacts with an NPC (like a fishing spot)
- **`AI_WALKTRIGGER`**: AI movement trigger
- **`AI_TIMER`**: AI scheduled event trigger

---

## **World Class Overview**

### Responsibilities of `World`

- Manages **players, NPCs, and objects** in the game world
- Handles **player login/logout**
- Processes **game ticks, movement, and AI behaviors**
- Stores global **game state and inventory tracking**
- Manages **pathfinding for NPC movement**, ensuring smooth navigation and interaction

### Key Methods in `World`

| Method | Purpose |
|--------|---------|
| `addNpc(npc, duration, firstSpawn)` | Spawns a new NPC in the world and initializes pathfinding if required |
| `removeNpc(npc, duration)` | Removes an NPC from the world and updates pathing data accordingly |
| `addPlayer(player)` | Adds a player to the game world |
| `removePlayer(player)` | Removes a player from the world |
| `trackZone(tick, zone)` | Tracks active zones for updates, including NPC movement changes |
| `getPlayer(username)` | Retrieves a player by username |
| `getNpc(nid)` | Retrieves an NPC by ID |
| `enqueueScript(script, delay)` | Runs a script after a delay, often used for AI behavior and NPC path updates |

### Pathfinding Integration

The `World` class interacts with the pathfinding system by:
- Assigning **movement strategies** to NPCs based on their behavior type (roaming, following, guarding, etc.)
- Utilizing **zone tracking** to optimize movement updates for nearby players and NPCs
- Updating **collision flags** dynamically to prevent NPCs from getting stuck or blocking key paths
- Synchronizing **game ticks** with pathfinding recalculations for smooth transitions and AI responsiveness

---

## **Extra Methods from PathingEntity**

### Movement & Pathfinding

`processMovement()`, `queueWaypoint(x, z)`, `queueWaypoints()`, `clearWaypoints()`, `teleJump()`, `teleport()`, `validateDistanceWalked()`

### Interactions & Targeting

`setInteraction()`, `clearInteraction()`, `focus()`, `unfocus()`, `reorient()`, `pathToMoveClick()`, `pathToPathingTarget()`, `pathToTarget()`

### Pathfinding & Collision

`blockWalkFlag()`, `defaultMoveSpeed()`, `refreshZonePresence()`, `validateAndAdvanceStep()`, `takeStep()`, `hasWaypoints()`, `isLastOrNoWaypoint()`

### Targeting & Combat

`inOperableDistance()`, `inApproachDistance()`

---

✅ AI bots can now move intelligently, interact with the world, and perform skills using existing game mechanics.

🚀 The `World` class efficiently manages NPCs, players, and AI behavior, ensuring seamless game functionality while integrating with the pathfinding system.

