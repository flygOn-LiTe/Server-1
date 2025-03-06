import fs from 'fs';
import { db } from '#/db/query.js';

import { PlayerLoading } from '#/engine/entity/PlayerLoading.js';
import Packet from '#/io/Packet.js';
import InvType from '#/cache/config/InvType.js';
import { PlayerStatEnabled } from '#/engine/entity/PlayerStat.js';

InvType.load('data/pack');

const SAVE_DIRECTORY = 'data/players/main';

export async function populateHiscores() {
    console.log('🏆 Populating hiscores...');

    try {
        const files = fs.readdirSync(SAVE_DIRECTORY);

        for (const file of files) {
            if (!file.endsWith('.sav')) continue; // Skip non-save files

            const username = file.replace('.sav', '');
            const filePath = `${SAVE_DIRECTORY}/${file}`;

            try {
                const player = PlayerLoading.load(username, Packet.load(filePath), null);
                let account = await db.selectFrom('account').selectAll().where('username', '=', player.username).executeTakeFirst();

                if (!account) {
                    // Create account if missing (test case)
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

                // Update or insert total XP
                const existingXp = await db.selectFrom('hiscore_large').select('value').where('account_id', '=', account.id).where('type', '=', 0).where('profile', '=', 'main').executeTakeFirst();
                if (existingXp && existingXp.value !== totalXp) {
                    await db
                        .updateTable('hiscore_large')
                        .set({
                            level: totalLevel,
                            value: totalXp
                        })
                        .where('account_id', '=', account.id)
                        .where('type', '=', 0)
                        .where('profile', '=', 'main')
                        .execute();
                } else if (!existingXp) {
                    await db
                        .insertInto('hiscore_large')
                        .values({
                            account_id: account.id,
                            profile: 'main',
                            type: 0,
                            level: totalLevel,
                            value: totalXp
                        })
                        .execute();
                }

                // Insert or update individual skill hiscores
                for (let stat = 0; stat < player.stats.length; stat++) {
                    if (!PlayerStatEnabled[stat]) continue;

                    if (player.baseLevels[stat] >= 15) {
                        const hiscoreType = stat + 1;

                        const existingStat = await db.selectFrom('hiscore').select('value').where('account_id', '=', account.id).where('type', '=', hiscoreType).where('profile', '=', 'main').executeTakeFirst();
                        if (existingStat && existingStat.value !== player.stats[stat]) {
                            update.push({
                                type: hiscoreType,
                                level: player.baseLevels[stat],
                                value: player.stats[stat]
                            });
                        } else if (!existingStat) {
                            insert.push({
                                account_id: account.id,
                                profile: 'main',
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

                for (const entry of update) {
                    await db.updateTable('hiscore').set(entry).where('account_id', '=', account.id).where('type', '=', entry.type).where('profile', '=', 'main').execute();
                }

                console.log(`✅ Updated hiscores for: ${username}`);
            } catch (err) {
                console.error(`❌ Failed to process hiscores for: ${file}`, err);
            }
        }

        console.log('🎉 Hiscores population completed!');
    } catch (err) {
        console.error('❌ Error reading save files:', err);
    }
}
