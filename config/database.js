/**
 * Database connection pools
 * Centralized for maintainability
 */
const fs = require('fs');
const mysql = require('mysql2');

require('dotenv').config();

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_PORT'];
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required env: ${key}`);
}

const ssl =
  process.env.DB_SSL_MODE === 'required'
    ? process.env.DB_SSL_CA_PATH
      ? { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH) }
      : { rejectUnauthorized: false }
    : undefined;

const poolOptions = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 10),
  queueLimit: 0,
  connectTimeout: 15_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 5_000,
  multipleStatements: true,
  ssl,
};

// Main DB (fileachiever)
const pool = mysql.createPool({ ...poolOptions, database: process.env.DB_NAME });
attachPoolHandlers(pool, 'main');

// Blog DB (automate_blog)
const pool2 = mysql.createPool({ ...poolOptions, database: 'automate_blog' });
attachPoolHandlers(pool2, 'automate_blog');

// Legacy DB (fileachiever) - uses DB1_* or DB_* fallbacks
const pool1 = mysql.createPool({
  host: process.env.DB1_HOST || process.env.DB_HOST || 'localhost',
  user: process.env.DB1_USER || process.env.DB_USER || 'root',
  password: process.env.DB1_PASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.DB1_NAME || 'fileachiever',
  port: Number(process.env.DB1_PORT || process.env.DB_PORT || 3306),
  multipleStatements: true,
});
attachPoolHandlers(pool1, 'legacy');

function attachPoolHandlers(p, name) {
  p.on('connection', (conn) => {
    conn.query('SET SESSION wait_timeout = 300');
    conn.query('SET SESSION interactive_timeout = 300');
  });
  p.on('error', (err) => {
    console.error(`[DB ${name}]`, err.code, err.message);
  });
  p.getConnection((err, c) => {
    if (err) console.error(`[DB ${name} connect]`, err);
    else {
      console.log(`DB ${name} connected.`);
      c.release();
    }
  });
}

module.exports = { pool, pool2, pool1 };
