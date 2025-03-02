import path from 'path';
import fsp from 'fs/promises';
import { db } from '#/db/query.ts';
import { sql } from 'kysely'; // ✅ Import sql helper

const SAVE_DIRECTORY = 'data/players/main';

export async function ensureTableExists() {
    try {
        await db.schema
            .createTable('player_saves')
            .ifNotExists()
            .addColumn('id', 'integer', col => col.primaryKey().autoIncrement()) // ✅ Correct integer type
            .addColumn('username', 'varchar(255)', col => col.notNull().unique()) // ✅ Explicit length
            .addColumn('save_data', 'blob', col => col.notNull()) // ✅ Use "blob" instead of "longblob"
            .addColumn(
                'last_updated',
                'timestamp',
                col => col.defaultTo(sql`CURRENT_TIMESTAMP`).onUpdate(sql`CURRENT_TIMESTAMP`) // ✅ Use sql`` for raw SQL
            )
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
