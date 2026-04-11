// Clear all data from database
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_PRIMARY_USER || 'twitter_user',
  password: process.env.DB_PRIMARY_PASSWORD || 'password',
  host: process.env.DB_PRIMARY_HOST || 'postgres-primary',
  port: process.env.DB_PRIMARY_PORT || 5432,
  database: process.env.DB_PRIMARY_NAME || 'twitter',
});

async function clearDatabase() {
  try {
    console.log('\n🗑️  Clearing database...\n');

    const tables = [
      'likes',
      'retweets',
      'tweets',
      'follows',
      'users'
    ];

    for (const table of tables) {
      try {
        await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        console.log(`✅ Cleared ${table}`);
      } catch (error) {
        console.log(`⚠️  ${table} not found or already empty`);
      }
    }

    console.log('\n📊 Verifying database is empty:\n');
    
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = result.rows[0].count;
        console.log(`   ${table}: ${count} rows`);
      } catch (error) {
        console.log(`   ${table}: Error checking count`);
      }
    }

    console.log('\n✨ Database cleared successfully!\n');
  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

clearDatabase();
