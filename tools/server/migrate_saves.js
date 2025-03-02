import path from 'path';
import fsp from 'fs/promises';
import { db } from '#/db/query.js';

const SAVE_DIRECTORY = 'data/players/main';

async function ensureTableExists() {
    try {
        await db.executeQuery(`
            CREATE TABLE IF NOT EXISTS player_saves (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                save_data LONGBLOB NOT NULL,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Table 'player_saves' is ready.");
    } catch (err) {
        console.error('Error ensuring table exists:', err);
        process.exit(1); // Exit if table creation fails
    }
}

async function migrateSaveFiles() {
    try {
        const files = await fsp.readdir(SAVE_DIRECTORY);

        for (const file of files) {
            if (!file.endsWith('.sav')) continue; // Skip non-save files

            const username = file.replace('.sav', ''); // Extract username from file name
            const filePath = path.join(SAVE_DIRECTORY, file);

            try {
                const saveData = await fsp.readFile(filePath);

                // Insert or update into MySQL
                await db
                    .insertInto('player_saves')
                    .values({
                        username,
                        save_data: saveData
                    })
                    .onDuplicateKeyUpdate({
                        save_data: saveData, // Update existing save file
                        last_updated: new Date()
                    })
                    .execute();

                console.log(`✅ Successfully migrated: ${username}.sav`);
            } catch (err) {
                console.error(`Failed to migrate: ${username}.sav`, err);
            }
        }

        console.log('🎉 Migration completed!');
    } catch (err) {
        console.error('Error reading save files:', err);
    }
}

(async () => {
    await ensureTableExists();
    await migrateSaveFiles();
})();
