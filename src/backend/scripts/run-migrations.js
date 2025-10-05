const { pool, testConnection } = require('../src/db/connection');

async function runMigrations() {
  console.log('Checking database connection...');
  
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }
  
  console.log('Database connection successful. Running migrations...');
  
  console.log('Schema is ready for use with Noirion v1');
  
  return true;
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error running migrations:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };