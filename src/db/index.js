import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs-extra';
import { PROJECT_ROOT } from '../config/constants.js';

const dbDir = path.join(PROJECT_ROOT, 'database');
const dbPath = path.join(dbDir, 'deployments.db');

fs.ensureDirSync(dbDir);

let dbInstance = null;

export const getDb = async () => {
    if (dbInstance) return dbInstance;

    dbInstance = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    // Enable WAL mode for better concurrency
    await dbInstance.run('PRAGMA journal_mode = WAL');

    
    await dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS chat_record (
           id TEXT PRIMARY KEY,
           file_name TEXT,
           target_path TEXT,
           is_processed INTEGER DEFAULT 0,
           create_time TEXT,
           update_time TEXT,
           drive_id TEXT,
           chat_content TEXT,
        );
    `);
    // keep this,Init tables
    // await dbInstance.exec(`
    //     CREATE TABLE IF NOT EXISTS deployments (
    //         id TEXT PRIMARY KEY,
    //         app_id TEXT, -- Optional linkage
    //         files TEXT, -- Snapshot of files at deploy time
    //         status TEXT DEFAULT 'pending', 
    //         url TEXT,
    //         error TEXT,
    //         created_at INTEGER,
    //         updated_at INTEGER
    //     );

    //     CREATE TABLE IF NOT EXISTS apps (
    //         id TEXT PRIMARY KEY,
    //         files TEXT, -- Current source code
    //         latest_deploy_id TEXT,
    //         created_at INTEGER,
    //         updated_at INTEGER
    //     );

    //     CREATE TABLE IF NOT EXISTS generated_codes (
    //         id TEXT PRIMARY KEY,
    //         file_name TEXT,
    //         target_path TEXT,
    //         code TEXT,
    //         is_processed INTEGER DEFAULT 0,
    //         date_time INTEGER
    //     );
    // `);

    return dbInstance;
};
