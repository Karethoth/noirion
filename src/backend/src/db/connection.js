import { Pool } from 'pg';
import 'dotenv/config';

const dbConfig = {
  user: process.env.POSTGRES_USER || 'noirion',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'noirion',
  password: process.env.POSTGRES_PASSWORD || 'secret',
  port: process.env.POSTGRES_PORT || 5432,
};

const pool = new Pool(dbConfig);

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL database');
    client.release();
    return true;
  } catch (err) {
    console.error('Error connecting to PostgreSQL:', err);
    return false;
  }
}

export { pool, testConnection };
