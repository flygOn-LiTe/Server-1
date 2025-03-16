/* eslint-disable import/order */
// World needs to be imported before Player to avoid circular dependency issues
import World from '#/engine/World.js';
import MoveSpeed from '#/engine/entity/MoveSpeed.js';
import LoggerEventType from '#/server/logger/LoggerEventType.js';
import { printInfo, printError } from '#/util/Logger.js';
// Then import the actual class for implementation
import PlayerClass from '#/engine/entity/Player.js';

/**
 * AIPlayer class for simulating player behavior
 */
export default class AIPlayer extends PlayerClass {
    /** Whether this AI player is active in the world */
    public active: boolean = false;
  
    /** Movement coordinates */
    public spawnX: number = 3222;
    public spawnZ: number = 3218;
    public targetX: number = 3230;
    public targetZ: number = 3360;

    /** Movement state tracking */
    public movingToTarget: boolean = true;
    
    /** Current waypoint index in the path */
    public currentWaypointIndex: number = 0;
  
    /** Movement timer */
    private moveInterval: ReturnType<typeof setInterval> | null = null;
  
    /** Heartbeat timer to prevent idle timeout */
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  
    /** Timer for movement intervals */
    public moveTimer: number = 0;
    public readonly MOVE_INTERVAL: number = 3; // Ticks between movements

    /** Predefined waypoints for the journey */
    public readonly LUMBRIDGE_TO_VARROCK: { x: number, z: number }[] = [
        { x: 3222, z: 3222 },  
        { x: 3225, z: 3219 },  
        { x: 3228, z: 3218 },  
        { x: 3233, z: 3218 },  
        { x: 3235, z: 3225 },  
        { x: 3244, z: 3226 },  
        { x: 3257, z: 3227},
        { x: 3260, z: 3230},
        { x: 3260, z: 3236},
        { x: 3260, z: 3240},
        { x: 3256, z: 3247},
        { x: 3253, z: 3251},
        { x: 3250, z: 3255},
        { x: 3250, z: 3259},
        { x: 3250, z: 3263},
        { x: 3247, z: 3268},
        { x: 3246, z: 3272}
    ];

    public readonly VARROCK_TO_LUMBRIDGE: { x: number, z: number }[] = [
        { x: 3246, z: 3272 },
        { x: 3247, z: 3268 },
        { x: 3250, z: 3263 },
        { x: 3250, z: 3259 },
        { x: 3250, z: 3255 },
        { x: 3253, z: 3251 },
        { x: 3258, z: 3247 },
        { x: 3264, z: 3240 },
        { x: 3264, z: 3236 },
        { x: 3262, z: 3230 },
        { x: 3257, z: 3227 },
        { x: 3244, z: 3226 },
        { x: 3235, z: 3225 },
        { x: 3233, z: 3218 },
        { x: 3228, z: 3218 },
        { x: 3225, z: 3219 },
        { x: 3222, z: 3222 }
    ];
  

    /**
   * Create a new AI player at the specified coordinates
   * @param username The username for this AI player
   * @param x The x coordinate to spawn the AI at
   * @param z The z coordinate to spawn the AI at
   * @param level The level to spawn the AI at (default: 0 for ground level)
   */
    constructor(username: string, x: number = 3222, z: number = 3218, level: number = 0) {
        // Calculate proper username hashes using static methods
        const username37 = AIPlayer.calculateUsername37(username);
        const hash64 = AIPlayer.calculateHash64(username);
        
        // Call Player constructor with proper parameters
        super(username, username37, hash64);
        
        // Set coordinates
        this.x = x;
        this.z = z;
        this.level = level;
        
        // Initialize spawn and target coordinates
        this.spawnX = x;
        this.spawnZ = z;
        this.targetX = 3230; // Varrock Square X
        this.targetZ = 3360; // Varrock Square Z
        
        printInfo(`AIPlayer: Created "${username}" with spawn at (${this.spawnX}, ${this.spawnZ}) and target at (${this.targetX}, ${this.targetZ})`);
    
        // Set basic appearance and properties for the AI character
        this.gender = 0; // Male
        this.body = [0, 10, 18, 26, 33, 36, 42]; // Default male character
        this.colors = [0, 3, 2, 0, 0];
    
        // Set AI as non-web-client player
        this.webClient = false;
        this.members = true;
    
        // Initialize stats for the AI character (most start at 1)
        for (let i = 0; i < this.stats.length; i++) {
            this.stats[i] = 0;
            this.baseLevels[i] = 1;
            this.levels[i] = 1;
        }
    
        // Set hitpoints to 10 (default for new players)
        this.stats[3] = 1154; // XP for level 10
        this.baseLevels[3] = 10;
        this.levels[3] = 10;
        this.combatLevel = 3;
    
        // Set last step position for proper facing direction
        this.lastStepX = this.x - 1;
        this.lastStepZ = this.z;
    
        printInfo(`AIPlayer: Player "${username}" created successfully`);
    }
  
    /**
   * Calculate the 37-bit username hash used by the game
   */
    private static calculateUsername37(username: string): bigint {
        let hash = BigInt(0);
        const cleanName = username.toLowerCase();
    
        for (let i = 0; i < cleanName.length && i < 12; i++) {
            const char = cleanName.charCodeAt(i);
            hash *= BigInt(37);
      
            if (char >= 97 && char <= 122) {
                hash += BigInt(char - 96);
            } else if (char >= 48 && char <= 57) {
                hash += BigInt(char - 21);
            }
        }
    
        return hash;
    }

    /**
   * Calculate the 64-bit username hash used by the game
   */
    private static calculateHash64(username: string): bigint {
        let hash = BigInt(0);
        const cleanName = username.toLowerCase();
    
        for (let i = 0; i < cleanName.length && i < 12; i++) {
            const char = cleanName.charCodeAt(i);
            hash = (hash << BigInt(5)) - hash + BigInt(char);
        }
    
        return hash;
    }
  
    /**
   * Override the addSessionLog method to prevent errors with World.addSessionLog
   * This logs to the console instead of trying to use the World class's session logging
   */
    addSessionLog(event_type: LoggerEventType, message: string, ...args: string[]): void {
    // Instead of using World.addSessionLog, just log to the console
        const eventMessage = args.length ? message + ' ' + args.join(' ') : message;
    
        switch (event_type) {
            case LoggerEventType.MODERATOR:
                printInfo(`AIPlayer "${this.username}" [MOD]: ${eventMessage}`);
                break;
            case LoggerEventType.ENGINE:
                printInfo(`AIPlayer "${this.username}" [ENGINE]: ${eventMessage}`);
                break;
            case LoggerEventType.WEALTH:
                printInfo(`AIPlayer "${this.username}" [WEALTH]: ${eventMessage}`);
                break;
            case LoggerEventType.ADVENTURE:
                printInfo(`AIPlayer "${this.username}" [ADVENTURE]: ${eventMessage}`);
                break;
            default:
                printInfo(`AIPlayer "${this.username}" [LOG]: ${eventMessage}`);
        }
    }
    /**
   * Activates this AI player and adds it to the world
   */
    public activate(): boolean {
        try {
            printInfo(`AIPlayer: Activating "${this.username}"`);
      
            // Create logic similar to a player joining the world
            const pid = this.pid;
      
            if (pid === -1) {
                // Get a new player ID
                this.pid = World.getNextPid();
                printInfo(`AIPlayer: Assigned PID ${this.pid} to "${this.username}"`);
            }
      
            // Add to world if not already active
            if (!this.active) {
                World.addPlayer(this);
                this.onLogin();
                this.active = true;
        
                // Start the movement cycle
                this.startMovementCycle();
        
                // Start the heartbeat to prevent timeout
                this.startHeartbeat();
        
                printInfo(`AIPlayer: "${this.username}" activated successfully`);
                return true;
            }
      
            return false;
        } catch (err) {
            printError(`AIPlayer: Error activating "${this.username}": ${err}`);
            return false;
        }
    }
  
    /**
   * Deactivates this AI player and removes it from the world
   */
    public deactivate(): void {
        if (!this.active) {
            printInfo(`AIPlayer: Player "${this.username}" is not active, not deactivating`);
            return;
        }
    
        printInfo(`AIPlayer: Deactivating player "${this.username}"`);
    
        try {
            // Add session log directly instead of relying on World.addSessionLog
            this.addSessionLog(LoggerEventType.MODERATOR, 'Logged out');
      
            // Skip the problematic World.flushPlayer call
            // Instead just remove player from world
      
            // First remove from zone to avoid errors
            try {
                const zone = World.gameMap.getZone(this.x, this.z, this.level);
                printInfo(`AIPlayer: Removing "${this.username}" from zone (${zone.x}, ${zone.z}, ${zone.level})`);
                zone.leave(this);
            } catch (e) {
                printError(`AIPlayer: Error removing "${this.username}" from zone: ${e}`);
            }
      
            // Set inactive flags
            this.active = false;
            this.isActive = false;
      
            // Try to remove from world
            try {
                // @ts-expect-error - This is expected to call World.removePlayer but will avoid flushPlayer
                World.players.delete(this.pid);
                printInfo(`AIPlayer: Player "${this.username}" removed from World.players list`);
            } catch (e) {
                printError(`AIPlayer: Error removing "${this.username}" from World.players: ${e}`);
            }
      
            printInfo(`AIPlayer: Player "${this.username}" deactivated successfully`);
        } catch (e) {
            printError(`AIPlayer: Error during deactivation of "${this.username}": ${e}`);
        }
    }
  
    /**
   * Called when this player logs in to the game
   * Override Player's onLogin method
   */
    public onLogin(): void {
        printInfo(`AIPlayer: onLogin called for "${this.username}"`);
    
        // Set basic player state
        this.tele = true;
    
        // Reset logout state before calling parent
        this.resetLogoutState();
    
        // Call super implementation
        try {
            super.onLogin();
            printInfo(`AIPlayer: super.onLogin() completed for "${this.username}"`);
        } catch (e) {
            printError(`AIPlayer: Error in super.onLogin() for "${this.username}": ${e}`);
        }
    
        // Reset logout state again after parent call to ensure it's applied
        this.resetLogoutState();
    
        printInfo(`AIPlayer: onLogin complete for "${this.username}"`);
    }
  
    /**
   * Override network-related methods for AI players
   */
    public write(): void {
    // AI players don't need to write to client
    }
  
    public updatePlayers(): void {
    // AI players don't need client-side rendering updates
    }
  
    /**
   * Creates and spawns an AI player in Lumbridge
   */
    public static spawn(username: string, x: number, z: number): AIPlayer {
        printInfo(`AIPlayer: Creating player "${username}" in Lumbridge at (${x}, ${z})`);
        const player = new AIPlayer(username, x, z, 0);
        player.activate();
    

    
        return player;
    }
  
    /**
   * Process environmental data from the scanning to make intelligent decisions
   * @param nearbyPlayers Number of players detected nearby
   * @param nearbyNpcs Number of NPCs detected nearby
   * @param pathBlocked Whether the path is blocked
   */
    private processEnvironmentalData(nearbyPlayers: number, nearbyNpcs: number, pathBlocked: boolean): void {
        try {
            // Log the data processing
            printInfo(`AIPlayer: "${this.username}" processing environmental data: ${nearbyPlayers} players, ${nearbyNpcs} NPCs, path blocked: ${pathBlocked}`);
            
            // If path is blocked, consider alternative routes
            if (pathBlocked) {
                printInfo(`AIPlayer: "${this.username}" detected obstacle, considering route change`);
                
                // If we're stuck for too long, try skipping to the next waypoint
                if (this.stuckCounter > 10) {
                    printInfo(`AIPlayer: "${this.username}" making intelligent decision to skip current waypoint`);
                    
                    // Increment waypoint index to skip the problematic waypoint
                    this.currentWaypointIndex++;
                    
                    const currentPath = this.movingToTarget ? this.LUMBRIDGE_TO_VARROCK : this.VARROCK_TO_LUMBRIDGE;
                    
                    // Check if we've completed the path
                    if (this.currentWaypointIndex >= currentPath.length) {
                        printInfo(`AIPlayer: "${this.username}" intelligently decided to reverse direction`);
                        this.movingToTarget = !this.movingToTarget;
                        this.currentWaypointIndex = 0;
                    }
                    
                    // Reset stuck counter after making a decision
                    this.stuckCounter = 0;
                    
                    // Queue next waypoint
                    this.moveToNextWaypoint();
                    
                    return;
                }
            }
            
            // React to nearby players - in future this could include following, trading, or chatting
            if (nearbyPlayers > 0) {
                printInfo(`AIPlayer: "${this.username}" noticed ${nearbyPlayers} players nearby and is tracking them`);
                // Future enhancement: Track known players and their movements
            }
            
            // React to nearby NPCs - in future this could include combat or interaction
            if (nearbyNpcs > 0) {
                printInfo(`AIPlayer: "${this.username}" noticed ${nearbyNpcs} NPCs nearby and is monitoring them`);
                // Future enhancement: Identify hostile vs. friendly NPCs
            }
            
        } catch (err) {
            printError(`AIPlayer: Error processing environmental data for "${this.username}": ${err}`);
        }
    }

    /**
     * Scan the surrounding area for objects, locations, NPCs and other players
     * This mimics a player's awareness of their environment
     * @param radius The radius in tiles to scan around the player
     */
    public scanSurroundings(radius: number = 5): void {
        try {
            // Only scan occasionally to avoid spamming logs
            if (World.currentTick % 10 !== 0) return;
            
            printInfo(`AIPlayer: "${this.username}" scanning surroundings at (${this.x}, ${this.z}, ${this.level})`);
            
            // Scan for NPCs within range
            let npcsFound = 0;
            World.npcs.forEach(npc => {
                if (!npc) return;
                
                const distanceX = Math.abs(this.x - npc.x);
                const distanceZ = Math.abs(this.z - npc.z);
                
                if (distanceX <= radius && distanceZ <= radius) {
                    npcsFound++;
                    const distance = Math.max(distanceX, distanceZ);
                    printInfo(`AIPlayer: "${this.username}" found NPC: type=${npc.type} at (${npc.x}, ${npc.z}), distance=${distance}`);
                }
            });
            
            // Scan for other players within range
            let playersFound = 0;
            World.players.forEach(player => {
                if (!player || player.pid === this.pid) return;
                
                const distanceX = Math.abs(this.x - player.x);
                const distanceZ = Math.abs(this.z - player.z);
                
                if (distanceX <= radius && distanceZ <= radius) {
                    playersFound++;
                    const distance = Math.max(distanceX, distanceZ);
                    printInfo(`AIPlayer: "${this.username}" found player: "${player.username}" at (${player.x}, ${player.z}), distance=${distance}`);
                }
            });
            
            // Check for obstacles by analyzing our current waypoint path
            // This is a simple way to detect obstacles without using complex APIs
            const pathBlocked = !this.hasWaypoints() && this.stuckCounter > 0;
            if (pathBlocked) {
                printInfo(`AIPlayer: "${this.username}" detected obstacle - path is blocked (stuck for ${this.stuckCounter} checks)`);
            }
            
            // Print summary
            printInfo(`AIPlayer: "${this.username}" found ${npcsFound} NPCs and ${playersFound} players within range. Path blocked: ${pathBlocked}`);
            
            // Process the environmental data to make intelligent decisions
            this.processEnvironmentalData(playersFound, npcsFound, pathBlocked);
            
        } catch (err) {
            printError(`AIPlayer: Error scanning surroundings for "${this.username}": ${err}`);
        }
    }

    /**
     * Helper method to check if a position is walkable
     * @param x The x coordinate to check
     * @param z The z coordinate to check
     * @param _level The level to check (unused but kept for API consistency)
     * @returns True if the position is walkable, false otherwise
     */
    private validateStep(x: number, z: number, _level: number): boolean {
        try {
            // Simple collision check - try to find a path to the position
            // If a path exists, it's walkable
            const currentPathX = this.waypoints.length > 0 ? this.x : x;
            const currentPathZ = this.waypoints.length > 0 ? this.z : z;
            
            // Check if adjacent
            const isAdjacent = Math.abs(currentPathX - x) <= 1 && Math.abs(currentPathZ - z) <= 1;
            
            if (!isAdjacent) {
                return false; // Only allow adjacent steps
            }
            
            // Since we can't access validateAndAdvanceStep, we'll use a simplified check
            // Assume it's walkable if it's adjacent
            return true;
        } catch (_) {
            return false; // If there's an error, assume it's not walkable
        }
    }

    /**
     * Start a movement cycle that walks between two points
     * This movement is visually important but the heartbeat is what actually prevents logout
     */
    public startMovementCycle(): void {
        printInfo(`AIPlayer: Enhanced movement cycle with environmental awareness for "${this.username}"`);
        
        // Clear any existing movement timer
        if (this.moveInterval) {
            clearInterval(this.moveInterval);
            this.moveInterval = null;
        }
        
        // Initialize movement state
        this.movingToTarget = true;
        this.currentWaypointIndex = 0;
        this.stuckCounter = 0;
        
        // Keep track of last position to detect when stuck
        let lastX = this.x;
        let lastZ = this.z;
        
        // First movement - move to first waypoint
        this.moveToNextWaypoint();
        
        // Set up interval for continuous movement
        this.moveInterval = setInterval(() => {
            if (this.active && this.isActive) {
                // Scan surroundings for environmental awareness
                // This will also process the data and influence AI decisions
                this.scanSurroundings();
                
                // Log current path state for debugging
                this.logPathState();
                
                // Check if player has moved since last check
                const hasMoved = (this.x !== lastX || this.z !== lastZ);
                
                if (!hasMoved) {
                    // Increment stuck counter if we haven't moved
                    this.stuckCounter++;
                    printInfo(`AIPlayer: "${this.username}" hasn't moved in ${this.stuckCounter} checks, still at (${this.x}, ${this.z})`);
                    
                    // Notice that we don't manually handle being stuck here anymore
                    // The processEnvironmentalData method will handle that based on 
                    // our surroundings scan, which is a smarter approach
                    
                    // However, if we're severely stuck for an extended period
                    // we'll still need a failsafe mechanism
                    if (this.stuckCounter > 20) {
                        printInfo(`AIPlayer: "${this.username}" is severely stuck, applying emergency measures`);
                        
                        // Reset the entire movement state
                        this.restartMovement();
                    }
                } else {
                    // Reset stuck counter if we moved
                    if (this.stuckCounter > 0) {
                        printInfo(`AIPlayer: "${this.username}" unstuck! Moved from (${lastX}, ${lastZ}) to (${this.x}, ${this.z})`);
                    }
                    this.stuckCounter = 0;
                }
                
                // Update last position
                lastX = this.x;
                lastZ = this.z;
                
                // Check if we've reached the current waypoint
                const currentPath = this.movingToTarget ? this.LUMBRIDGE_TO_VARROCK : this.VARROCK_TO_LUMBRIDGE;
                
                if (this.currentWaypointIndex < currentPath.length) {
                    const currentTarget = currentPath[this.currentWaypointIndex];
                    
                    // If we're close enough to the current waypoint
                    if (Math.abs(this.x - currentTarget.x) <= 3 && Math.abs(this.z - currentTarget.z) <= 3) {
                        printInfo(`AIPlayer: "${this.username}" reached waypoint ${this.currentWaypointIndex} at (${currentTarget.x}, ${currentTarget.z})`);
                        
                        // Increment waypoint index
                        this.currentWaypointIndex++;
                        
                        // If we've reached the end of the path
                        if (this.currentWaypointIndex >= currentPath.length) {
                            printInfo(`AIPlayer: "${this.username}" completed path, toggling direction`);
                            
                            // Toggle direction and reset index
                            this.movingToTarget = !this.movingToTarget;
                            this.currentWaypointIndex = 0;
                        }
                        
                        // Move to the next waypoint
                        this.moveToNextWaypoint();
                    } else {
                        // If we don't have any active waypoints but haven't reached the target,
                        // something might have interrupted our movement, so try again
                        if (!this.hasWaypoints()) {
                            printInfo(`AIPlayer: "${this.username}" movement interrupted, trying again for waypoint ${this.currentWaypointIndex}`);
                            this.moveToNextWaypoint();
                        }
                    }
                } else {
                    // Invalid waypoint index, reset
                    printInfo(`AIPlayer: "${this.username}" has invalid waypoint index, resetting`);
                    this.currentWaypointIndex = 0;
                    this.moveToNextWaypoint();
                }
                
                // Keep player active
                this.forceActiveState();
            } else {
                // Clean up if player is no longer active
                if (this.moveInterval) {
                    clearInterval(this.moveInterval);
                    this.moveInterval = null;
                }
            }
        }, 3000); // Check every 3 seconds
    }
  
    /**
   * Move to the next waypoint in the current path
   */
    private moveToNextWaypoint(): void {
        try {
            const currentPath = this.movingToTarget ? this.LUMBRIDGE_TO_VARROCK : this.VARROCK_TO_LUMBRIDGE;
            
            if (this.currentWaypointIndex >= currentPath.length) {
                printInfo(`AIPlayer: "${this.username}" reached end of path, resetting`);
                this.movingToTarget = !this.movingToTarget;
                this.currentWaypointIndex = 0;
            }
            
            const waypoint = currentPath[this.currentWaypointIndex];
            
            // Calculate distance to target
            const distX = Math.abs(this.x - waypoint.x);
            const distZ = Math.abs(this.z - waypoint.z);
            const totalDistance = Math.sqrt(distX * distX + distZ * distZ);
            
            printInfo(`AIPlayer: "${this.username}" moving to waypoint ${this.currentWaypointIndex}: (${waypoint.x}, ${waypoint.z}), distance: ${totalDistance.toFixed(2)}`);
            
            // Clear previous pathfinding waypoints if any
            this.clearWaypoints();
            
            // Important: Use the normal pathfinding system instead of creating our own waypoints
            // This will respect collision detection
            if (waypoint.x !== this.x || waypoint.z !== this.z) {
                // Use the built-in pathfinding from the Player class
                // This will respect walls and other obstacles
                printInfo(`AIPlayer: "${this.username}" using pathfinding to (${waypoint.x}, ${waypoint.z})`);
                
                // Queue the waypoint through normal pathfinding which respects collisions
                this.queueWaypoint(waypoint.x, waypoint.z);
                
                // Set to walking speed for more reliable movement that respects collisions
                this.moveSpeed = MoveSpeed.WALK;
            } else {
                printInfo(`AIPlayer: "${this.username}" already at target waypoint, skipping`);
            }
            
            // Force player to be active to avoid timeout
            this.forceActiveState();
        } catch (e) {
            printError(`AIPlayer: Error in moveToNextWaypoint for "${this.username}": ${e}`);
        }
    }
  
    /**
   * Start a heartbeat to prevent the AI player from timing out
   * This updates lastResponse frequently to avoid timeout detection and forces movement processing
   */
    private startHeartbeat(): void {
        // Clear any existing heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Force initial state to be active
        this.lastResponse = World.currentTick;
        this.lastConnected = World.currentTick;
        this.requestLogout = false;
        this.requestIdleLogout = false;
        this.loggingOut = false;
        
        // Set a long timeout prevention
        this.preventLogoutUntil = World.currentTick + 10000; // Very far in the future
        
        // Create a new heartbeat interval that runs every 200ms
        this.heartbeatInterval = setInterval(() => {
            if (this.active && this.isActive) {
                // IMPORTANT: Update both connection timestamps
                this.lastResponse = World.currentTick;
                this.lastConnected = World.currentTick;
                
                // Reset logout flags to prevent automatic logout
                this.requestLogout = false;
                this.requestIdleLogout = false;
                this.loggingOut = false;
                
                // IMPORTANT: Force movement processing on each heartbeat
                // This ensures the player moves even if the game engine doesn't process them
                this.updateMovement();
                
                // Add artificial player activity by mimicking client input
                try {
                    // This mimics a client that just sent a keepalive packet
                    // This ensures that the server thinks the player is still connected
                    if (World.currentTick % 10 === 0) {
                        // Log periodic heartbeat for debugging
                        printInfo(`AIPlayer: Heartbeat keepalive for "${this.username}" at tick ${World.currentTick}`);
                    }
                } catch (err) {
                    printError(`AIPlayer: Heartbeat error for "${this.username}": ${err}`);
                }
            } else {
                // Clean up if player is no longer active
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }
            }
        }, 200); // Run more frequently (5 times per second)
        
        // Start the extra keepalive on a separate timer
        this.startKeepalive();
    }
  
    /** Direct keepalive timer */
    private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  
    /**
   * Start a separate keepalive timer that ensures the player state
   * is manually reset at regular intervals
   */
    private startKeepalive(): void {
    // Clear any existing keepalive
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }
    
        // Start a new keepalive interval (every 5 seconds)
        this.keepaliveInterval = setInterval(() => {
            if (this.active && this.isActive) {
                // Force the player state to be active
                this.forceActiveState();
            } else {
                // Clean up if player is no longer active
                if (this.keepaliveInterval) {
                    clearInterval(this.keepaliveInterval);
                    this.keepaliveInterval = null;
                }
            }
        }, 5000);
    }
  
    /**
   * Force the player state to be active (brute force approach)
   */
    private forceActiveState(): void {
    // Log every minute
        if (World.currentTick % 100 === 0) {
            printInfo(`AIPlayer: Force keepalive for "${this.username}" at tick ${World.currentTick}`);
        }
    
        // Update connection timestamps
        this.lastResponse = World.currentTick;
        this.lastConnected = World.currentTick;
    
        // Reset logout flags
        this.requestLogout = false;
        this.requestIdleLogout = false;
        this.loggingOut = false;
    
        // Prevent logout for a long time
        this.preventLogoutUntil = World.currentTick + 10000;
    }
  
    /**
   * Clean up resources when the AI player is deactivated
   */
    public cleanup(): void {
    // Clear the movement interval
        if (this.moveInterval) {
            clearInterval(this.moveInterval);
            this.moveInterval = null;
        }
    
        // Clear the heartbeat interval
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    
        // Clear the keepalive interval
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }
    
        // Call the parent cleanup method
        super.cleanup();
    }
  
    /**
   * Override logout to prevent AI players from logging out
   */
    public logout(): void {
    // Don't proceed with logout for AI players
        printInfo(`AIPlayer: "${this.username}" prevented from logging out`);
    
        // Force the player to stay active
        this.resetLogoutState();
    }

    /**
   * Override terminate to prevent AI players from being terminated
   */
    public terminate(): void {
    // Don't allow AI players to be terminated
        printInfo(`AIPlayer: "${this.username}" prevented from being terminated`);
    
        // Force the player to stay active
        this.resetLogoutState();
    }
  
    /**
   * Reset all logout-related state to prevent the player from being logged out
   */
    private resetLogoutState(): void {
    // Reset all logout flags
        this.requestLogout = false;
        this.requestIdleLogout = false;
        this.loggingOut = false;
    
        // Set a very far future time for preventLogoutUntil (1 hour from now)
        this.preventLogoutUntil = World.currentTick + 6000;
    
        // Update timestamps
        this.lastResponse = World.currentTick;
        this.lastConnected = World.currentTick;
    
        // Start/restart the heartbeat to ensure continuous activity
        this.startHeartbeat();
    }
  
    /**
   * Override the processInteraction method to update lastResponse on every movement
   */
    public processInteraction(): void {
    // Call the parent method
        super.processInteraction();
    
        // Keep the player active
        this.lastResponse = World.currentTick;
        this.lastConnected = World.currentTick;
    }

    /**
     * Override updateMovement to add debugging and ensure movement is processed
     */
    public updateMovement(): boolean {
        // Check if we have waypoints
        if (this.hasWaypoints()) {
            printInfo(`AIPlayer: "${this.username}" processing movement with waypointIndex ${this.waypointIndex}, at (${this.x},${this.z})`);
            
            // Try to get the current waypoint
            if (this.waypointIndex >= 0 && this.waypointIndex < this.waypoints.length) {
                const waypointCoord = this.waypoints[this.waypointIndex];
                const coords = {
                    level: (waypointCoord >> 28) & 0x3,
                    x: (waypointCoord >> 14) & 0x3fff,
                    z: waypointCoord & 0x3fff
                };
                printInfo(`AIPlayer: "${this.username}" current waypoint: (${coords.x}, ${coords.z})`);
            }
        }
        
        // Call the parent implementation
        const moved = super.updateMovement();
        
        // Debug the result
        if (moved) {
            printInfo(`AIPlayer: "${this.username}" moved successfully to (${this.x},${this.z})`);
        } else if (this.hasWaypoints()) {
            printInfo(`AIPlayer: "${this.username}" did not move despite having waypoints`);
        }
        
        // Force active state to prevent timeout
        this.forceActiveState();
        
        return moved;
    }

    // Add a stuckCounter property
    public stuckCounter: number = 0;

    /**
     * Override the hasWaypoints method to diagnose movement issues
     */
    public hasWaypoints(): boolean {
        const hasWaypoints = super.hasWaypoints();
        if (!hasWaypoints && this.active && this.isActive) {
            // Log this for debugging
            printInfo(`AIPlayer: "${this.username}" has no active waypoints at position (${this.x}, ${this.z})`);
        }
        return hasWaypoints;
    }

    /**
     * Queue pathfinding towards a target when stuck
     * Uses the built-in pathfinding system which respects collisions
     */
    public forceStepTowards(targetX: number, targetZ: number): void {
        printInfo(`AIPlayer: "${this.username}" requesting pathfinding from (${this.x}, ${this.z}) towards (${targetX}, ${targetZ})`);
        
        // Clear any existing waypoints
        this.clearWaypoints();
        
        // Use normal pathfinding to queue up a proper path to the target
        // This will respect collision detection
        this.queueWaypoint(targetX, targetZ);
        
        // Set to walking speed for more reliable movement
        this.moveSpeed = MoveSpeed.WALK;
        
        // Update timestamp to prevent timeout
        this.forceActiveState();
    }

    /**
     * Diagnostic method to log the current path state
     */
    public logPathState(): void {
        const currentPath = this.movingToTarget ? this.LUMBRIDGE_TO_VARROCK : this.VARROCK_TO_LUMBRIDGE;
        const totalWaypoints = currentPath.length;
        const currentWaypointIndex = this.currentWaypointIndex;
        
        if (currentWaypointIndex < currentPath.length) {
            const targetWaypoint = currentPath[currentWaypointIndex];
            const distanceX = Math.abs(this.x - targetWaypoint.x);
            const distanceZ = Math.abs(this.z - targetWaypoint.z);
            const totalDistance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
            
            printInfo(`AIPlayer: "${this.username}" path state:
                - Current position: (${this.x}, ${this.z})
                - Target waypoint: ${currentWaypointIndex}/${totalWaypoints-1} at (${targetWaypoint.x}, ${targetWaypoint.z})
                - Distance to target: ${totalDistance.toFixed(2)} tiles
                - Stuck counter: ${this.stuckCounter}
                - Has active waypoints: ${this.hasWaypoints()}
                - Moving to target: ${this.movingToTarget ? 'Lumbridge→Varrock' : 'Varrock→Lumbridge'}`);
        } else {
            printInfo(`AIPlayer: "${this.username}" invalid waypoint index: ${currentWaypointIndex}/${totalWaypoints-1}`);
        }
    }

    /**
     * Handle AI player's death event
     * Ensures proper reset of movement state after death
     */
    public handlePlayerDeath(): void {
        try {
            printInfo(`AIPlayer: "${this.username}" died, handling death event`);
            
            // Clear all waypoints to stop current movement
            this.clearWaypoints();
            
            // Reset stuck counter
            this.stuckCounter = 0;
            
            // Reset movement state
            this.currentWaypointIndex = 0;
            this.movingToTarget = true;
            
            // Let the standard player death mechanics proceed
            // Note: We don't call super.onDeath() as it may not exist in parent class
            
            // Keep player active
            this.forceActiveState();
            
            // After respawn completes, restart movement with proper collision detection
            setTimeout(() => {
                if (this.active && this.isActive) {
                    printInfo(`AIPlayer: "${this.username}" respawned, restarting movement with collision detection`);
                    this.restartMovement();
                }
            }, 5000); // Wait 5 seconds after death for respawn to complete
        } catch (err) {
            printError(`AIPlayer: Error handling death for "${this.username}": ${err}`);
        }
    }

    /**
     * Restart movement after respawn with clean state
     */
    private restartMovement(): void {
        try {
            // Clear all existing movement
            this.clearWaypoints();
            
            // Reset movement state
            this.stuckCounter = 0;
            this.currentWaypointIndex = 0;
            this.movingToTarget = true;
            
            // Set to walking speed for reliable movement
            this.moveSpeed = MoveSpeed.WALK;
            
            // Begin movement to first waypoint using collision-respecting pathfinding
            this.moveToNextWaypoint();
            
            printInfo(`AIPlayer: "${this.username}" movement restarted with collision detection`);
        } catch (err) {
            printError(`AIPlayer: Error restarting movement for "${this.username}": ${err}`);
        }
    }

    /**
     * Override applyDamage to detect death events
     */
    public applyDamage(damage: number, type: number): void {
        // Call parent method to apply the damage
        super.applyDamage(damage, type);
        
        // Check if player died from this damage
        if (this.levels[3] <= 0) {
            // Handle death event
            this.handlePlayerDeath();
        }
    }
}