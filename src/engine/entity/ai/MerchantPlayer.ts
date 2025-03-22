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

export default class MerchantPlayer extends PlayerClass {
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
    /**
     * Create a new AI player at the specified coordinates
     * @param username The username for this AI player
     * @param x The x coordinate to spawn the AI at
     * @param z The z coordinate to spawn the AI at
     * @param level The level to spawn the AI at (default: 0 for ground level)
     */
    constructor(username: string, x: number = 3222, z: number = 3218, level: number = 0) {
        // Calculate proper username hashes using static methods
        const username37 = MerchantPlayer.calculateUsername37(username);
        const hash64 = MerchantPlayer.calculateHash64(username);

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

                // Teleport to the desired location
                this.teleport(3182, 3438, 0);
                printInfo(`AIPlayer: "${this.username}" teleported to (3182, 3438, 0)`);

                // Start the heartbeat to prevent timeout
                this.startHeartbeat();

                setInterval(() => {
                    this.say('Free Junk!');
                }, 5000);

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
    public static spawn(username: string, x: number, z: number): MerchantPlayer {
        printInfo(`AIPlayer: Creating player "${username}" in Lumbridge at (${x}, ${z})`);
        const player = new MerchantPlayer(username, x, z, 0);
        player.activate();

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
     * Equips this AI player with tradeable items for trade demonstration
     * @param itemIds Array of item IDs to add to inventory
     */
    /**
     * Set items that this AI player will offer in trades
     * @param items Array of items with id and count
     */
    public setTradeItems(items: { id: number; count: number }[]): void {
        this._tradeItems = [...items];
        printInfo(`AIPlayer: "${this.username}" trade items set to ${JSON.stringify(this._tradeItems)}`);
    }
    public async addTradeableItems(itemIds: number[] = []): Promise<void> {
        try {
            // Use specific items 303 and 1265 regardless of what was passed in
            const specificItems = [303, 1265];

            printInfo(`AIPlayer: "${this.username}" adding specific tradeable items to inventory (303 and 1265)`);

            // Add each item to inventory (just one of each)
            for (const itemId of specificItems) {
                // Always add exactly 1 of each item
                this.invAdd(93, itemId, 1);
                printInfo(`AIPlayer: "${this.username}" added 1x item ${itemId} to inventory`);
            }

            // Configure these specific items to be offered in trades
            const tradeItems = [
                { id: 303, count: 1 },
                { id: 1265, count: 1 }
            ];

            // Set the trade items configuration
            this.setTradeItems(tradeItems);

            // List inventory after adding items
            const INVENTORY_SLOT_COUNT = 28;
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
            this._itemsOffered = false;
            await this.addTradeableItems();
            // Set partner as target and use the proper opcode (OPPLAYER4 = trade) This is what actually opens the trade
            this.target = partner;
            this.targetOp = ServerTriggerType.OPPLAYER4;
            //instead of delay here, find a way to check if trade window is open.
            await this.delay(1500);
            await this.offerTradeItems();
            await this.delay(500);
            await this.acceptFirstScreen(partner);
            await this.waitForTradeAcceptance();
            await this.acceptTradeConfirmation();
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
}
