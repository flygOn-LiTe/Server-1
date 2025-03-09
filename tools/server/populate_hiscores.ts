import fs from 'fs';

import InvType from '#/cache/config/InvType.js';
import { db } from '#/db/query.js';
import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import { PlayerStatEnabled } from '#/engine/entity/PlayerStat.js';
import Packet from '#/io/Packet.js';

InvType.load('data/pack');

export async function updateHiscores(profile: any) {
    console.time(`hiscores-${profile}`);
    const players = fs.readdirSync(`data/players/${profile}`);
    for (const file of players) {
        try {
            const username = file.slice(0, -4);
            const player = PlayerLoading.load(username, Packet.load(`data/players/${profile}/${file}`), null);
            let account = await db.selectFrom('account').selectAll().where('username', '=', player.username).executeTakeFirst();

            if (!account) {
                // Create account if missing (testing)
                await db
                    .insertInto('account')
                    .values({
                        username: player.username,
                        password: ''
                    })
                    .execute();

                account = await db.selectFrom('account').selectAll().where('username', '=', player.username).executeTakeFirstOrThrow();
            }

            if (account.staffmodlevel > 1 || (account.banned_until !== null && new Date(account.banned_until) > new Date())) {
                // Remove banned players from hiscores
                await db.deleteFrom('hiscore').where('account_id', '=', account.id).execute();
                await db.deleteFrom('hiscore_large').where('account_id', '=', account.id).execute();
                continue;
            }

            const insert = [];
            const update = [];

            let totalXp = 0;
            let totalLevel = 0;
            for (let i = 0; i < player.stats.length; i++) {
                if (!PlayerStatEnabled[i]) continue;
                totalXp += player.stats[i];
                totalLevel += player.baseLevels[i];
            }

            const existing = await db.selectFrom('hiscore_large').select('type').select('value').where('account_id', '=', account.id).where('type', '=', 0).where('profile', '=', profile).executeTakeFirst();

            if (existing && existing.value !== totalXp) {
                await db
                    .updateTable('hiscore_large')
                    .set({
                        type: 0,
                        level: totalLevel,
                        value: totalXp
                    })
                    .where('account_id', '=', account.id)
                    .where('type', '=', 0)
                    .where('profile', '=', profile)
                    .execute();
            } else if (!existing) {
                await db
                    .insertInto('hiscore_large')
                    .values({
                        account_id: account.id,
                        profile,
                        type: 0,
                        level: totalLevel,
                        value: totalXp
                    })
                    .execute();
            }

            for (let stat = 0; stat < player.stats.length; stat++) {
                if (!PlayerStatEnabled[stat]) continue;

                if (player.baseLevels[stat] >= 15) {
                    const hiscoreType = stat + 1;
                    const existingStat = await db.selectFrom('hiscore').select('type').select('value').where('account_id', '=', account.id).where('type', '=', hiscoreType).where('profile', '=', profile).executeTakeFirst();
                    if (existingStat && existingStat.value !== player.stats[stat]) {
                        update.push({
                            type: hiscoreType,
                            level: player.baseLevels[stat],
                            value: player.stats[stat]
                        });
                    } else if (!existingStat) {
                        insert.push({
                            account_id: account.id,
                            profile,
                            type: hiscoreType,
                            level: player.baseLevels[stat],
                            value: player.stats[stat]
                        });
                    }
                }
            }

            if (insert.length > 0) {
                await db.insertInto('hiscore').values(insert).execute();
            }
            for (let i = 0; i < update.length; i++) {
                await db.updateTable('hiscore').set(update[i]).where('account_id', '=', account.id).where('type', '=', update[i].type).where('profile', '=', profile).execute();
            }
        } catch (err) {
            if (err instanceof Error) {
                console.error(file, err.message);
                console.error(err.stack);
            }
        }
    }
    console.timeEnd(`hiscores-${profile}`);
}

export async function updateAllHiscores() {
    // List all directories in data/players (each directory represents a profile)
    const profiles = fs.readdirSync('data/players');
    for (const profile of profiles) {
        const path = `data/players/${profile}`;
        if (!fs.lstatSync(path).isDirectory()) continue;
        console.log(`Updating hiscores for profile: ${profile}`);
        await updateHiscores(profile);
    }
}

// If running this file directly, update all hiscores.
if (require.main === module) {
    updateAllHiscores()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Error updating all hiscores:', err);
            process.exit(1);
        });
}
