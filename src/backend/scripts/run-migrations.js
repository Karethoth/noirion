import { pool, testConnection } from '../src/db/connection.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('Checking database connection...');
  
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }
  
  console.log('Database connection successful. Running migrations...');
  
  const client = await pool.connect();
  try {
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Get list of migration files
    const migrationsDir = path.join(__dirname, '../src/db/migrations');
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.js'))
      .sort();
    
    console.log(`Found ${migrationFiles.length} migration files`);
    
    // Run each migration
    for (const file of migrationFiles) {
      const migrationName = file.replace('.js', '');
      
      // Check if migration has already been run
      const result = await client.query(
        'SELECT id FROM migrations WHERE name = $1',
        [migrationName]
      );
      
      if (result.rows.length > 0) {
        console.log(`  ✓ ${migrationName} (already executed)`);
        continue;
      }
      
      // Run the migration
      console.log(`  Running ${migrationName}...`);
      const migrationPath = path.join(migrationsDir, file);
      const migration = await import(`file:///${migrationPath.replace(/\\/g, '/')}`);
      
      await client.query('BEGIN');
      try {
        await migration.up(client);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migrationName]
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${migrationName} completed`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${migrationName} failed:`, error.message);
        throw error;
      }
    }
    
    console.log('\nAll migrations completed successfully');
    return true;
  } finally {
    client.release();
  }
}

// Run migrations if this is the main module
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runMigrations()
    .then(() => {
      console.log('\nMigrations completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nError running migrations:', err);
      process.exit(1);
    });
}

export { runMigrations };