import MoveSpeed from '#/engine/entity/MoveSpeed.js';
import Player from '#/engine/entity/Player.js';
import World from '#/engine/World.js';
import LoggerEventType from '#/server/logger/LoggerEventType.js';
import { printInfo, printError } from '#/util/Logger.js';

export default class AIPlayer extends Player {
    /** Whether this AI player is active in the world */
    public active: boolean = false;
  
    /** Movement coordinates */
    public spawnX: number = 22;
    public spawnZ: number = 22;
    public targetX: number = 29;
    public targetZ: number = 19;

    /** Movement state tracking */
    public movingToTarget: boolean = true;
  
    /** Movement timer */
    private moveInterval: any = null;
  
    /** Heartbeat timer to prevent idle timeout */
    private heartbeatInterval: any = null;
  
    /** Timer for movement intervals */
    public moveTimer: number = 0;
    public readonly MOVE_INTERVAL: number = 3; // Ticks between movements

    /**
   * Create a new AI player at the specified coordinates
   * @param username The username for this AI player
   * @param x The x coordinate to spawn the AI at
   * @param z The z coordinate to spawn the AI at
   * @param level The level to spawn the AI at (default: 0 for ground level)
   */
    constructor(username: string, x: number, z: number, level: number = 0) {
        printInfo(`AIPlayer: Creating AI player "${username}" at coordinates (${x}, ${z}, ${level})`);
    
        // Calculate proper username hashes using static methods
        const username37 = AIPlayer.calculateUsername37(username);
        const hash64 = AIPlayer.calculateHash64(username);
    
        // Call Player constructor
        super(username, username37, hash64);
    
        // Override coordinates with our specified values
        this.x = x;
        this.z = z;
        this.level = level;
    
        printInfo(`AIPlayer: Set current coordinates for "${username}" to (${this.x}, ${this.z}, ${this.level})`);
    
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
   * Start a movement cycle that walks between two points
   * This movement is visually important but the heartbeat is what actually prevents logout
   */
    public startMovementCycle(): void {
        printInfo(`AIPlayer: Starting movement cycle for "${this.username}"`);
    
        // Initialize and start the movement
        this.moveToNextPoint();
    
        // Set up interval to continue moving every 5 seconds
        this.moveInterval = setInterval(() => {
            if (this.active && this.isActive) {
                // Toggle direction
                this.movingToTarget = !this.movingToTarget;
                this.moveToNextPoint();
        
                // Update lastResponse during movement as a backup
                this.lastResponse = World.currentTick;
            } else {
                // Clean up if player is no longer active
                if (this.moveInterval) {
                    clearInterval(this.moveInterval);
                    this.moveInterval = null;
                }
            }
        }, 5000);
    }
  
    /**
   * Move to the next point based on current direction
   */
    private moveToNextPoint(): void {
        if (!this.active || !this.isActive) {
            return;
        }
    
        try {
            // Determine which point to move to
            const nextX = this.movingToTarget ? this.targetX : this.spawnX;
            const nextZ = this.movingToTarget ? this.targetZ : this.spawnZ;
      
            // Clear any existing movement queue
            this.clearWaypoints();
      
            // Queue the new waypoint and set walking speed
            this.queueWaypoint(nextX, nextZ);
            this.moveSpeed = MoveSpeed.WALK;
      
            // Log the movement
            printInfo(`AIPlayer: "${this.username}" moving to (${nextX}, ${nextZ})`);
      
            // Keep the player active by updating lastResponse
            this.lastResponse = World.currentTick;
        } catch (err) {
            printError(`AIPlayer: Error during movement for "${this.username}": ${err}`);
        }
    }
  
    /**
   * Start a heartbeat to prevent the AI player from timing out
   * This updates lastResponse frequently to avoid timeout detection
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
    
        // Create a new heartbeat interval that runs every second
        this.heartbeatInterval = setInterval(() => {
            if (this.active && this.isActive) {
                // IMPORTANT: Update both connection timestamps
                this.lastResponse = World.currentTick;
                this.lastConnected = World.currentTick;
        
                // Reset logout flags to prevent automatic logout
                this.requestLogout = false;
                this.requestIdleLogout = false;
                this.loggingOut = false;
        
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
        }, 500); // Run every 500ms (twice per second) for reliability
    
        // Start the extra keepalive on a separate timer
        this.startKeepalive();
    }
  
    /** Direct keepalive timer */
    private keepaliveInterval: any = null;
  
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
}