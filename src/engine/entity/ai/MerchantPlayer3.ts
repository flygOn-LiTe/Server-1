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
 * Interface defining a item to buy from players
 */
interface BuyableItem {
    /** Item ID */
    id: number;
    /** Maximum quantity willing to buy */
    maxCount: number;
    /** Current quantity held */
    currentCount: number;
    /** Price willing to pay per item in gold coins (item ID 995) */
    price: number;
    /** The name of the item for chat messages */
    name: string;
}

export default class MerchantPlayer3 extends PlayerClass {
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

    /** Merchant buy list */
    private _merchantBuyList: BuyableItem[] = [];
    /** Currently selected items to buy */
    private _currentBuyingItems: BuyableItem[] = [];
    /** Message interval for buy announcements */
    private _buyAnnouncementInterval: ReturnType<typeof setInterval> | null = null;
    /** Maximum number of items to buy at once */
    private _maxBuyItems: number = 1;

    /**
     * Create a new AI player at the specified coordinates
     * @param username The username for this AI player
     * @param x The x coordinate to spawn the AI at
     * @param z The z coordinate to spawn the AI at
     * @param level The level to spawn the AI at (default: 0 for ground level)
     */
    constructor(username: string, x: number, z: number, level: number = 0) {
        // Calculate proper username hashes using static methods
        const username37 = MerchantPlayer3.calculateUsername37(username);
        const hash64 = MerchantPlayer3.calculateHash64(username);

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

        printInfo(`AIPlayer: Created '${username}' with spawn at (${this.spawnX}, ${this.spawnZ}) and target at (${this.targetX}, ${this.targetZ})`);

        // Randomize appearance and properties for the AI character
        // Random gender (0 = male, 1 = female)
        this.gender = Math.random() < 0.5 ? 0 : 1;

        // Set body parts based on gender
        if (this.gender === 0) {
            // Male
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
        } else {
            // Female
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

        printInfo(`AIPlayer: Player '${username}' created successfully with gender ${this.gender === 0 ? 'male' : 'female'} and combat level ${this.combatLevel}`);

        // Equip random items to customize appearance
        this.equipRandomItems();

        // Initialize default merchant buy list
        this.initializeDefaultBuyList();
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
     * Initialize default items for merchant to buy from players
     */
    private initializeDefaultBuyList(): void {
        this._merchantBuyList = [
            // Ores and bars - higher quantities
            { id: 436, maxCount: 1000, currentCount: 0, price: 20, name: 'Copper ore' },
            { id: 438, maxCount: 1000, currentCount: 0, price: 20, name: 'Tin ore' },
            { id: 440, maxCount: 1000, currentCount: 0, price: 50, name: 'Iron ore' },
            { id: 442, maxCount: 500, currentCount: 0, price: 100, name: 'Silver ore' },
            { id: 444, maxCount: 500, currentCount: 0, price: 120, name: 'Gold ore' },
            { id: 447, maxCount: 500, currentCount: 0, price: 150, name: 'Mithril ore' },
            { id: 449, maxCount: 200, currentCount: 0, price: 300, name: 'Adamantite ore' },
            { id: 451, maxCount: 100, currentCount: 0, price: 1000, name: 'Runite ore' },
            { id: 453, maxCount: 1000, currentCount: 0, price: 175, name: 'Coal' },
            
            // Bars - higher quantities
            { id: 2349, maxCount: 500, currentCount: 0, price: 100, name: 'Bronze bar' },
            { id: 2351, maxCount: 500, currentCount: 0, price: 150, name: 'Iron bar' },
            { id: 2355, maxCount: 250, currentCount: 0, price: 300, name: 'Silver bar' },
            { id: 2357, maxCount: 250, currentCount: 0, price: 350, name: 'Gold bar' },
            { id: 2359, maxCount: 250, currentCount: 0, price: 400, name: 'Mithril bar' },
            { id: 2361, maxCount: 150, currentCount: 0, price: 800, name: 'Adamant bar' },
            { id: 2363, maxCount: 100, currentCount: 0, price: 3000, name: 'Rune bar' },
            
            // Logs - higher quantities
            { id: 1511, maxCount: 1000, currentCount: 0, price: 30, name: 'Logs' },
            { id: 1521, maxCount: 1000, currentCount: 0, price: 60, name: 'Oak logs' },
            { id: 1519, maxCount: 500, currentCount: 0, price: 120, name: 'Willow logs' },
            { id: 1517, maxCount: 300, currentCount: 0, price: 280, name: 'Maple logs' },
            { id: 1515, maxCount: 200, currentCount: 0, price: 400, name: 'Yew logs' },
            { id: 1513, maxCount: 100, currentCount: 0, price: 1000, name: 'Magic logs' },
            
            // Runes - large quantities
            { id: 556, maxCount: 10000, currentCount: 0, price: 5, name: 'Air runes' },
            { id: 555, maxCount: 10000, currentCount: 0, price: 5, name: 'Water runes' },
            { id: 557, maxCount: 10000, currentCount: 0, price: 5, name: 'Earth runes' },
            { id: 554, maxCount: 10000, currentCount: 0, price: 5, name: 'Fire runes' },
            { id: 558, maxCount: 10000, currentCount: 0, price: 6, name: 'Mind runes' },
            { id: 559, maxCount: 10000, currentCount: 0, price: 7, name: 'Body runes' },
            { id: 564, maxCount: 5000, currentCount: 0, price: 25, name: 'Cosmic runes' },
            { id: 561, maxCount: 5000, currentCount: 0, price: 30, name: 'Nature runes' },
            { id: 562, maxCount: 5000, currentCount: 0, price: 35, name: 'Chaos runes' },
            { id: 563, maxCount: 3000, currentCount: 0, price: 70, name: 'Law runes' },
            { id: 565, maxCount: 3000, currentCount: 0, price: 80, name: 'Blood runes' },
            { id: 566, maxCount: 3000, currentCount: 0, price: 80, name: 'Soul runes' },
            
            // Clean Herbs - stacks up to 500
            { id: 249, maxCount: 500, currentCount: 0, price: 500, name: 'Guam leaf' },
            { id: 251, maxCount: 500, currentCount: 0, price: 750, name: 'Marrentill' },
            { id: 253, maxCount: 500, currentCount: 0, price: 1000, name: 'Tarromin' },
            { id: 255, maxCount: 500, currentCount: 0, price: 1200, name: 'Harralander' },
            { id: 257, maxCount: 500, currentCount: 0, price: 1500, name: 'Ranarr weed' },
            { id: 259, maxCount: 500, currentCount: 0, price: 2000, name: 'Irit leaf' },
            { id: 261, maxCount: 500, currentCount: 0, price: 2500, name: 'Avantoe' },
            { id: 263, maxCount: 500, currentCount: 0, price: 3000, name: 'Kwuarm' },
            { id: 265, maxCount: 500, currentCount: 0, price: 3500, name: 'Cadantine' },
            { id: 267, maxCount: 500, currentCount: 0, price: 4000, name: 'Dwarf weed' },
            { id: 269, maxCount: 500, currentCount: 0, price: 5000, name: 'Torstol' },
            
            // Unidentified Herbs - players couldn't tell which herb they had
            { id: 199, maxCount: 500, currentCount: 0, price: 450, name: 'Unidentified herb' },
            { id: 201, maxCount: 500, currentCount: 0, price: 700, name: 'Unidentified herb' },
            { id: 203, maxCount: 500, currentCount: 0, price: 950, name: 'Unidentified herb' },
            { id: 205, maxCount: 500, currentCount: 0, price: 1150, name: 'Unidentified herb' },
            { id: 207, maxCount: 500, currentCount: 0, price: 1450, name: 'Unidentified herb' },
            { id: 209, maxCount: 500, currentCount: 0, price: 1950, name: 'Unidentified herb' },
            { id: 211, maxCount: 500, currentCount: 0, price: 2450, name: 'Unidentified herb' },
            { id: 213, maxCount: 500, currentCount: 0, price: 2950, name: 'Unidentified herb' },
            { id: 215, maxCount: 500, currentCount: 0, price: 3450, name: 'Unidentified herb' },
            { id: 217, maxCount: 500, currentCount: 0, price: 3950, name: 'Unidentified herb' },
            { id: 219, maxCount: 500, currentCount: 0, price: 4950, name: 'Unidentified herb' },
            
            // Food and potions - large quantities
            { id: 373, maxCount: 1000, currentCount: 0, price: 100, name: 'Swordfish' },
            { id: 379, maxCount: 1000, currentCount: 0, price: 120, name: 'Lobster' },
            { id: 385, maxCount: 1000, currentCount: 0, price: 200, name: 'Shark' },
            { id: 333, maxCount: 1000, currentCount: 0, price: 85, name: 'Trout' },
            { id: 329, maxCount: 1000, currentCount: 0, price: 90, name: 'Salmon' },
            { id: 361, maxCount: 1000, currentCount: 0, price: 110, name: 'Tuna' },
            { id: 2289, maxCount: 1000, currentCount: 0, price: 50, name: 'Plain pizza' },
            { id: 2293, maxCount: 1000, currentCount: 0, price: 60, name: 'Meat pizza' },
            { id: 2297, maxCount: 1000, currentCount: 0, price: 70, name: 'Anchovy pizza' },
            { id: 2301, maxCount: 1000, currentCount: 0, price: 80, name: 'Pineapple pizza' },
            
            // Combat gear and weapons - smaller quantities
            { id: 1079, maxCount: 20, currentCount: 0, price: 40000, name: 'Rune platelegs' },
            { id: 1127, maxCount: 20, currentCount: 0, price: 55000, name: 'Rune platebody' },
            { id: 1303, maxCount: 20, currentCount: 0, price: 20000, name: 'Rune longsword' },
            { id: 1333, maxCount: 20, currentCount: 0, price: 25000, name: 'Rune scimitar' },
            { id: 4151, maxCount: 5, currentCount: 0, price: 100000, name: 'Abyssal whip' },
            { id: 1187, maxCount: 10, currentCount: 0, price: 200000, name: 'Dragon sq shield' },
            { id: 1305, maxCount: 10, currentCount: 0, price: 60000, name: 'Dragon longsword' },
            { id: 1377, maxCount: 10, currentCount: 0, price: 70000, name: 'Dragon battleaxe' },
            
            // Misc high value items - smaller quantities
            { id: 1631, maxCount: 100, currentCount: 0, price: 800, name: 'Uncut dragonstone' },
            { id: 1617, maxCount: 200, currentCount: 0, price: 300, name: 'Uncut diamond' },
            { id: 1615, maxCount: 300, currentCount: 0, price: 200, name: 'Uncut ruby' },
            { id: 1619, maxCount: 400, currentCount: 0, price: 150, name: 'Uncut emerald' },
            { id: 1621, maxCount: 500, currentCount: 0, price: 100, name: 'Uncut sapphire' },
            { id: 1623, maxCount: 500, currentCount: 0, price: 80, name: 'Uncut opal' },
            
            // Additional certificated items
            { id: 1779, maxCount: 1000, currentCount: 0, price: 25, name: 'Flax' },
            { id: 1777, maxCount: 1000, currentCount: 0, price: 75, name: 'Bow string' },
            { id: 1761, maxCount: 1000, currentCount: 0, price: 25, name: 'Soft clay' },
            { id: 1775, maxCount: 1000, currentCount: 0, price: 40, name: 'Molten glass' },
            { id: 225, maxCount: 500, currentCount: 0, price: 700, name: 'Limpwurt root' },
            { id: 223, maxCount: 500, currentCount: 0, price: 600, name: 'Red spiders eggs' },
            { id: 1119, maxCount: 10, currentCount: 0, price: 5000, name: 'Steel platebody' },
            { id: 1121, maxCount: 10, currentCount: 0, price: 10000, name: 'Mithril platebody' },
            { id: 1123, maxCount: 10, currentCount: 0, price: 25000, name: 'Adamant platebody' }
        ];

        // Select a random item to buy initially
        this.selectRandomItemsToBuy();
    }

    /**
     * Set the merchant's buy list
     */
    public setMerchantBuyList(items: BuyableItem[]): void {
        this._merchantBuyList = [...items];
        printInfo(`AIPlayer: '${this.username}' merchant buy list set with ${items.length} items`);
        // Re-select random items after changing buy list
        this.selectRandomItemsToBuy();
    }

    /**
     * Randomly select a subset of items from buy list to focus on buying
     */
    private selectRandomItemsToBuy(): void {
        if (this._merchantBuyList.length > 0) {
            this._currentBuyingItems = [];
            
            // Create a copy of the buy list that we can modify
            const availableItems = [...this._merchantBuyList];
            
            // Determine how many items to select (now always 1)
            const numItems = 1;
            
            // Select random items from the list
            for (let i = 0; i < numItems && availableItems.length > 0; i++) {
                const randomIndex = Math.floor(Math.random() * availableItems.length);
                this._currentBuyingItems.push(availableItems[randomIndex]);
                availableItems.splice(randomIndex, 1); // Remove selected item from available items
            }
            
            // Log the selected items
            const itemNames = this._currentBuyingItems.map(item => `${item.name} for ${item.price} gold`).join(', ');
            printInfo(`AIPlayer: '${this.username}' selected to buy: ${itemNames}`);
        } else {
            this._currentBuyingItems = [];
            printInfo(`AIPlayer: '${this.username}' has no items to buy`);
        }
    }

    /**
     * Activates this AI player and adds it to the world
     */
    public activate(x: number, z: number): boolean {
        try {
            printInfo(`AIPlayer: Activating '${this.username}'`);

            // Create logic similar to a player joining the world
            const pid = this.pid;

            if (pid === -1) {
                // Get a new player ID
                this.pid = World.getNextPid();
                printInfo(`AIPlayer: Assigned PID ${this.pid} to '${this.username}'`);
            }

            // Add to world if not already active
            if (!this.active) {
                World.addPlayer(this);
                this.onLogin();
                this.active = true;

                // Teleport to the desired location
                this.teleport(x, z, 0);
                printInfo(`AIPlayer: '${this.username}' teleported to (${this.spawnX}, ${this.spawnZ}, ${this.level})`);

                // Force refresh equipment appearance now that the player is in the world
                const WORN = 103;
                printInfo(`AIPlayer: '${this.username}' enforcing appearance update after activation`);
                this.buildAppearance(WORN);

                // Start the heartbeat to prevent timeout
                this.startHeartbeat();

                // Start buy announcements
                this.startBuyAnnouncements();

                return true;
            }

            return false;
        } catch (err) {
            printError(`AIPlayer: Error activating '${this.username}': ${err}`);
            return false;
        }
    }

    /**
     * Start periodic buy announcements
     */
    private startBuyAnnouncements(): void {
        // Clear any existing announcement interval
        if (this._buyAnnouncementInterval) {
            clearInterval(this._buyAnnouncementInterval);
        }

        // Calculate a random initial delay (between 1-5 seconds)
        // This staggers the start time so merchants don't all announce simultaneously
        const initialDelay = Math.floor(Math.random() * 5000) + 1000;

        // Calculate a random interval (between 8-15 seconds)
        // This varies the frequency of announcements for each merchant
        const announcementInterval = Math.floor(Math.random() * 7000) + 8000;

        // Log the timing configuration
        printInfo(`AIPlayer: '${this.username}' will start announcing in ${initialDelay}ms with interval of ${announcementInterval}ms`);

        // Start with the initial delay
        setTimeout(() => {
            // Show first announcement immediately after initial delay
            if (this._currentBuyingItems.length > 0) {
                const item = this._currentBuyingItems[0];
                this.say(`Buying ${item.name} for ${item.price} gold each! Trade me!`);
            } else {
                this.say('Looking to buy various items! Trade me!');
            }

            // Then start the interval for subsequent announcements
            this._buyAnnouncementInterval = setInterval(() => {
                if (this._currentBuyingItems.length > 0) {
                    const item = this._currentBuyingItems[0];
                    
                    // Determine message style based on whether item can be certificated
                    const canBeCerted = this.canItemBeCertificated(item.id);
                    
                    // Alternate between different message styles
                    const messageStyle = Math.floor(Math.random() * 6);
                    
                    switch(messageStyle) {
                        case 0:
                            this.say(`Buying ${item.name} for ${item.price} gold each!`);
                            break;
                        case 1:
                            this.say(`I need ${item.name}! Paying ${item.price} coins per item!`);
                            break;
                        case 2:
                            if (canBeCerted) {
                                this.say(`Trading gold for ${item.name}! ${item.price}gp each! Will buy certs!`);
                            } else {
                                this.say(`Trading gold for ${item.name}! ${item.price}gp each!`);
                            }
                            break;
                        case 3:
                            this.say(`Top prices paid for ${item.name}! ${item.price} each!`);
                            break;
                        case 4:
                            if (item.maxCount > 100) {
                                this.say(`Buying bulk ${item.name}! Paying ${item.price} each!`);
                            } else {
                                this.say(`Need ${item.name}! Will pay ${item.price} gold coins!`);
                            }
                            break;
                        default:
                            this.say(`Buying: ${item.name} - ${item.price} gold each`);
                            break;
                    }
                } else {
                    this.say('Looking to buy various items! Trade me!');
                }
            }, announcementInterval);
        }, initialDelay);
    }

    /**
     * Check if an item has a certificate counterpart
     */
    private canItemBeCertificated(itemId: number): boolean {
        // Check if this item has a certificate version (cert_itemname)
        // This is a simplified check - for items 1-2000, most have cert versions at id+1
        // For more accurate verification, we'd need to look at the actual item database
        
        // Some common categories that can be certified
        const certifiableCategories = [
            // Ores and bars
            [436, 438, 440, 442, 444, 447, 449, 451, 453],
            // Bars
            [2349, 2351, 2355, 2357, 2359, 2361, 2363],
            // Logs
            [1511, 1521, 1519, 1517, 1515, 1513],
            // Raw fish
            [317, 321, 327, 331, 335, 341, 345, 349, 353, 359, 363, 371, 377, 383, 389, 395],
            // Cooked fish
            [315, 319, 325, 329, 333, 339, 347, 351, 355, 361, 365, 373, 379, 385, 391, 397],
            // Burnt fish
            [323, 343, 357, 367, 369, 375, 381, 387, 393, 399],
            // Common resources
            [1779, 1777, 1761, 1775, 225, 223],
            // Clean herbs
            [249, 251, 253, 255, 257, 259, 261, 263, 265, 267, 269],
            // Unidentified herbs
            [199, 201, 203, 205, 207, 209, 211, 213, 215, 217, 219]
        ];
        
        // Check if our item is in any of the certifiable categories
        for (const category of certifiableCategories) {
            if (category.includes(itemId)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Inform player about the items we're buying
     */
    private informAboutBuyingItems(partner: Player): void {
        if (this._currentBuyingItems.length > 0) {
            const item = this._currentBuyingItems[0];
            const canBeCerted = this.canItemBeCertificated(item.id);
            
            // Calculate how many we still need
            const remainingCount = item.maxCount - item.currentCount;
            
            // Let the player know what we're buying
            partner.messageGame(`I'm buying ${item.name} for ${item.price} gold each.`);
            
            if (canBeCerted) {
                partner.messageGame(`I'll accept certificates too. I need ${remainingCount} more.`);
            } else {
                partner.messageGame(`I need ${remainingCount} more.`);
            }
            
            if (item.maxCount > 100) {
                partner.messageGame('I\'m buying in bulk - bring as many as you want!');
            }
        } else {
            partner.messageGame('I\'m not buying any items at the moment.');
        }
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

            // Make sure we have gold in our inventory for buying
            this.addBuyingGold();

            // Set partner as target and use the proper opcode (OPPLAYER4 = trade)
            // This is what actually opens the trade
            this.target = partner;
            this.targetOp = ServerTriggerType.OPPLAYER4;

            // Wait for trade window to open
            await this.delay(1500);

            // Inform player about the items we're buying
            this.informAboutBuyingItems(partner);

            // Start continuous trade monitoring
            let tradeAccepted = false;
            let tradeFinished = false;
            let monitorInterval: ReturnType<typeof setInterval> | null = null;
            // Keep track of last offer value to avoid redundant updates
            let lastOfferValue = 0;

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
                    
                    // Check if partner is still valid
                    const partner = World.getPlayerByUid(this._tradePartnerUid);
                    if (!partner || !partner.isActive) {
                        printInfo(`[TRADE] AI '${this.username}' - Partner no longer valid, ending trade monitoring`);
                        if (monitorInterval) {
                            clearInterval(monitorInterval);
                            monitorInterval = null;
                        }
                        this.handleTradeClose();
                        return;
                    }

                    // Get current trade status safely
                    let tradeStatus = 0;
                    try {
                        tradeStatus = Number(this.getVar(258));
                    } catch (err) {
                        printError(`[TRADE] AI '${this.username}' - Error getting trade status: ${err}`);
                    }
                    
                    // Safety check - if trade status is unexpected, reset it
                    if (tradeStatus < 0 || tradeStatus > 3) {
                        printInfo(`[TRADE] AI '${this.username}' - Invalid trade status ${tradeStatus}, resetting to 0`);
                        tradeStatus = 0;
                        try {
                            this.setVar(258, 0);
                        } catch (err) {
                            printError(`[TRADE] AI '${this.username}' - Error resetting trade status: ${err}`);
                        }
                    }
                    
                    // Safely get player offer with error handling
                    let playerOffer: { id: number; count: number }[] = [];
                    try {
                        playerOffer = this.getTradeOffer(partner);
                    } catch (err) {
                        printError(`[TRADE] AI '${this.username}' - Error getting player offer: ${err}`);
                    }
                    
                    // Safely calculate offer value
                    let totalValue = 0;
                    let acceptedItems: { id: number; count: number; name: string; price: number }[] = [];
                    try {
                        const evaluated = this.evaluatePlayerOffer(playerOffer);
                        totalValue = evaluated.totalValue;
                        acceptedItems = evaluated.acceptedItems;
                    } catch (err) {
                        printError(`[TRADE] AI '${this.username}' - Error evaluating player offer: ${err}`);
                    }
                    
                    // Process based on the value of the offer
                    if (totalValue > 0) {
                        try {
                            // Only update our offer if the value has changed
                            if (totalValue !== lastOfferValue) {
                                printInfo(`[TRADE] AI '${this.username}' - Offer value changed from ${lastOfferValue} to ${totalValue}, updating gold offer`);
                                
                                // Clear our offer and update it to match current value
                                this.clearTradeOffer();
                                
                                // Add a small delay to prevent client-server desync issues
                                await new Promise(resolve => setTimeout(resolve, 50));
                                
                                // Offer gold for the items with error handling
                                await this.offerGoldForItems(totalValue);
                                
                                // Remember the last offer value
                                lastOfferValue = totalValue;
                                
                                // Only send a message if this is the first offer or the value changed significantly
                                if (!this._itemsOffered) {
                                    this._itemsOffered = true;
                                    
                                    // Let the player know about the transaction
                                    try {
                                        const itemText = acceptedItems.map(item => 
                                            `${item.count}x ${item.name} at ${item.price} each`
                                        ).join(', ');
                                        
                                        partner.messageGame(`I'll pay ${totalValue} gold for ${itemText}`);
                                    } catch (err) {
                                        printError(`[TRADE] AI '${this.username}' - Error sending offer message: ${err}`);
                                    }
                                }
                            }
                            
                            // Accept the trade if we haven't already or if status is reset
                            if (!tradeAccepted || tradeStatus === 0) {
                                try {
                                    tradeAccepted = true;
                                    await this.acceptFirstScreen(partner);
                                } catch (err) {
                                    printError(`[TRADE] AI '${this.username}' - Error accepting first screen: ${err}`);
                                }
                            }
                        } catch (err) {
                            printError(`[TRADE] AI '${this.username}' - Error processing player offer: ${err}`);
                        }
                    } else {
                        // Handle the case where player is not offering anything we want
                        try {
                            // If we previously accepted but now there's nothing we want
                            if (tradeAccepted || lastOfferValue > 0) {
                                tradeAccepted = false;
                                this.setVar(258, 0); // Unaccept the trade
                                this._itemsOffered = false;
                                lastOfferValue = 0; // Reset last offer value
                                
                                // Clear our gold offer
                                this.clearTradeOffer();
                                
                                // Let them know we don't want anything
                                try {
                                    if (this._currentBuyingItems.length > 0) {
                                        const item = this._currentBuyingItems[0];
                                        partner.messageGame(`I'm only interested in ${item.name}.`);
                                    } else {
                                        partner.messageGame('I\'m not interested in those items.');
                                    }
                                } catch (err) {
                                    printError(`[TRADE] AI '${this.username}' - Error sending rejection message: ${err}`);
                                }
                            }
                        } catch (err) {
                            printError(`[TRADE] AI '${this.username}' - Error clearing trade offer: ${err}`);
                        }
                    }

                    // Handle the confirmation screen safely
                    try {
                        // If we've moved to the confirmation screen, accept it
                        if (tradeStatus === 2) {
                            await this.acceptTradeConfirmation();
                            tradeFinished = true;
                            if (monitorInterval) {
                                clearInterval(monitorInterval);
                                monitorInterval = null;
                            }
                            
                            // After a successful trade, update our inventory counts
                            try {
                                this.updateItemCounts(acceptedItems);
                            } catch (err) {
                                printError(`[TRADE] AI '${this.username}' - Error updating item counts: ${err}`);
                            }
                        }
                    } catch (err) {
                        printError(`[TRADE] AI '${this.username}' - Error handling confirmation screen: ${err}`);
                    }
                } catch (err) {
                    printError(`[TRADE] AI '${this.username}' - Error in trade monitor: ${err}`);
                }
            }, 500); // Check every 500ms

            // Set a safety timeout to prevent the interval from running forever
            setTimeout(() => {
                if (monitorInterval) {
                    clearInterval(monitorInterval);
                    monitorInterval = null;
                    this.handleTradeClose();
                    printInfo(`[TRADE] AI '${this.username}' - Trade timed out after 2 minutes`);
                }
            }, 120000); // 2 minute timeout
        } catch (err) {
            printError(`AIPlayer: Error accepting trade for '${this.username}': ${err}`);
        }
    }

    /**
     * Deactivates this AI player and removes it from the world
     */
    public deactivate(): void {
        if (!this.active) {
            printInfo(`AIPlayer: Player '${this.username}' is not active, not deactivating`);
            return;
        }

        printInfo(`AIPlayer: Deactivating player '${this.username}'`);

        try {
            // Add session log directly instead of relying on World.addSessionLog
            this.addSessionLog(LoggerEventType.MODERATOR, 'Logged out');

            // Skip the problematic World.flushPlayer call
            // Instead just remove player from world

            // First remove from zone to avoid errors
            try {
                const zone = World.gameMap.getZone(this.x, this.z, this.level);
                printInfo(`AIPlayer: Removing '${this.username}' from zone (${zone.x}, ${zone.z}, ${zone.level})`);
                zone.leave(this);
            } catch (e) {
                printError(`AIPlayer: Error removing '${this.username}' from zone: ${e}`);
            }

            // Set inactive flags
            this.active = false;
            this.isActive = false;

            // Try to remove from world
            try {
                // @ts-expect-error - This is expected to call World.removePlayer but will avoid flushPlayer
                World.players.delete(this.pid);
                printInfo(`AIPlayer: Player '${this.username}' removed from World.players list`);
            } catch (e) {
                printError(`AIPlayer: Error removing '${this.username}' from World.players: ${e}`);
            }

            // Clear the buy announcement interval
            if (this._buyAnnouncementInterval) {
                clearInterval(this._buyAnnouncementInterval);
                this._buyAnnouncementInterval = null;
            }

            printInfo(`AIPlayer: Player '${this.username}' deactivated successfully`);
        } catch (e) {
            printError(`AIPlayer: Error during deactivation of '${this.username}': ${e}`);
        }
    }

    /**
     * Called when this player logs in to the game
     * Override Player's onLogin method
     */
    public onLogin(): void {
        printInfo(`AIPlayer: onLogin called for '${this.username}'`);

        // Set basic player state
        this.tele = true;

        // Reset logout state before calling parent
        this.resetLogoutState();

        // Call super implementation
        try {
            super.onLogin();
            printInfo(`AIPlayer: super.onLogin() completed for '${this.username}'`);
        } catch (e) {
            printError(`AIPlayer: Error in super.onLogin() for '${this.username}': ${e}`);
        }

        // Reset logout state again after parent call to ensure it's applied
        this.resetLogoutState();

        printInfo(`AIPlayer: onLogin complete for '${this.username}'`);
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
    public static spawn(username: string, x: number, z: number): MerchantPlayer3 {
        printInfo(`AIPlayer: Creating player '${username}' in Lumbridge at (${x}, ${z})`);
        const player = new MerchantPlayer3(username, x, z, 0);
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
                        printInfo(`AIPlayer: Heartbeat keepalive for '${this.username}' at tick ${World.currentTick}`);
                    }
                } catch (err) {
                    printError(`AIPlayer: Heartbeat error for '${this.username}': ${err}`);
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
    
    /**
     * Force the player state to be active (brute force approach)
     */
    private forceActiveState(): void {
        // Log every minute
        if (World.currentTick % 100 === 0) {
            printInfo(`AIPlayer: Force keepalive for '${this.username}' at tick ${World.currentTick}`);
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

        // Clear the buy announcement interval
        if (this._buyAnnouncementInterval) {
            clearInterval(this._buyAnnouncementInterval);
            this._buyAnnouncementInterval = null;
        }

        // Call the parent cleanup method
        super.cleanup();
    }

    /**
     * Override logout to prevent AI players from logging out
     */
    public logout(): void {
        // Don't proceed with logout for AI players
        printInfo(`AIPlayer: '${this.username}' prevented from logging out`);

        // Force the player to stay active
        this.resetLogoutState();
    }

    /**
     * Override terminate to prevent AI players from being terminated
     */
    public terminate(): void {
        // Don't allow AI players to be terminated
        printInfo(`AIPlayer: '${this.username}' prevented from being terminated`);

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
     * Add coins to inventory for buying from players
     */
    public addBuyingGold(): void {
        try {
            // Add a substantial amount of coins to the inventory
            // ID 995 is gold coins
            const COINS_ID = 995;
            const COINS_AMOUNT = 10000000; // 10M coins
            
            // Add gold to inventory
            this.invAdd(93, COINS_ID, COINS_AMOUNT);
            printInfo(`AIPlayer: '${this.username}' added ${COINS_AMOUNT} gold coins to inventory for buying`);
        } catch (err) {
            printError(`AIPlayer: Error adding buying gold for '${this.username}': ${err}`);
        }
    }

    /**
     * Override the message method to intercept and handle trade requests
     */
    public messageGame(message: string): void {
        try {
            // Check for trade request messages
            if (message.includes(':tradereq:')) {
                printInfo(`AIPlayer: '${this.username}' received trade request message: ${message}`);

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
            printError(`AIPlayer: Error handling message for '${this.username}': ${err}`);
            // Ensure parent method is still called
            super.messageGame(message);
        }
    }

    /**
     * Hook that should be called when a trade message is received from another player
     * @param targetUsername The username of the player who sent the trade request
     */
    public receiveTradeMesEvent(targetUsername: string): void {
        try {
            // Find the player by username
            const targetPlayer = World.getPlayerByUsername(targetUsername);
            if (!targetPlayer) {
                printInfo(`AIPlayer: '${this.username}' received trade request from unknown player '${targetUsername}'`);
                return;
            }
            
            // Ensure we have gold in our inventory before accepting a trade
            this.addBuyingGold();
            
            // Respond to the trade request
            this.respondToTradeRequest(targetPlayer.uid);
        } catch (err) {
            printError(`AIPlayer: Error handling trade message for '${this.username}': ${err}`);
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
            printError(`[TRADE] AI '${this.username}' - ERROR: Trade request handling error: ${err}`);
        }
    }

    // Helper function to create a delay
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Accepts the trade confirmation screen with visual notification
     */
    private async acceptTradeConfirmation(): Promise<void> {
        try {
            printInfo(`[TRADE] AI '${this.username}' - CONFIRM: Beginning trade confirmation acceptance`);

            // Make sure we have a trade partner for the notification
            if (this._tradePartnerUid) {
                const partner = World.getPlayerByUid(this._tradePartnerUid);
                if (partner) {
                    this.setVar(258, 3); // 258 is the tradestatus var ID
                    partner.write(new IfSetText(3535, 'Other player has accepted.'));
                }
            } else {
                printInfo(`[TRADE] AI '${this.username}' - CONFIRM: No trade partner UID, aborting confirmation`);
            }
        } catch (err) {
            printError(`[TRADE] AI '${this.username}' - ERROR: Confirmation screen acceptance error: ${err}`);
        }
    }

    /**
     * Get what items are currently being offered in the trade
     */
    private getTradeOffer(player: Player): { id: number; count: number }[] {
        const offer: { id: number; count: number }[] = [];
        const INVENTORY_SLOT_COUNT = 28;
        for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
            const item = player.invGetSlot(90, i);
            if (item && item.id) {
                offer.push({ id: item.id, count: item.count });
                // Log each slot that contains an item in the trade window
                printInfo(`[TRADE] AI '${this.username}' - Slot ${i}: Item ID ${item.id} x${item.count}`);
            }
        }
        if (offer.length === 0) {
            printInfo(`[TRADE] AI '${this.username}' - No items currently offered by ${player.username}.`);
        } else {
            // Log a summary of the current offer
            const summary = offer.map(item => `ItemID ${item.id} x${item.count}`).join(', ');
            printInfo(`[TRADE] AI '${this.username}' - Total Offer: ${summary}`);
        }
        return offer;
    }

    /**
     * Handle trade closing from server or other player
     */
    public handleTradeClose(): void {
        try {
            printInfo(`[TRADE] AI '${this.username}' - CLOSE: Trade has ended or was closed`);

            // Clear trade partner and reset stage
            this._tradePartnerUid = null;
            this._itemsOffered = false;

            // Reset trade status var
            this.setVar(258, 0);
        } catch (err) {
            printError(`[TRADE] AI '${this.username}' - ERROR: Error handling trade close: ${err}`);
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
    public static spawnBuyer(username: string, x: number, z: number): MerchantPlayer3 {
        printInfo(`AIPlayer: Creating buyer '${username}' at (${x}, ${z})`);

        // Create the merchant instance
        const merchant = new MerchantPlayer3(username, x, z, 0);

        // Ensure equipment is fully set up before activation
        printInfo(`AIPlayer: Ensuring equipment is set up for '${username}'`);
        const WORN = 103;
        merchant.buildAppearance(WORN);

        // Add gold to inventory
        merchant.addBuyingGold();

        // Activate the merchant in the world
        merchant.activate(x, z);

        // Final appearance refresh after activation
        setTimeout(() => {
            if (merchant.active) {
                printInfo(`AIPlayer: Final appearance refresh for '${username}' after spawn`);
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
            if (Math.random() < 0.7) {
                // 70% chance to have headgear
                const headgear = Math.random() < 0.5 ? helmets[Math.floor(Math.random() * helmets.length)] : mediumHelmets[Math.floor(Math.random() * mediumHelmets.length)];
                this.invSet(WORN, headgear, 1, HEAD_SLOT);
                printInfo(`AIPlayer: '${this.username}' equipped headgear: ${headgear}`);
            }

            if (Math.random() < 0.4) {
                // 40% chance to have a cape
                const cape = capes[Math.floor(Math.random() * capes.length)];
                this.invSet(WORN, cape, 1, CAPE_SLOT);
                printInfo(`AIPlayer: '${this.username}' equipped cape: ${cape}`);
            }

            if (Math.random() < 0.5) {
                // 50% chance to have an amulet
                const amulet = amulets[Math.floor(Math.random() * amulets.length)];
                this.invSet(WORN, amulet, 1, NECK_SLOT);
                printInfo(`AIPlayer: '${this.username}' equipped amulet: ${amulet}`);
            }

            if (Math.random() < 0.8) {
                // 80% chance to have a weapon
                const weapon = weapons[Math.floor(Math.random() * weapons.length)];
                this.invSet(WORN, weapon, 1, WEAPON_SLOT);
                printInfo(`AIPlayer: '${this.username}' equipped weapon: ${weapon}`);
            }

            if (Math.random() < 0.75) {
                // 75% chance to have body armor
                // Choose between chainbody and platebody
                const bodyArmor = Math.random() < 0.6 ? platebodies[Math.floor(Math.random() * platebodies.length)] : chainbodies[Math.floor(Math.random() * chainbodies.length)];
                this.invSet(WORN, bodyArmor, 1, BODY_SLOT);
                printInfo(`AIPlayer: '${this.username}' equipped body armor: ${bodyArmor}`);
            }

            if (Math.random() < 0.6) {
                // 60% chance to have a shield
                const shield = shields[Math.floor(Math.random() * shields.length)];
                this.invSet(WORN, shield, 1, SHIELD_SLOT);
                printInfo(`AIPlayer: '${this.username}' equipped shield: ${shield}`);
            }

            if (Math.random() < 0.7) {
                // 70% chance to have leg armor
                // For females, choose between platelegs and plateskirt
                let legArmor;
                if (this.gender === 1 && Math.random() < 0.7) {
                    // 70% chance for females to wear skirts
                    legArmor = plateskirts[Math.floor(Math.random() * plateskirts.length)];
                } else {
                    legArmor = platelegs[Math.floor(Math.random() * platelegs.length)];
                }
                this.invSet(WORN, legArmor, 1, LEGS_SLOT);
                printInfo(`AIPlayer: '${this.username}' equipped leg armor: ${legArmor}`);
            }

            // Update the player's appearance
            printInfo(`AIPlayer: '${this.username}' attempting to build appearance with equipment`);
            this.buildAppearance(WORN);
            printInfo(`AIPlayer: '${this.username}' appearance built with equipment`);

            // Force refresh - run again to ensure it takes effect
            this.buildAppearance(WORN);
        } catch (err) {
            printError(`AIPlayer: Error equipping items for '${this.username}': ${err}`);
        }
    }
    
    /**
     * Get the list of items this merchant is currently buying
     */
    public getCurrentBuyingItems(): BuyableItem[] {
        return [...this._currentBuyingItems];
    }
    
    /**
     * Get the full list of buyable items for this merchant
     */
    public getMerchantBuyList(): BuyableItem[] {
        return [...this._merchantBuyList];
    }
    
    /**
     * Check if merchant is interested in buying a specific item
     */
    public isInterestedInItem(itemId: number): boolean {
        return this._currentBuyingItems.some(item => item.id === itemId);
    }
    
    /**
     * Get price for a specific item if merchant is buying it
     */
    public getPriceForItem(itemId: number): number {
        const item = this._currentBuyingItems.find(item => item.id === itemId);
        return item ? item.price : 0;
    }
    
    /**
     * Add a new item to the merchant's buy list
     */
    public addItemToBuyList(item: BuyableItem): void {
        // Check if item already exists
        const existingIndex = this._merchantBuyList.findIndex(i => i.id === item.id);
        
        if (existingIndex >= 0) {
            // Update existing item
            this._merchantBuyList[existingIndex] = { ...item };
            printInfo(`AIPlayer: '${this.username}' updated buy list item: ${item.name}`);
        } else {
            // Add new item
            this._merchantBuyList.push({ ...item });
            printInfo(`AIPlayer: '${this.username}' added new buy list item: ${item.name}`);
        }
        
        // Check if we need to update current buying items
        if (this._currentBuyingItems.length < this._maxBuyItems) {
            this.selectRandomItemsToBuy();
        }
    }
    
    /**
     * Remove an item from the merchant's buy list
     */
    public removeItemFromBuyList(itemId: number): boolean {
        const initialLength = this._merchantBuyList.length;
        this._merchantBuyList = this._merchantBuyList.filter(item => item.id !== itemId);
        
        // Also remove from current buying items if present
        this._currentBuyingItems = this._currentBuyingItems.filter(item => item.id !== itemId);
        
        // If we removed something and now have too few buying items, select new ones
        if (this._merchantBuyList.length < initialLength && this._currentBuyingItems.length < this._maxBuyItems) {
            this.selectRandomItemsToBuy();
        }
        
        return this._merchantBuyList.length < initialLength;
    }

    /**
     * Evaluate what the player is offering and calculate its value
     */
    private evaluatePlayerOffer(playerOffer: { id: number; count: number }[]): { 
        totalValue: number; 
        acceptedItems: { id: number; count: number; name: string; price: number }[] 
    } {
        let totalValue = 0;
        const acceptedItems: { id: number; count: number; name: string; price: number }[] = [];
        
        try {
            // Safety check - ensure we don't process too many items at once (prevent overflows)
            const MAX_ACCEPTABLE_COUNT = 5000; // Reasonable upper limit for any individual item stack
            
            // Go through each item the player is offering
            for (const offeredItem of playerOffer) {
                // Safety check for invalid item counts (prevents overflow/underflow issues)
                if (!offeredItem.count || offeredItem.count <= 0 || offeredItem.count > MAX_ACCEPTABLE_COUNT) {
                    // Skip this item if count is invalid
                    continue;
                }
                
                // Special case: If we're buying any unidentified herb, check if this is one
                if (this._currentBuyingItems.length > 0 && 
                    this._currentBuyingItems[0].name === 'Unidentified herb') {
                    
                    // Check if the offered item is any unidentified herb (ID range 199-219 with odd numbers)
                    const unidHerbIds = [199, 201, 203, 205, 207, 209, 211, 213, 215, 217, 219];
                    if (unidHerbIds.includes(offeredItem.id)) {
                        // Since we can't tell which specific herb it is, use our current buying item's price
                        const buyableItem = this._currentBuyingItems[0];
                        
                        // Calculate how many we can accept (limited by our max count)
                        const remainingCapacity = buyableItem.maxCount - buyableItem.currentCount;
                        // Cap the count to prevent overflow bugs
                        const acceptCount = Math.min(Math.min(offeredItem.count, remainingCapacity), MAX_ACCEPTABLE_COUNT);
                        
                        if (acceptCount > 0) {
                            // Calculate the value for this unidentified herb
                            const itemValue = acceptCount * buyableItem.price;
                            totalValue += itemValue;
                            
                            // Add to accepted items
                            acceptedItems.push({
                                id: offeredItem.id,
                                count: acceptCount,
                                name: buyableItem.name,
                                price: buyableItem.price
                            });
                            
                            printInfo(`[TRADE] AI '${this.username}' - Accepting ${acceptCount}x ${buyableItem.name} for ${itemValue} gold`);
                        }
                        
                        // Continue to the next item
                        continue;
                    }
                    
                    // Also check for certificates of unidentified herbs
                    const unidHerbCertIds = [200, 202, 204, 206, 208, 210, 212, 214, 216, 218, 220];
                    if (unidHerbCertIds.includes(offeredItem.id)) {
                        // Since we can't tell which specific herb certificate it is, use our current buying item's price
                        const buyableItem = this._currentBuyingItems[0];
                        
                        // Calculate how many we can accept (limited by our max count)
                        const remainingCapacity = buyableItem.maxCount - buyableItem.currentCount;
                        // Cap the count to prevent overflow bugs
                        const acceptCount = Math.min(Math.min(offeredItem.count, remainingCapacity), MAX_ACCEPTABLE_COUNT);
                        
                        if (acceptCount > 0) {
                            // Calculate the value for this unidentified herb certificate
                            const itemValue = acceptCount * buyableItem.price;
                            totalValue += itemValue;
                            
                            // Add to accepted items
                            acceptedItems.push({
                                id: offeredItem.id,
                                count: acceptCount,
                                name: buyableItem.name + ' certificate',
                                price: buyableItem.price
                            });
                            
                            printInfo(`[TRADE] AI '${this.username}' - Accepting ${acceptCount}x ${buyableItem.name} certificate for ${itemValue} gold`);
                        }
                        
                        // Continue to the next item
                        continue;
                    }
                }
                
                // Standard case: direct item ID match
                let buyableItem = this._currentBuyingItems.length > 0 ? 
                    this._currentBuyingItems[0].id === offeredItem.id ? this._currentBuyingItems[0] : undefined :
                    undefined;
                    
                // If no direct match, check if this is a certificate of our desired item
                if (!buyableItem && this._currentBuyingItems.length > 0) {
                    const certId = this.getCertificateId(this._currentBuyingItems[0].id);
                    if (certId === offeredItem.id) {
                        // We found a certificate of our desired item
                        buyableItem = this._currentBuyingItems[0];
                        printInfo(`[TRADE] AI '${this.username}' - Detected certificate for ${buyableItem.name}`);
                    }
                }
                
                if (buyableItem) {
                    // Calculate how many we can accept (limited by our max count)
                    const remainingCapacity = buyableItem.maxCount - buyableItem.currentCount;
                    // Cap the count to prevent overflow bugs
                    const acceptCount = Math.min(Math.min(offeredItem.count, remainingCapacity), MAX_ACCEPTABLE_COUNT);
                    
                    if (acceptCount > 0) {
                        // Calculate the value for this item
                        const itemValue = acceptCount * buyableItem.price;
                        totalValue += itemValue;
                        
                        // Add to accepted items
                        acceptedItems.push({
                            id: offeredItem.id,
                            count: acceptCount,
                            name: buyableItem.name,
                            price: buyableItem.price
                        });
                        
                        printInfo(`[TRADE] AI '${this.username}' - Accepting ${acceptCount}x ${buyableItem.name} for ${itemValue} gold`);
                    }
                }
            }
        } catch (err) {
            // If anything goes wrong, log it and return empty values
            printError(`[TRADE] AI '${this.username}' - Error evaluating player offer: ${err}`);
            return { totalValue: 0, acceptedItems: [] };
        }
        
        return { totalValue, acceptedItems };
    }
    
    /**
     * Get certificate ID for a given item ID
     * In the RSC item system, certificates typically have itemId + 1
     */
    private getCertificateId(itemId: number): number {
        // In general, certificates are itemId + 1, but we can also have specific mappings for exceptions
        
        // First check if this item can be certificated at all
        if (!this.canItemBeCertificated(itemId)) {
            return -1;
        }
        
        // Special mappings for herbs and other items that might not follow the pattern
        const specialCertMappings: { [key: number]: number } = {
            // Clean herbs (actual ID -> cert ID)
            249: 250, // Guam leaf -> cert_guam_leaf
            251: 252, // Marrentill -> cert_marrentill
            253: 254, // Tarromin -> cert_tarromin
            255: 256, // Harralander -> cert_harralander
            257: 258, // Ranarr weed -> cert_ranarr_weed
            259: 260, // Irit leaf -> cert_irit_leaf
            261: 262, // Avantoe -> cert_avantoe
            263: 264, // Kwuarm -> cert_kwuarm
            265: 266, // Cadantine -> cert_cadantine
            267: 268, // Dwarf weed -> cert_dwarf_weed
            269: 270, // Torstol -> cert_torstol
            
            // Unidentified herbs
            199: 200, // Unidentified herb (guam) -> cert
            201: 202, // Unidentified herb (marrentill) -> cert
            203: 204, // Unidentified herb (tarromin) -> cert
            205: 206, // Unidentified herb (harralander) -> cert
            207: 208, // Unidentified herb (ranarr) -> cert
            209: 210, // Unidentified herb (irit) -> cert
            211: 212, // Unidentified herb (avantoe) -> cert
            213: 214, // Unidentified herb (kwuarm) -> cert
            215: 216, // Unidentified herb (cadantine) -> cert
            217: 218, // Unidentified herb (dwarf weed) -> cert
            219: 220, // Unidentified herb (torstol) -> cert
            
            // Fish - raw
            317: 318, // Raw shrimps -> cert_raw_shrimps
            321: 322, // Raw anchovies -> cert_raw_anchovies
            327: 328, // Raw sardine -> cert_raw_sardine
            331: 332, // Raw salmon -> cert_raw_salmon
            335: 336, // Raw trout -> cert_raw_trout
            341: 342, // Raw cod -> cert_raw_cod
            345: 346, // Raw herring -> cert_raw_herring
            349: 350, // Raw pike -> cert_raw_pike
            353: 354, // Raw mackerel -> cert_raw_mackerel
            359: 360, // Raw tuna -> cert_raw_tuna
            363: 364, // Raw bass -> cert_raw_bass
            371: 372, // Raw swordfish -> cert_raw_swordfish
            377: 378, // Raw lobster -> cert_raw_lobster
            383: 384, // Raw shark -> cert_raw_shark
            389: 390, // Raw manta ray -> cert_raw_manta_ray
            395: 396, // Raw sea turtle -> cert_raw_sea_turtle
            
            // Fish - cooked
            315: 316, // Shrimps -> cert_shrimps
            319: 320, // Anchovies -> cert_anchovies
            325: 326, // Sardine -> cert_sardine
            329: 330, // Salmon -> cert_salmon
            333: 334, // Trout -> cert_trout
            339: 340, // Cod -> cert_cod
            347: 348, // Herring -> cert_herring
            351: 352, // Pike -> cert_pike
            355: 356, // Mackerel -> cert_mackerel
            361: 362, // Tuna -> cert_tuna
            365: 366, // Bass -> cert_bass
            373: 374, // Swordfish -> cert_swordfish
            379: 380, // Lobster -> cert_lobster
            385: 386, // Shark -> cert_shark
            391: 392, // Manta ray -> cert_manta_ray
            397: 398, // Sea turtle -> cert_sea_turtle
            
            // Burnt fish
            323: 324, // Burnt shrimp/anchovies -> cert
            343: 344, // Burnt salmon/trout/carp/cod/pike -> cert
            357: 358, // Burnt mackerel -> cert
            367: 368, // Burnt tuna/bass -> cert
            369: 370, // Burnt sardine -> cert
            375: 376, // Burnt swordfish -> cert
            381: 382, // Burnt lobster -> cert
            387: 388, // Burnt shark -> cert
            393: 394, // Burnt manta ray -> cert
            399: 400  // Burnt sea turtle -> cert
        };
        
        // Check if we have a special mapping
        if (specialCertMappings[itemId] !== undefined) {
            return specialCertMappings[itemId];
        }
        
        // Default pattern (itemId + 1)
        return itemId + 1;
    }

    /**
     * Clear our current trade offer
     */
    private clearTradeOffer(): void {
        // tempinv is ID 90
        const INVENTORY_SLOT_COUNT = 28;
        let itemsCleared = 0;
        
        for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
            const item = this.invGetSlot(90, i);
            if (item && item.id) {
                this.invDelSlot(90, i);
                itemsCleared++;
            }
        }
        
        if (itemsCleared > 0) {
            printInfo(`[TRADE] AI '${this.username}' - Cleared ${itemsCleared} items from trade window`);
        }
    }

    /**
     * Offer gold in exchange for items
     */
    private async offerGoldForItems(goldAmount: number): Promise<void> {
        try {
            // Safety check - ensure gold amount is valid
            if (goldAmount <= 0 || goldAmount > 2000000000) { // Max 32-bit int to avoid overflow
                printInfo(`[TRADE] AI '${this.username}' - Invalid gold amount requested: ${goldAmount}`);
                return;
            }
            
            // Check if we already have the exact amount of gold in the trade window
            const INVENTORY_SLOT_COUNT = 28;
            const COINS_ID = 995;
            let goldInTradeWindow = 0;
            
            // Check how much gold is already in the trade window
            for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                const item = this.invGetSlot(90, i);
                if (item && item.id === COINS_ID) {
                    goldInTradeWindow += item.count;
                }
            }
            
            // If we already have the exact amount, no need to update
            if (goldInTradeWindow === goldAmount) {
                printInfo(`[TRADE] AI '${this.username}' - Trade window already has ${goldAmount} gold, no update needed`);
                return;
            }
            
            // Find gold in our inventory
            let foundSlot = -1;
            let totalGoldInInventory = 0;
            
            // First check how much gold we have in total
            for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                const item = this.invGetSlot(93, i);
                if (item && item.id === COINS_ID) {
                    foundSlot = foundSlot === -1 ? i : foundSlot; // Keep track of first slot with gold
                    totalGoldInInventory += item.count;
                }
            }
            
            // Check if we have enough gold
            if (totalGoldInInventory < goldAmount) {
                // If we don't have enough, add more gold to our inventory
                const goldNeeded = goldAmount - totalGoldInInventory;
                printInfo(`[TRADE] AI '${this.username}' - Adding ${goldNeeded} more gold to inventory`);
                this.invAdd(93, COINS_ID, goldNeeded);
                // Update our first gold slot if we didn't have any before
                if (foundSlot === -1) {
                    for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                        const item = this.invGetSlot(93, i);
                        if (item && item.id === COINS_ID) {
                            foundSlot = i;
                            break;
                        }
                    }
                }
            }
            
            // Safety check - ensure we found gold
            if (foundSlot === -1) {
                printInfo(`[TRADE] AI '${this.username}' - Could not find gold in inventory even after adding more`);
                // Force add gold to inventory at slot 0
                this.invSet(93, COINS_ID, goldAmount, 0);
                foundSlot = 0;
            }
            
            // Now offer the gold to the trade window (with error handling)
            try {
                printInfo(`[TRADE] AI '${this.username}' - Offering ${goldAmount} gold for trade (replacing ${goldInTradeWindow})`);
                
                // Try different methods to add gold to trade
                // Method 1: Add to first empty slot in trade window
                let success = false;
                let emptySlot = -1;
                
                for (let i = 0; i < INVENTORY_SLOT_COUNT; i++) {
                    const item = this.invGetSlot(90, i);
                    if (!item || !item.id) {
                        emptySlot = i;
                        break;
                    }
                }
                
                if (emptySlot !== -1) {
                    try {
                        // Set the gold in the first empty slot
                        this.invSet(90, COINS_ID, goldAmount, emptySlot);
                        success = true;
                        printInfo(`[TRADE] AI '${this.username}' - Added gold to trade window at slot ${emptySlot}`);
                    } catch (err) {
                        printError(`[TRADE] AI '${this.username}' - Error setting gold at slot ${emptySlot}: ${err}`);
                    }
                }
                
                // Method 2: If we couldn't find an empty slot or setting failed, try adding directly
                if (!success) {
                    try {
                        this.invAdd(90, COINS_ID, goldAmount);
                        success = true;
                        printInfo(`[TRADE] AI '${this.username}' - Added gold to trade window using invAdd`);
                    } catch (err) {
                        printError(`[TRADE] AI '${this.username}' - Error adding gold using invAdd: ${err}`);
                    }
                }
                
                // Method 3: If both previous methods failed, try moving from inventory
                if (!success) {
                    try {
                        // Use the safe moveFromSlot wrapper that prevents NPEs
                        this.safeInvMoveFromSlot(93, 90, foundSlot, goldAmount);
                        success = true;
                        printInfo(`[TRADE] AI '${this.username}' - Added gold to trade window using moveFromSlot`);
                    } catch (err) {
                        printError(`[TRADE] AI '${this.username}' - Error moving gold using moveFromSlot: ${err}`);
                    }
                }
                
                if (success) {
                    printInfo(`[TRADE] AI '${this.username}' - Successfully updated gold in trade window from ${goldInTradeWindow} to ${goldAmount}`);
                } else {
                    printError(`[TRADE] AI '${this.username}' - Failed to add gold to trade window after trying all methods`);
                }
            } catch (err) {
                printError(`[TRADE] AI '${this.username}' - Error adding gold to trade window: ${err}`);
            }
        } catch (err) {
            printError(`[TRADE] AI '${this.username}' - Error offering gold: ${err}`);
        }
    }
    
    /**
     * Safe wrapper for invMoveFromSlot that handles potential errors
     * This ensures we don't crash if the fromSlot doesn't exist
     */
    private safeInvMoveFromSlot(fromInv: number, toInv: number, fromSlot: number, count: number): boolean {
        try {
            // First check if there's an item in the fromSlot
            const fromObj = this.invGetSlot(fromInv, fromSlot);
            if (!fromObj || !fromObj.id) {
                printInfo(`[TRADE] AI '${this.username}' - No item at slot ${fromSlot} in inventory ${fromInv}`);
                return false;
            }
            
            // Check if we need to split stack
            if (fromObj.count > count) {
                // We need to split the stack - first remove what we want from source
                this.invDelSlot(fromInv, fromSlot);
                
                // Add the amount we want to move to the target inventory
                this.invAdd(toInv, fromObj.id, count);
                
                // And put back the remainder in the source inventory
                this.invSet(fromInv, fromObj.id, fromObj.count - count, fromSlot);
                
                return true;
            } else {
                // We can move the whole stack
                const result = this.invMoveFromSlot(fromInv, toInv, fromSlot);
                return result.overflow === 0;
            }
        } catch (err) {
            printError(`[TRADE] AI '${this.username}' - Error in safeInvMoveFromSlot: ${err}`);
            return false;
        }
    }
    
    /**
     * Update our item counts after a successful trade
     */
    private updateItemCounts(acceptedItems: { id: number; count: number; name: string; price: number }[]): void {
        // Update our current item counts
        for (const acceptedItem of acceptedItems) {
            const buyableItem = this._merchantBuyList.find(item => item.id === acceptedItem.id);
            if (buyableItem) {
                buyableItem.currentCount += acceptedItem.count;
                printInfo(`[TRADE] AI '${this.username}' - Updated count for ${buyableItem.name} to ${buyableItem.currentCount}`);
                
                // If we've reached our max, possibly update our buying list
                if (buyableItem.currentCount >= buyableItem.maxCount) {
                    printInfo(`[TRADE] AI '${this.username}' - Reached max count for ${buyableItem.name}`);
                    
                    // 50% chance to select new items to buy if we've reached max
                    if (Math.random() < 0.5) {
                        this.selectRandomItemsToBuy();
                    }
                }
            }
        }
    }

    private async acceptFirstScreen(partner: PlayerClass): Promise<void> {
        try {
            // Set our trade status, this is what actually accepts the trade.
            this.setVar(258, 1); // 258 is the tradestatus var ID
            // Try to set the trade status text anyway (might work sometimes)
            partner.write(new IfSetText(3431, 'Other player has accepted.'));
        } catch (err) {
            printError(`[TRADE] AI '${this.username}' - ACCEPT: Error accepting trade: ${err}`);
        }
    }
    
    /**
     * Set the maximum number of items to buy at once
     */
    public setMaxBuyItems(count: number): void {
        this._maxBuyItems = count;
        printInfo(`AIPlayer: '${this.username}' max buy items set to ${count}`);
        // Re-select random items
        this.selectRandomItemsToBuy();
    }
} 
