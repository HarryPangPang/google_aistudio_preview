import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { PROJECT_ROOT } from '../config/constants.js';

const dbDir = path.join(PROJECT_ROOT, 'database');
const dbPath = path.join(dbDir, 'deployments.db');

fs.ensureDirSync(dbDir);

let dbInstance = null;

export const getDb = () => {
    if (dbInstance) return dbInstance;

    dbInstance = new Database(dbPath);
    // Enable WAL mode for better concurrency
    dbInstance.pragma('journal_mode = WAL');

    // Init tables
    dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS deployments (
            id TEXT PRIMARY KEY,
            app_id TEXT, -- Optional linkage
            files TEXT, -- Snapshot of files at deploy time
            status TEXT DEFAULT 'pending', 
            url TEXT,
            error TEXT,
            created_at INTEGER,
            updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS apps (
            id TEXT PRIMARY KEY,
            files TEXT, -- Current source code
            latest_deploy_id TEXT,
            created_at INTEGER,
            updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS generated_codes (
            id TEXT PRIMARY KEY,
            file_name TEXT,
            target_path TEXT,
            code TEXT,
            is_processed INTEGER DEFAULT 0,
            date_time INTEGER
        );
    `);

    return dbInstance;
};
