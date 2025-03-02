import path from 'path';
import fsp from 'fs/promises';
import { db } from '#/db/query.ts';

const SAVE_DIRECTORY = 'data/players/main';

export async function ensureTableExists() {
    try {
        await db.schema
            .createTable('player_saves')
            .ifNotExists()
            .addColumn('id', 'integer', col => col.primaryKey().autoIncrement()) // ✅ Use "integer" instead of "int"
            .addColumn('username', 'varchar(255)', col => col.notNull().unique()) // ✅ Define length explicitly inside varchar()
            .addColumn('save_data', 'longblob', col => col.notNull()) // ✅ Ensure binary format for save files
            .addColumn('last_updated', 'timestamp', col => col.defaultTo(db.raw('CURRENT_TIMESTAMP')).onUpdate(db.raw('CURRENT_TIMESTAMP'))) // ✅ Use raw SQL for timestamp defaulting
            .execute();

        console.log("✅ Table 'player_saves' is ready.");
    } catch (err) {
        console.error('Error ensuring table exists:', err);
        process.exit(1);
    }
}

export async function migrateSaveFiles() {
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

                console.log(`Successfully migrated: ${username}.sav`);
            } catch (err) {
                console.error(`Failed to migrate: ${username}.sav`, err);
            }
        }

        console.log('🎉 Migration completed!');
    } catch (err) {
        console.error('Error reading save files:', err);
    }
}
