import fs from 'fs';

import { CronJob } from 'cron';
import { collectDefaultMetrics, register } from 'prom-client';

import { packClient, packServer } from '#/cache/PackAll.js';
import AIPlayer from '#/engine/entity/ai/AIPlayer.js';
import MerchantPlayer from '#/engine/entity/ai/MerchantPlayer.js';
import World from '#/engine/World.js';
import TcpServer from '#/server/tcp/TcpServer.js';
import WSServer from '#/server/ws/WSServer.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';
import { updateCompiler } from '#/util/RuneScriptCompiler.js';
import { createWorker } from '#/util/WorkerFactory.js';
import { startManagementWeb, startWeb, web } from '#/web.js';
import { populateHiscores } from '#tools/server/populate_hiscores.js';

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
        // Create and spawn two AI players in Lumbridge
        const ai1 = MerchantPlayer.spawn('MerchantTester1', 3182, 3438); // Lumbridge center
        const ai2 = AIPlayer.spawn('MerchantTester1', 3182, 3438); // Lumbridge center
        if (ai1 && ai2) {
            printInfo('AI players spawned successfully');
            printInfo(`Total players in world: ${World.getTotalPlayers()}`);
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
