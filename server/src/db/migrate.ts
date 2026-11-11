import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { config } from '../config.js';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  console.log('[Migration] Starting database migration...');

  // 1. Ensure target database exists
  const parsedUrl = new URL(config.database.connectionString);
  const targetDbName = parsedUrl.pathname.replace(/^\//, '') || 'team_formation';

  const adminUrl = new URL(config.database.connectionString);
  adminUrl.pathname = '/postgres';

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  try {
    await adminClient.connect();
    const dbCheck = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDbName]
    );
    if (dbCheck.rowCount === 0) {
      console.log(`[Migration] Database "${targetDbName}" not found. Creating it...`);
      await adminClient.query(`CREATE DATABASE "${targetDbName}"`);
      console.log(`[Migration] Database "${targetDbName}" created.`);
    }
  } catch (err: any) {
    console.warn(`[Migration] Could not check/create database via admin client (${err.message}). Proceeding directly...`);
  } finally {
    await adminClient.end().catch(() => {});
  }

  // 2. Connect to the target database and execute migrations
  const targetClient = new Client({ connectionString: config.database.connectionString });
  await targetClient.connect();

  try {
    const migrationFilePath = path.join(__dirname, 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationFilePath, 'utf-8');

    console.log('[Migration] Executing 001_initial_schema.sql...');
    await targetClient.query(sql);
    console.log('[Migration] Migration executed successfully.');
  } catch (err) {
    console.error('[Migration Error]', err);
    throw err;
  } finally {
    await targetClient.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('[Migration] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration Failed]', err);
      process.exit(1);
    });
}
