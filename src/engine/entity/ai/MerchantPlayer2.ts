/* eslint-disable import/order */
// World needs to be imported before Player to avoid circular dependency issues
import World from '#/engine/World.js';
import LoggerEventType from '#/server/logger/LoggerEventType.js';
import { printInfo, printError } from '#/util/Logger.js';
// Then import the actual class for implementation
import PlayerClass from '#/engine/entity/Player.js';
import ServerTriggerType from '#/engine/script/ServerTriggerType.js';
import IfSetText from '#/network/server/model/IfSetText.js';
import { PlayerTimerType } from '#/engine/entity/EntityTimer.js';
import ScriptRunner from '#/engine/script/ScriptRunner.js';
// Import Player directly for type use
import type Player from '#/engine/entity/Player.js';

/**
 * Interface defining a catalog item for merchants to sell
 */
interface MerchantItem {
    /** Item ID */
    id: number;
    /** Item quantity */
    count: number;
    /** Price in gold coins (item ID 995) */
    price: number;
    /** The name of the item for chat messages */
    name: string;
}

export default class MerchantPlayer2 extends PlayerClass {
    /** Whether this AI player is active in the world */
    public active: boolean = false;

    /** Movement coordinates */
    public spawnX: number = 3222;
    public spawnZ: number = 3218;
    public targetX: number = 3230;
    public targetZ: number = 3360;

    /** Heartbeat timer to prevent idle timeout */
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private _tradePartnerUid: number | null = null;
    private _tradeItems: { id: number; count: number }[] = [];
    private _itemsOffered: boolean = false;

    /** Merchant inventory */
    private _merchantInventory: MerchantItem[] = [];
    /** Currently selected item to sell */
    private _currentSellingItem: MerchantItem | null = null;
    /** Message interval for sale announcements */
    private _saleAnnouncementInterval: ReturnType<typeof setInterval> | null = null;

    /**
     * Create a new AI player at the specified coordinates
     * @param username The username for this AI player
     * @param x The x coordinate to spawn the AI at
     * @param z The z coordinate to spawn the AI at
     * @param level The level to spawn the AI at (default: 0 for ground level)
     */
    constructor(username: string, x: number, z: number, level: number = 0) {
        // Calculate proper username hashes using static methods
        const username37 = MerchantPlayer2.calculateUsername37(username);
        const hash64 = MerchantPlayer2.calculateHash64(username);

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

        // Randomize appearance and properties for the AI character
        // Random gender (0 = male, 1 = female)
        this.gender = Math.random() < 0.5 ? 0 : 1;
        
        // Set body parts based on gender
        if (this.gender === 0) { // Male
            // Valid male body parts for hair, beard, torso, arms, hands, legs, feet
            const maleHairStyles = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // Male hair styles
            const maleBeards = [10, 11, 12, 13, 14, 15, 16, 17]; // Male facial hair
            const maleTorsos = [18, 19, 20, 21, 22]; // Male torsos
            const maleArms = [26, 27, 28, 29, 30]; // Male arms
            const maleHands = [33, 34]; // Male hands
            const maleLegs = [36, 37, 38, 39, 40]; // Male legs
            const maleFeet = [42, 43, 44]; // Male feet
            
            this.body = [
                maleHairStyles[Math.floor(Math.random() * maleHairStyles.length)],
                maleBeards[Math.floor(Math.random() * maleBeards.length)],
                maleTorsos[Math.floor(Math.random() * maleTorsos.length)],
                maleArms[Math.floor(Math.random() * maleArms.length)],
                maleHands[Math.floor(Math.random() * maleHands.length)],
                maleLegs[Math.floor(Math.random() * maleLegs.length)],
                maleFeet[Math.floor(Math.random() * maleFeet.length)]
            ];
        } else { // Female
            // Valid female body parts IDs
            const femaleHairStyles = [45, 46, 47, 48, 49, 50, 51, 52, 53]; // Female hair styles
            const femaleTorsos = [56, 57, 58, 59]; // Female torsos
            const femaleArms = [61, 62, 63, 64]; // Female arms
            const femaleHands = [67, 68]; // Female hands
            const femaleLegs = [70, 71, 72, 73]; // Female legs
            const femaleFeet = [79, 80]; // Female feet
            
            this.body = [
                femaleHairStyles[Math.floor(Math.random() * femaleHairStyles.length)],
                0, // No beard for female
                femaleTorsos[Math.floor(Math.random() * femaleTorsos.length)],
                femaleArms[Math.floor(Math.random() * femaleArms.length)],
                femaleHands[Math.floor(Math.random() * femaleHands.length)],
                femaleLegs[Math.floor(Math.random() * femaleLegs.length)],
                femaleFeet[Math.floor(Math.random() * femaleFeet.length)]
            ];
        }
        
        // Randomize colors (using limited valid ranges)
        // [hair color, torso color, legs color, feet color, skin color]
        const hairColors = [0, 1, 2, 3, 4, 5, 6, 7]; // Valid hair colors
        const clothingColors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // Valid clothing colors
        const skinColors = [0, 1, 2, 3, 4, 5, 6, 7]; // Valid skin colors
        
        this.colors = [
            hairColors[Math.floor(Math.random() * hairColors.length)],
            clothingColors[Math.floor(Math.random() * clothingColors.length)],
            clothingColors[Math.floor(Math.random() * clothingColors.length)],
            clothingColors[Math.floor(Math.random() * clothingColors.length)],
            skinColors[Math.floor(Math.random() * skinColors.length)]
        ];

        // Set AI as non-web-client player
        this.webClient = false;
        this.members = true;

        // Initialize stats for the AI character with some randomness
        for (let i = 0; i < this.stats.length; i++) {
            // Random level between 1 and 20 for most skills (more reasonable range)
            const randomLevel = Math.floor(Math.random() * 20) + 1;
            // XP calculation is simplified, actual formula would be more complex
            const randomXP = Math.floor(Math.pow(randomLevel, 2.2) * 50);
            
            this.stats[i] = randomXP;
            this.baseLevels[i] = randomLevel;
            this.levels[i] = randomLevel;
        }

        // Ensure hitpoints is at least 10
        if (this.baseLevels[3] < 10) {
            this.stats[3] = 1154; // XP for level 10
            this.baseLevels[3] = 10;
            this.levels[3] = 10;
        }
        
        // Set a reasonable combat level between 3 and 30
        this.combatLevel = Math.floor(Math.random() * 28) + 3;

        // Set last step position for proper facing direction
        this.lastStepX = this.x - 1;
        this.lastStepZ = this.z;

        printInfo(`AIPlayer: Player "${username}" created successfully with gender ${this.gender === 0 ? 'male' : 'female'} and combat level ${this.combatLevel}`);

        // Equip random items to customize appearance
        this.equipRandomItems();

        // Initialize default merchant inventory
        this.initializeDefaultInventory();
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
     * Initialize default items for merchant to sell
     */
    private initializeDefaultInventory(): void {
        this._merchantInventory = [
            // Tools and equipment
            { id: 1265, count: 1, price: 150, name: 'Bronze pickaxe' },
            { id: 1351, count: 1, price: 100, name: 'Bronze axe' },
            { id: 303, count: 1, price: 80, name: 'Small fishing net' },
            { id: 590, count: 1, price: 50, name: 'Tinderbox' },
            { id: 1059, count: 1, price: 200, name: 'Leather gloves' },
            { id: 115, count: 1, price: 1000, name: 'Strength potion' },
            { id: 225, count: 1, price: 700, name: 'Limpwurt root' },
            
            // Weapons
            { id: 1277, count: 1, price: 200, name: 'Bronze sword' },
            { id: 1291, count: 1, price: 250, name: 'Bronze longsword' },
            { id: 1321, count: 1, price: 400, name: 'Bronze scimitar' },
            { id: 841, count: 1, price: 350, name: 'Shortbow' },
            { id: 882, count: 100, price: 300, name: 'Bronze arrows' },
            
            // Adamant weapons
            { id: 1287, count: 1, price: 2800, name: 'Adamant sword' },
            { id: 1301, count: 1, price: 3400, name: 'Adamant longsword' },
            { id: 1331, count: 1, price: 3800, name: 'Adamant scimitar' },
            { id: 1345, count: 1, price: 3200, name: 'Adamant warhammer' },
            { id: 1357, count: 1, price: 3000, name: 'Adamant axe' },
            { id: 1371, count: 1, price: 4200, name: 'Adamant battleaxe' },
            { id: 1430, count: 1, price: 3700, name: 'Adamant mace' },
            { id: 845, count: 1, price: 2900, name: 'Adamant dagger' },
            { id: 890, count: 100, price: 1200, name: 'Adamant arrows' },
            
            // Rune weapons
            { id: 1289, count: 1, price: 20000, name: 'Rune sword' },
            { id: 1303, count: 1, price: 25000, name: 'Rune longsword' },
            { id: 1333, count: 1, price: 30000, name: 'Rune scimitar' },
            { id: 1347, count: 1, price: 24000, name: 'Rune warhammer' },
            { id: 1359, count: 1, price: 22000, name: 'Rune axe' },
            { id: 1373, count: 1, price: 28000, name: 'Rune battleaxe' },
            { id: 1432, count: 1, price: 26000, name: 'Rune mace' },
            { id: 892, count: 100, price: 4500, name: 'Rune arrows' },
            
            // Armor
            { id: 1117, count: 1, price: 800, name: 'Bronze platebody' },
            { id: 1075, count: 1, price: 700, name: 'Bronze platelegs' },
            { id: 1155, count: 1, price: 400, name: 'Bronze full helm' },
            { id: 1173, count: 1, price: 300, name: 'Bronze sq shield' },
            { id: 1139, count: 1, price: 600, name: 'Bronze chainbody' },
            
            // Adamant armor
            { id: 1123, count: 1, price: 8000, name: 'Adamant platebody' },
            { id: 1073, count: 1, price: 6000, name: 'Adamant platelegs' },
            { id: 1161, count: 1, price: 4000, name: 'Adamant full helm' },
            { id: 1183, count: 1, price: 3600, name: 'Adamant sq shield' },
            { id: 1145, count: 1, price: 5000, name: 'Adamant chainbody' },
            { id: 1199, count: 1, price: 8200, name: 'Adamant kiteshield' },
            { id: 1091, count: 1, price: 6400, name: 'Adamant plateskirt' },
            
            // Rune armor
            { id: 1127, count: 1, price: 65000, name: 'Rune platebody' },
            { id: 1079, count: 1, price: 48000, name: 'Rune platelegs' },
            { id: 1163, count: 1, price: 32000, name: 'Rune full helm' },
            { id: 1185, count: 1, price: 28000, name: 'Rune sq shield' },
            { id: 1147, count: 1, price: 42000, name: 'Rune chainbody' },
            { id: 1201, count: 1, price: 70000, name: 'Rune kiteshield' },
            { id: 1093, count: 1, price: 46000, name: 'Rune plateskirt' },
            
            // Consumables and supplies
            { id: 315, count: 10, price: 120, name: 'Shrimps' },
            { id: 1925, count: 1, price: 30, name: 'Bucket' },
            { id: 1931, count: 1, price: 20, name: 'Pot' },
            { id: 229, count: 5, price: 100, name: 'Vials' },
            { id: 233, count: 1, price: 1200, name: 'Pestle and mortar' },
            
            // Potions and ingredients
            { id: 121, count: 1, price: 1000, name: 'Attack potion' },
            { id: 175, count: 1, price: 1100, name: 'Antipoison' },
            { id: 199, count: 1, price: 900, name: 'Prayer potion' },
            { id: 145, count: 1, price: 1300, name: 'Super attack' },
            { id: 157, count: 1, price: 1300, name: 'Super strength' },
            
            // Crafting/Magic supplies
            { id: 1755, count: 1, price: 500, name: 'Chisel' },
            { id: 1734, count: 1, price: 800, name: 'Thread' },
            { id: 1592, count: 1, price: 30, name: 'Ring mould' },
            { id: 556, count: 100, price: 400, name: 'Air runes' },
            { id: 555, count: 100, price: 400, name: 'Water runes' },
            { id: 557, count: 100, price: 400, name: 'Earth runes' },
            { id: 554, count: 100, price: 400, name: 'Fire runes' },
            
            // Mining/Smithing supplies
            { id: 440, count: 10, price: 300, name: 'Iron ore' },
            { id: 453, count: 10, price: 200, name: 'Coal' },
            { id: 2347, count: 1, price: 1000, name: 'Hammer' },
            
            // Farming/Herblore
            { id: 5341, count: 1, price: 600, name: 'Rake' },
            { id: 5343, count: 1, price: 900, name: 'Seed dibber' },
            { id: 5329, count: 1, price: 1500, name: 'Gardening trowel' },
            { id: 6055, count: 10, price: 800, name: 'Barley seeds' },
            
            // Miscellaneous
            { id: 1059, count: 1, price: 200, name: 'Leather gloves' },
            { id: 1635, count: 1, price: 500, name: 'Gold ring' },
            { id: 1731, count: 1, price: 1200, name: 'Amulet of power' },
            { id: 952, count: 1, price: 300, name: 'Spade' }
        ];
        
        // Select a random item to sell initially
        this.selectRandomItemToSell();
    }

    /**
     * Set the merchant's inventory
     */
    public setMerchantInventory(items: MerchantItem[]): void {
        this._merchantInventory = [...items];
        printInfo(`AIPlayer: "${this.username}" merchant inventory set with ${items.length} items`);
        // Re-select a random item after changing inventory
        this.selectRandomItemToSell();
    }

    /**
     * Randomly select an item from inventory to sell
     */
    private selectRandomItemToSell(): void {
        if (this._merchantInventory.length > 0) {
            const randomIndex = Math.floor(Math.random() * this._merchantInventory.length);
            this._currentSellingItem = this._merchantInventory[randomIndex];
            printInfo(`AIPlayer: "${this.username}" selected to sell: ${this._currentSellingItem.name} for ${this._currentSellingItem.price} gold`);
        } else {
            this._currentSellingItem = null;
            printInfo(`AIPlayer: "${this.username}" has no items to sell`);
        }
    }

    /**
     * Activates this AI player and adds it to the world
     */
    public activate(x: number, z: number): boolean {
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

                // Teleport to the desired location
                this.teleport(x, z, 0);
                printInfo(`AIPlayer: "${this.username}" teleported to (${this.spawnX}, ${this.spawnZ}, ${this.level})`);

                // Force refresh equipment appearance now that the player is in the world
                const WORN = 103;
                printInfo(`AIPlayer: "${this.username}" enforcing appearance update after activation`);
                this.buildAppearance(WORN);

                // Start the heartbeat to prevent timeout
                this.startHeartbeat();

                // Start sale announcements
                this.startSaleAnnouncements();

                return true;
            }

            return false;
        } catch (err) {
            printError(`AIPlayer: Error activating "${this.username}": ${err}`);
            return false;
        }
    }

    /**
     * Start periodic sale announcements
     */
    private startSaleAnnouncements(): void {
        // Clear any existing announcement interval
        if (this._saleAnnouncementInterval) {
            clearInterval(this._saleAnnouncementInterval);
        }

        // Calculate a random initial delay (between 1-5 seconds) 
        // This staggers the start time so merchants don't all announce simultaneously
        const initialDelay = Math.floor(Math.random() * 5000) + 1000;
        
        // Calculate a random interval (between 8-15 seconds)
        // This varies the frequency of announcements for each merchant
        const announcementInterval = Math.floor(Math.random() * 7000) + 8000;
        
        // Log the timing configuration
        printInfo(`AIPlayer: "${this.username}" will start announcing in ${initialDelay}ms with interval of ${announcementInterval}ms`);

        // Start with the initial delay
        setTimeout(() => {
            // Show first announcement immediately after initial delay
            if (this._currentSellingItem) {
                this.say(`Selling ${this._currentSellingItem.name} for ${this._currentSellingItem.price} gold!`);
            } else {
                this.say('Nothing to sell right now!');
            }
            
            // Then start the interval for subsequent announcements
            this._saleAnnouncementInterval = setInterval(() => {
                // Add variation to announcements
                const messages = [
                    `Selling ${this._currentSellingItem?.name} for only ${this._currentSellingItem?.price} gold!`,
                    `Get your ${this._currentSellingItem?.name} here! Just ${this._currentSellingItem?.price} gold!`,
                    `Best prices on ${this._currentSellingItem?.name}! ${this._currentSellingItem?.price} gold!`,
                    `Quality ${this._currentSellingItem?.name} for sale! ${this._currentSellingItem?.price} gold!`,
                    `Looking for ${this._currentSellingItem?.name}? Only ${this._currentSellingItem?.price} gold!`
                ];
                
                if (this._currentSellingItem) {
                    // Choose a random message from the list
                    const messageIndex = Math.floor(Math.random() * messages.length);
                    this.say(messages[messageIndex]);
                } else {
                    this.say('Nothing to sell right now!');
                }
            }, announcementInterval);
        }, initialDelay);
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

            // Clear the sale announcement interval
            if (this._saleAnnouncementInterval) {
                clearInterval(this._saleAnnouncementInterval);
                this._saleAnnouncementInterval = null;
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
    public static spawn(username: string, x: number, z: number): MerchantPlayer2 {
        printInfo(`AIPlayer: Creating player "${username}" in Lumbridge at (${x}, ${z})`);
        const player = new MerchantPlayer2(username, x, z, 0);
        player.activate(x, z);

        return player;
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

        // Clear the sale announcement interval
        if (this._saleAnnouncementInterval) {
            clearInterval(this._saleAnnouncementInterval);
            this._saleAnnouncementInterval = null;
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
     * Override the message method to intercept and handle trade requests
     * @param message The message to process
     */

    /**
     * Set items that this AI player will offer in trades
     * @param items Array of items with id and count
     */
    public setTradeItems(items: { id: number; count: number }[]): void {
        this._tradeItems = [...items];
        printInfo(`AIPlayer: "${this.username}" trade items set to ${JSON.stringify(this._tradeItems)}`);
    }

    /**
     * Equips this AI player with tradeable items for trade demonstration
     * @param _itemIds Array of item IDs to add to inventory
     */
    public async addTradeableItems(_itemIds: number[] = []): Promise<void> {
        try {
            // First, clear inventory to ensure we don't have old items
            // This is a simplified approach - a real implementation would handle inventory properly
            const INVENTORY_SLOT_COUNT = 28;
            for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                const item = this.invGetSlot(93, i);
                if (item && item.id) {
                    this.invDelSlot(93, i);
                }
            }

            // Add the current selling item to inventory
            if (this._currentSellingItem) {
                this.invAdd(93, this._currentSellingItem.id, this._currentSellingItem.count);
                printInfo(`AIPlayer: "${this.username}" added ${this._currentSellingItem.count}x item ${this._currentSellingItem.id} (${this._currentSellingItem.name}) to inventory`);
            
                // Configure the current item to be offered in trades
                this.setTradeItems([
                    { id: this._currentSellingItem.id, count: this._currentSellingItem.count }
                ]);
            } else {
                printInfo(`AIPlayer: "${this.username}" has no item selected to sell`);
            }

            // List inventory after adding items
            printInfo(`AIPlayer: "${this.username}" inventory after adding items:`);
            for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                const item = this.invGetSlot(93, i);
                if (item && item.id) {
                    printInfo(`AIPlayer: "${this.username}" has in slot ${i}: ${item.id} x ${item.count}`);
                }
            }
        } catch (err) {
            printError(`AIPlayer: Error adding tradeable items for "${this.username}": ${err}`);
        }
    }
    /**
     * Offers items for trade from AI's inventory
     */
    private async offerTradeItems(): Promise<void> {
        try {
            // Check if we've already offered items in this trade session
            if (this._itemsOffered) {
                printInfo(`[TRADE] AI "${this.username}" - OFFER: Items already offered for this trade, skipping`);
                return;
            }

            printInfo(`[TRADE] AI "${this.username}" - OFFER: *** STARTING ITEM OFFERING PROCESS ***`);

            // Track inventory items
            const INVENTORY_SLOT_COUNT = 28;
            let itemCount = 0;

            // Count items in inventory
            for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                const item = this.invGetSlot(93, i);
                if (item && item.id) {
                    itemCount++;
                }
            }
            printInfo(`[TRADE] AI "${this.username}" - OFFER: Current inventory has ${itemCount} items`);

            // If we have specific trade items set, use those
            if (this._tradeItems && this._tradeItems.length > 0) {
                printInfo(`[TRADE] AI "${this.username}" - OFFER: Using predefined trade items list (${this._tradeItems.length} items): ${JSON.stringify(this._tradeItems)}`);

                for (const item of this._tradeItems) {
                    if (item && item.id && item.count) {
                        // Find the slot for this item
                        let foundSlot = -1;
                        for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                            const invItem = this.invGetSlot(93, i);
                            if (invItem && invItem.id === item.id) {
                                foundSlot = i;
                                break;
                            }
                        }

                        if (foundSlot >= 0) {
                            // Move items to trade window (tempinv is ID 90)
                            printInfo(`[TRADE] AI "${this.username}" - OFFER: Moving item ID ${item.id} from slot ${foundSlot} to trade window`);
                            this.invMoveFromSlot(93, 90, foundSlot);
                            printInfo(`[TRADE] AI "${this.username}" - OFFER: Successfully added item ID ${item.id} x${item.count} to trade window`);
                        } else {
                            printInfo(`[TRADE] AI "${this.username}" - OFFER: Could not find item ID ${item.id} in inventory`);
                        }
                    }
                }

                printInfo(`[TRADE] AI "${this.username}" - OFFER: *** FINISHED OFFERING ITEMS ***`);
            } else {
                // Otherwise, just offer some items from inventory
                printInfo(`[TRADE] AI "${this.username}" - OFFER: No specific trade items configured, will offer from inventory`);

                // Look for tradeable items in our inventory
                let offeredItemCount = 0;

                for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                    const invItem = this.invGetSlot(93, i);
                    if (invItem && invItem.id) {
                        // Check if item is tradeable by testing a property or checking against a list
                        // For now we'll just assume all items are tradeable (in a real implementation you'd check this properly)
                        const itemId = invItem.id;
                        const stackSize = invItem.count || 1;

                        // Avoid offering too many items
                        if (offeredItemCount >= 2) break;

                        // Move the item to the trade window (tempinv is ID 90)
                        printInfo(`[TRADE] AI "${this.username}" - OFFER: Moving item ID ${itemId} from slot ${i} to trade window`);
                        this.invMoveFromSlot(93, 90, i);
                        printInfo(`[TRADE] AI "${this.username}" - OFFER: Added item ID ${itemId} x${stackSize} from slot ${i} to trade window`);
                        offeredItemCount++;
                    }
                }

                printInfo(`[TRADE] AI "${this.username}" - OFFER: *** FINISHED OFFERING ${offeredItemCount} ITEMS ***`);
            }

            // Mark that we've already offered items for this trade session
            this._itemsOffered = true;
        } catch (err) {
            printError(`[TRADE] AI "${this.username}" - OFFER: Error offering trade items: ${err}`);
        }
    }
    public messageGame(message: string): void {
        try {
            // Check for trade request messages
            if (message.includes(':tradereq:')) {
                printInfo(`AIPlayer: "${this.username}" received trade request message: ${message}`);

                // Extract username from the message
                const username = message.substring(0, message.indexOf(':'));

                // Process the trade request
                this.receiveTradeMesEvent(username);

                // Don't pass the message to the parent - we've handled it
                return;
            }

            // For other messages, pass to parent
            super.messageGame(message);
        } catch (err) {
            printError(`AIPlayer: Error handling message for "${this.username}": ${err}`);
            // Ensure parent method is still called
            super.messageGame(message);
        }
    }
    /**
     * Hook that should be called when a trade message is received from another player
     * This would typically be integrated into the game's message handling system
     * @param targetUsername The username of the player who sent the trade request
     */
    public receiveTradeMesEvent(targetUsername: string): void {
        try {
            // Find the player by username
            const targetPlayer = World.getPlayerByUsername(targetUsername);
            if (!targetPlayer) {
                printInfo(`AIPlayer: "${this.username}" received trade request from unknown player "${targetUsername}"`);
                return;
            }
            // Respond to the trade request
            this.respondToTradeRequest(targetPlayer.uid);
        } catch (err) {
            printError(`AIPlayer: Error handling trade message for "${this.username}": ${err}`);
        }
    }
    /**
     * Responds to a trade request from another player
     * @param requesterUid The unique ID of the player requesting trade
     */
    public respondToTradeRequest(requesterUid: number): void {
        try {
            const requester = World.getPlayerByUid(requesterUid);
            if (!requester) {
                return;
            }
            // Store the trade partner's UID
            this._tradePartnerUid = requesterUid;
            this.acceptTradeRequest();
        } catch (err) {
            printError(`[TRADE] AI "${this.username}" - ERROR: Trade request handling error: ${err}`);
        }
    }
    // Helper function to create a delay
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Accepts a trade request by setting up the proper interaction
     */
    private async acceptTradeRequest(): Promise<void> {
        try {
            if (!this._tradePartnerUid) {
                return;
            }

            const partner = World.getPlayerByUid(this._tradePartnerUid);
            if (!partner) {
                this._tradePartnerUid = null;
                return;
            }
            
            // Reset state for new trade
            this._itemsOffered = false;
            
            // Add the currently selected item to inventory and prepare for trade
            await this.addTradeableItems();
            
            // Set partner as target and use the proper opcode (OPPLAYER4 = trade) 
            // This is what actually opens the trade
            this.target = partner;
            this.targetOp = ServerTriggerType.OPPLAYER4;
            
            // Wait for trade window to open
            await this.delay(1500);
            
            // Offer the items for trade
            await this.offerTradeItems();
            await this.delay(500);
            
            // Check if we have an item to sell
            if (!this._currentSellingItem) {
                partner.messageGame('Sorry, I have nothing to sell right now!');
                return;
            }
            
            // Define required gold amount
            const requiredOffer = [
                { id: 995, count: this._currentSellingItem.price }
            ];

            // Inform player about the price
            partner.messageGame(`I'm selling ${this._currentSellingItem.name} for ${this._currentSellingItem.price} gold.`);

            // Start continuous trade monitoring
            let tradeAccepted = false;
            let tradeFinished = false;
            let monitorInterval: ReturnType<typeof setInterval> | null = null;
            
            // Create a monitoring interval that continuously checks the trade state
            monitorInterval = setInterval(async () => {
                try {
                    // Exit if trade is already finished or partner is no longer valid
                    if (tradeFinished || !this._tradePartnerUid) {
                        if (monitorInterval) {
                            clearInterval(monitorInterval);
                            monitorInterval = null;
                        }
                        return;
                    }
                    
                    // Get current trade status and check the offer
                    const tradeStatus = this.getVar(258);
                    const currentOffer = this.getTradeOffer(partner);
                    const isValid = this.isTradeOfferValid(currentOffer, requiredOffer);
                    
                    // If the player has added the correct gold and we haven't accepted yet,
                    // or if we accepted before but they changed their offer and now it's valid again
                    if (isValid && (!tradeAccepted || tradeStatus === 0)) {
                        tradeAccepted = true;
                        await this.acceptFirstScreen(partner);
                        if (this._currentSellingItem) {
                            partner.messageGame("That's the right amount! I've accepted the trade.");
                        }
                    }
                    // If we previously accepted but now the offer is no longer valid (gold was removed)
                    else if (!isValid && tradeAccepted) {
                        tradeAccepted = false;
                        this.setVar(258, 0); // Unaccept the trade
                        if (this._currentSellingItem) {
                            partner.messageGame(`I need ${this._currentSellingItem.price} gold coins for my ${this._currentSellingItem.name}.`);
                        }
                    }
                    
                    // If we've moved to the confirmation screen
                    if (tradeStatus === 2) {
                        await this.acceptTradeConfirmation();
                        tradeFinished = true;
                        if (monitorInterval) {
                            clearInterval(monitorInterval);
                            monitorInterval = null;
                        }
                    }
                } catch (err) {
                    printError(`[TRADE] AI "${this.username}" - Error in trade monitor: ${err}`);
                }
            }, 500); // Check every 500ms
            
            // Set a safety timeout to prevent the interval from running forever
            setTimeout(() => {
                if (monitorInterval) {
                    clearInterval(monitorInterval);
                    monitorInterval = null;
                    this.handleTradeClose();
                    printInfo(`[TRADE] AI "${this.username}" - Trade timed out after 2 minutes`);
                }
            }, 120000); // 2 minute timeout
            
            // After successful trade, potentially choose a new item to sell
            if (Math.random() < 0.3) { // 30% chance to switch items after a trade
                this.selectRandomItemToSell();
            }
        } catch (err) {
            printError(`AIPlayer: Error accepting trade for "${this.username}": ${err}`);
        }
    }

    private async acceptFirstScreen(partner: PlayerClass): Promise<void> {
        try {
            // Set our trade status, this is what actually accepts the trade.
            this.setVar(258, 1); // 258 is the tradestatus var ID
            // Try to set the trade status text anyway (might work sometimes)
            partner.write(new IfSetText(3431, 'Other player has accepted.'));
        } catch (err) {
            printError(`[TRADE] AI "${this.username}" - ACCEPT: Error accepting trade: ${err}`);
        }
    }

    /**
     * Accepts the trade confirmation screen with visual notification
     */
    private async acceptTradeConfirmation(): Promise<void> {
        try {
            printInfo(`[TRADE] AI "${this.username}" - CONFIRM: Beginning trade confirmation acceptance`);

            // Make sure we have a trade partner for the notification
            if (this._tradePartnerUid) {
                const partner = World.getPlayerByUid(this._tradePartnerUid);
                if (partner) {
                    this.setVar(258, 3); // 258 is the tradestatus var ID
                    partner.write(new IfSetText(3535, 'Other player has accepted.'));
                }
            } else {
                printInfo(`[TRADE] AI "${this.username}" - CONFIRM: No trade partner UID, aborting confirmation`);
            }
        } catch (err) {
            printError(`[TRADE] AI "${this.username}" - ERROR: Confirmation screen acceptance error: ${err}`);
        }
    }

    // Helper function to wait until the trade status becomes 2
    private async waitForTradeAcceptance(timeout: number = 5000, interval: number = 100): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkCondition = () => {
                if (this.getVar(258) === 2) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error('Timeout waiting for trade acceptance'));
                } else {
                    setTimeout(checkCondition, interval);
                }
            };
            checkCondition();
        });
    }

    private getTradeOffer(player: Player): { id: number; count: number }[] {
        const offer: { id: number; count: number }[] = [];
        const INVENTORY_SLOT_COUNT = 28;
        for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
            const item = player.invGetSlot(90, i);
            if (item && item.id) {
                offer.push({ id: item.id, count: item.count });
                // Log each slot that contains an item in the trade window
                printInfo(`[TRADE] AI "${this.username}" - Slot ${i}: Item ID ${item.id} x${item.count}`);
            }
        }
        if (offer.length === 0) {
            printInfo(`[TRADE] AI "${this.username}" - No items currently offered by ${player.username}.`);
        } else {
            // Log a summary of the current offer
            const summary = offer.map(item => `ItemID ${item.id} x${item.count}`).join(', ');
            printInfo(`[TRADE] AI "${this.username}" - Total Offer: ${summary}`);
        }
        return offer;
    }

    private isTradeOfferValid(tradeOffer: { id: number; count: number }[], requiredOffer: { id: number; count: number }[]): boolean {
        for (const reqItem of requiredOffer) {
            const offeredItem = tradeOffer.find(item => item.id === reqItem.id);
            if (!offeredItem || offeredItem.count < reqItem.count) {
                printInfo(`[TRADE] AI "${this.username}" - Required item ID ${reqItem.id} x${reqItem.count} is missing or insufficient (found ${offeredItem ? offeredItem.count : 0}).`);
                return false;
            }
        }
        return true;
    }

    private async waitForValidTradeOffer(
        partner: Player,
        requiredOffer: { id: number; count: number }[],
        timeout: number = 60000, // timeout in ms (extended to 1 minute)
        checkInterval: number = 500 // check every 500ms
    ): Promise<boolean> {
        const startTime = Date.now();
        // Log the required offer once
        const reqSummary = requiredOffer.map(item => `ItemID ${item.id} x${item.count}`).join(', ');
        printInfo(`[TRADE] AI "${this.username}" - Waiting for trade offer to meet required: ${reqSummary}`);

        // If we have a current selling item, tell the player what we want
        if (this._currentSellingItem) {
            partner.messageGame(`Please offer ${this._currentSellingItem.price} gold coins for my ${this._currentSellingItem.name}.`);
        }

        while (Date.now() - startTime < timeout) {
            const tradeOffer = this.getTradeOffer(partner);
            
            // Only log every few seconds to avoid spamming
            if ((Date.now() - startTime) % 3000 < checkInterval) {
                printInfo(`[TRADE] AI "${this.username}" - Checking trade offer: ${JSON.stringify(tradeOffer)}`);
            }
            
            if (this.isTradeOfferValid(tradeOffer, requiredOffer)) {
                printInfo(`[TRADE] AI "${this.username}" - Trade offer is valid.`);
                partner.messageGame("That's the right amount! Let's trade.");
                return true;
            }
            
            // Wait a bit before checking again
            await this.delay(checkInterval);
        }
        
        printInfo(`[TRADE] AI "${this.username}" - Trade offer did not meet the requirements within ${timeout}ms.`);
        return false;
    }
    /**
     * Handle trade closing from server or other player
     */
    public handleTradeClose(): void {
        try {
            printInfo(`[TRADE] AI "${this.username}" - CLOSE: Trade has ended or was closed`);

            // Clear trade partner and reset stage
            this._tradePartnerUid = null;

            // Reset trade status var
            this.setVar(258, 0);
        } catch (err) {
            printError(`[TRADE] AI "${this.username}" - ERROR: Error handling trade close: ${err}`);
        }
    }
    /**
     * Override processTimers to filter out the general_macro_events timer
     * This prevents AI players from experiencing random macro events
     */
    override processTimers(type: PlayerTimerType): void {
        for (const timer of this.timers.values()) {
            if (type !== timer.type) {
                continue;
            }
            const parts = timer.script.name.replace(/^\[|\]$/g, '').split(',');
            // Skip general_macro_events timer for AI players
            if (parts[1] === 'general_macro_events') {
                continue;
            }

            // Process all other timers normally
            if (World.currentTick >= timer.clock + timer.interval && (timer.type === PlayerTimerType.SOFT || this.canAccess())) {
                // Set clock back to interval
                timer.clock = World.currentTick;

                const script = ScriptRunner.init(timer.script, this, null, timer.args);
                this.executeScript(script, timer.type === PlayerTimerType.NORMAL);
            }
        }
    }

    /**
     * Creates and spawns an AI merchant player at specified coordinates
     */
    public static spawnMerchant(username: string, x: number, z: number): MerchantPlayer2 {
        printInfo(`AIPlayer: Creating merchant "${username}" at (${x}, ${z})`);
        
        // Create the merchant instance
        const merchant = new MerchantPlayer2(username, x, z, 0);
        
        // Ensure equipment is fully set up before activation
        printInfo(`AIPlayer: Ensuring equipment is set up for "${username}"`);
        const WORN = 103;
        merchant.buildAppearance(WORN);
        
        // Activate the merchant in the world
        merchant.activate(x, z);
        
        // Final appearance refresh after activation
        setTimeout(() => {
            if (merchant.active) {
                printInfo(`AIPlayer: Final appearance refresh for "${username}" after spawn`);
                merchant.buildAppearance(WORN);
            }
        }, 500);
        
        return merchant;
    }

    /**
     * Equips random items to the merchant to customize their appearance
     */
    private equipRandomItems(): void {
        try {
            // Define possible equipment sets based on gender
            const helmets = [1153, 1155, 1157, 1159, 1165]; // Bronze to rune full helms
            const mediumHelmets = [1139, 1141, 1143, 1145, 1147]; // Bronze to rune med helms
            const chainbodies = [1103, 1105, 1107, 1109, 1111]; // Bronze to rune chainbodies
            const platebodies = [1117, 1119, 1121, 1123, 1127]; // Bronze to rune platebodies
            const platelegs = [1075, 1077, 1079, 1081, 1083]; // Bronze to rune platelegs
            const plateskirts = [1087, 1089, 1091, 1093, 1095]; // Bronze to rune plateskirts
            const weapons = [1277, 1279, 1281, 1283, 1285, 1291, 1293, 1295, 1297, 1299, 1301, 1303, 1305, 1307, 1309, 1311, 1377, 1379, 1381, 1383, 1385]; // Various swords, axes
            const shields = [1171, 1173, 1175, 1177, 1179, 1189, 1191, 1193, 1195, 1197]; // Various shields
            const capes = [1019, 1021, 1023, 1027, 1029, 1031]; // Various capes
            const amulets = [1704, 1725, 1727, 1729, 1731]; // Various amulets
            
            // WORN equipment inventory (103)
            const WORN = 103;
            
            // Equipment slots
            const HEAD_SLOT = 0;
            const CAPE_SLOT = 1;
            const NECK_SLOT = 2;
            const WEAPON_SLOT = 3;
            const BODY_SLOT = 4;
            const SHIELD_SLOT = 5;
            const LEGS_SLOT = 7;
            
            // Randomly determine if we'll equip an item in each slot (with different probabilities)
            if (Math.random() < 0.7) { // 70% chance to have headgear
                const headgear = Math.random() < 0.5 ? 
                    helmets[Math.floor(Math.random() * helmets.length)] : 
                    mediumHelmets[Math.floor(Math.random() * mediumHelmets.length)];
                this.invSet(WORN, headgear, 1, HEAD_SLOT);
                printInfo(`AIPlayer: "${this.username}" equipped headgear: ${headgear}`);
            }
            
            if (Math.random() < 0.4) { // 40% chance to have a cape
                const cape = capes[Math.floor(Math.random() * capes.length)];
                this.invSet(WORN, cape, 1, CAPE_SLOT);
                printInfo(`AIPlayer: "${this.username}" equipped cape: ${cape}`);
            }
            
            if (Math.random() < 0.5) { // 50% chance to have an amulet
                const amulet = amulets[Math.floor(Math.random() * amulets.length)];
                this.invSet(WORN, amulet, 1, NECK_SLOT);
                printInfo(`AIPlayer: "${this.username}" equipped amulet: ${amulet}`);
            }
            
            if (Math.random() < 0.8) { // 80% chance to have a weapon
                const weapon = weapons[Math.floor(Math.random() * weapons.length)];
                this.invSet(WORN, weapon, 1, WEAPON_SLOT);
                printInfo(`AIPlayer: "${this.username}" equipped weapon: ${weapon}`);
            }
            
            if (Math.random() < 0.75) { // 75% chance to have body armor
                // Choose between chainbody and platebody
                const bodyArmor = Math.random() < 0.6 ? 
                    platebodies[Math.floor(Math.random() * platebodies.length)] : 
                    chainbodies[Math.floor(Math.random() * chainbodies.length)];
                this.invSet(WORN, bodyArmor, 1, BODY_SLOT);
                printInfo(`AIPlayer: "${this.username}" equipped body armor: ${bodyArmor}`);
            }
            
            if (Math.random() < 0.6) { // 60% chance to have a shield
                const shield = shields[Math.floor(Math.random() * shields.length)];
                this.invSet(WORN, shield, 1, SHIELD_SLOT);
                printInfo(`AIPlayer: "${this.username}" equipped shield: ${shield}`);
            }
            
            if (Math.random() < 0.7) { // 70% chance to have leg armor
                // For females, choose between platelegs and plateskirt
                let legArmor;
                if (this.gender === 1 && Math.random() < 0.7) { // 70% chance for females to wear skirts
                    legArmor = plateskirts[Math.floor(Math.random() * plateskirts.length)];
                } else {
                    legArmor = platelegs[Math.floor(Math.random() * platelegs.length)];
                }
                this.invSet(WORN, legArmor, 1, LEGS_SLOT);
                printInfo(`AIPlayer: "${this.username}" equipped leg armor: ${legArmor}`);
            }
            
            // Update the player's appearance
            printInfo(`AIPlayer: "${this.username}" attempting to build appearance with equipment`);
            this.buildAppearance(WORN);
            printInfo(`AIPlayer: "${this.username}" appearance built with equipment`);
            
            // Force refresh - run again to ensure it takes effect
            this.buildAppearance(WORN);
            
        } catch (err) {
            printError(`AIPlayer: Error equipping items for "${this.username}": ${err}`);
        }
    }
}
