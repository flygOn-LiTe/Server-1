import fs from 'fs';

import { CronJob } from 'cron';
import { collectDefaultMetrics, register } from 'prom-client';

import { packClient, packServer } from '#/cache/PackAll.js';
import World from '#/engine/World.js';
import TcpServer from '#/server/tcp/TcpServer.js';
import WSServer from '#/server/ws/WSServer.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';
import { updateCompiler } from '#/util/RuneScriptCompiler.js';
import { createWorker } from '#/util/WorkerFactory.js';
import { startManagementWeb, startWeb, web } from '#/web.js';
import { populateHiscores } from '#tools/server/populate_hiscores.js';

// Import MerchantPlayer2 after all the "#" imports
import MerchantPlayer2 from './engine/entity/ai/MerchantPlayer2.js';
// Import MerchantPlayer3 for buyers
import MerchantPlayer3 from './engine/entity/ai/MerchantPlayer3.js';

if (Environment.BUILD_STARTUP_UPDATE) {
    await updateCompiler();
}

if (!fs.existsSync('data/pack/client/config') || !fs.existsSync('data/pack/server/script.dat')) {
    printInfo('Packing cache, please wait until you see the world is ready.');

    try {
        await packServer();
        await packClient();
    } catch (err) {
        if (err instanceof Error) {
            printError(err.message);
        }

        process.exit(1);
    }
}

if (Environment.EASY_STARTUP) {
    createWorker('./login.ts');
    createWorker('./friend.ts');
    createWorker('./logger.ts');
}

await World.start();

setTimeout(() => {
    try {
        printInfo('Spawning AI players for testing...');
        
        // Create realistic player-like usernames for merchants
        const merchantNames = [
            'zezima', 'dragonslyr92', 'pk_master55', 'max_cape', 'knight2983',
            'mage_pk_god', 'mining99', 'woodcut_king', 'rich_mercher', 'rune_4ever',
            'lvl_126', 'legend_cape', 'smithing_pro', 'mith_dragon', 'phat_owner',
            'cool_pker123', 'herblore_guy', 'xXshadowXx', 'pure_str_99', 'quest_cape',
            'blue_phat', 'l33t_skills', 'combat_120', 'magic_lvl_90', 'noob_slayer',
            'slayer_king', 'pure_ranger', 'str_pure42', 'divine_mage', 'dragon_hunter',
            'fire_maker', 'fishing_pro', 'cooking_cape', 'herb_master', 'agility_99'
        ];
        
        // Create buyer (MerchantPlayer3) usernames
        const buyerNames = [
            'item_buyer', 'ore_dealer', 'rune_buyer', 'resource_man', 'trader_joe',
            'gold_4_stuff', 'bank_maker', 'cash_4_items', 'top_prices', 'need_goods',
            'material_guy', 'skiller_needs', 'merch_buyer', 'supply_agent', 'bargain_hunt',
            'resource_king', 'wealth_trader', 'grand_buyer', 'log_collector', 'herb_buyer',
            'quick_cash', 'easy_money', 'ruby_dealer', 'diamond_man', 'sapphire_pro',
            'emerald_guy', 'bulk_trader', 'collector99', 'rare_buyer', 'phat_hunter'
        ];
        
        // Define all coordinates for merchants in Varrock
        const merchantCoords = [
            [3183, 3431], [3181, 3444], [3185, 3443], [3179, 3430], [3183, 3443],
            [3184, 3436], [3183, 3428], [3176, 3434], [3185, 3446], [3181, 3443],
            [3180, 3445], [3181, 3446], [3180, 3446], [3176, 3430], [3178, 3434],
            [3177, 3440], [3180, 3428], [3183, 3432], [3180, 3437], [3183, 3441],
            [3182, 3443], [3181, 3444], [3181, 3446], [3185, 3438], [3184, 3436]
        ];
        
        // Add additional Falador merchant coordinates
        const faladorCoords = [
            [3012, 3356], [3013, 3360], [3010, 3356], [3011, 3359], [3016, 3359],
            [3013, 3356], [3018, 3356], [3010, 3358], [3013, 3355], [3011, 3355]
        ];
        
        // Define Varrock buyer coordinates (spread near merchantCoords but not on top)
        const varrockBuyerCoords = [
            [3187, 3429], [3189, 3435], [3190, 3440], [3174, 3431], [3177, 3437],
            [3174, 3440], [3175, 3444], [3188, 3445], [3180, 3449], [3183, 3450],
            [3192, 3441], [3186, 3439], [3179, 3443], [3175, 3429], [3187, 3425]
        ];
        
        // Define Falador buyer coordinates (spread near faladorCoords but not on top)
        const faladorBuyerCoords = [
            [3018, 3352], [3014, 3352], [3008, 3354], [3006, 3358], [3007, 3362],
            [3010, 3362], [3016, 3362], [3020, 3360], [3022, 3356], [3019, 3353],
            [3011, 3350], [3008, 3351], [3006, 3356], [3017, 3365], [3022, 3362]
        ];
        
        // Spawn merchants at each coordinate with a unique player-like name
        printInfo('Spawning merchants in Varrock...');
        for (let i = 0; i < merchantCoords.length; i++) {
            const [x, z] = merchantCoords[i];
            // Use names as-is without adding numbers to keep them looking like real players
            const name = merchantNames[i % merchantNames.length];
            MerchantPlayer2.spawnMerchant(name, x, z);
            printInfo(`Spawned merchant '${name}' at (${x}, ${z})`);
        }
        
        // Spawn merchants in Falador
        printInfo('Spawning merchants in Falador...');
        for (let i = 0; i < faladorCoords.length; i++) {
            const [x, z] = faladorCoords[i];
            // Use different set of names for Falador merchants by offsetting in the array
            const nameIndex = (i + merchantCoords.length) % merchantNames.length;
            const name = merchantNames[nameIndex];
            MerchantPlayer2.spawnMerchant(name, x, z);
            printInfo(`Spawned merchant '${name}' at (${x}, ${z})`);
        }
        
        // Spawn buyers in Varrock
        printInfo('Spawning buyers in Varrock...');
        for (let i = 0; i < varrockBuyerCoords.length; i++) {
            const [x, z] = varrockBuyerCoords[i];
            const name = buyerNames[i % buyerNames.length];
            MerchantPlayer3.spawnBuyer(name, x, z);
            printInfo(`Spawned buyer '${name}' at (${x}, ${z})`);
        }
        
        // Spawn buyers in Falador
        printInfo('Spawning buyers in Falador...');
        for (let i = 0; i < faladorBuyerCoords.length; i++) {
            const [x, z] = faladorBuyerCoords[i];
            const nameIndex = (i + varrockBuyerCoords.length) % buyerNames.length;
            const name = buyerNames[nameIndex];
            MerchantPlayer3.spawnBuyer(name, x, z);
            printInfo(`Spawned buyer '${name}' at (${x}, ${z})`);
        }
        
    } catch (err) {
        printError(`Error spawning AI players: ${err}`);
    }
}, 5000); // Wait 5 seconds after world start

const tcpServer = new TcpServer();
tcpServer.start();

const wsServer = new WSServer();
wsServer.start(web);

startWeb();
startManagementWeb();

register.setDefaultLabels({ nodeId: Environment.NODE_ID });
collectDefaultMetrics({ register });

const SERVICE_NAME = process.env.RAILWAY_SERVICE_NAME || 'Unknown';

if (SERVICE_NAME === 'Server-1') {
    console.log(`🚀 Hiscores cron job is running on ${SERVICE_NAME}`);

    const job = new CronJob(
        '*/5 * * * *', // Runs every 5 minutes
        async function () {
            await populateHiscores();
        },
        null, // onComplete callback (optional)
        true, // Start immediately
        'America/Los_Angeles' // Timezone
    );

    console.log(`⏳ Hiscores cron job scheduled to run every 5 minutes.${job} on ${SERVICE_NAME}`);
} else {
    console.log(`⏳ Skipping hiscores cron job on ${SERVICE_NAME}`);
}

// unfortunately, tsx watch is not giving us a way to gracefully shut down in our dev mode:
// https://github.com/privatenumber/tsx/issues/494
let exiting = false;
function safeExit() {
    if (exiting) {
        return;
    }

    exiting = true;
    World.rebootTimer(0);
}

process.on('SIGINT', safeExit);
process.on('SIGTERM', safeExit);
