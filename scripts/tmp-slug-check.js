require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
  });
  const terms = [
    'ai-based-cybersecurity',
    'sports-equipment-e-commerce',
    'travel-agency-booking-platform',
    'stock-market-prediction',
  ];
  for (const t of terms) {
    const [rows] = await c.query(
      'SELECT seo_name, name FROM source_code WHERE seo_name LIKE ? ORDER BY seo_name',
      [`%${t}%`]
    );
    console.log('\n===', t, '===');
    console.log(rows);
  }
  await c.end();
})();
