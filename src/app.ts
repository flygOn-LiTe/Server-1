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
            'blue_phat', 'l33t_skills', 'combat_120', 'magic_lvl_90', 'noob_slayer'
        ];
        
        // Define all coordinates for merchants
        const merchantCoords = [
            [3183, 3431], [3181, 3444], [3185, 3443], [3179, 3430], [3183, 3443],
            [3184, 3436], [3183, 3428], [3176, 3434], [3185, 3446], [3181, 3443],
            [3180, 3445], [3181, 3446], [3180, 3446], [3176, 3430], [3178, 3434],
            [3177, 3440], [3180, 3428], [3183, 3432], [3180, 3437], [3183, 3441],
            [3182, 3443], [3181, 3444], [3181, 3446], [3185, 3438], [3184, 3436]
        ];
        
        // Spawn merchants at each coordinate with a unique player-like name
        for (let i = 0; i < merchantCoords.length; i++) {
            const [x, z] = merchantCoords[i];
            // Use names as-is without adding numbers to keep them looking like real players
            const name = merchantNames[i % merchantNames.length];
            MerchantPlayer2.spawnMerchant(name, x, z);
            printInfo(`Spawned merchant "${name}" at (${x}, ${z})`);
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

    try {
        if (!Environment.EASY_STARTUP && !Environment.NODE_DEBUG) {
            World.rebootTimer(Environment.NODE_KILLTIMER as number);
        } else {
            World.rebootTimer(0);
        }
    } catch (err) {
        console.error(err);
    }
}

process.on('SIGINT', safeExit);
process.on('SIGTERM', safeExit);
