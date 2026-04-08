// Simulation script to populate the Twitter database with users, tweets, follows, likes, and retweets
// Usage: node scripts/simulate-data.js

const { Pool } = require('pg');
const { faker } = require('@faker-js/faker');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5434,
  database: process.env.DB_NAME || 'twitter',
  user: process.env.DB_USER || 'twitter_user',
  password: process.env.DB_PASSWORD || 'password',
});

const NUM_USERS = 5000;
const NUM_TWEETS = 20000;
const NUM_FOLLOWS = 5000;
const NUM_LIKES = 30000;
const NUM_RETWEETS = 10000;

async function createUsers() {
  const users = [];
  // Precomputed bcrypt hash for 'password123'
  const defaultPasswordHash = '$2b$10$Cr3FhRcyWeGDnMayHOWoK.S.nxaAlhDx1xsl8RoHwZhkll2QsmvOO';
  for (let i = 1; i <= NUM_USERS; i++) {
    users.push({
      id: i,
      username: (faker.internet.username() + i).slice(0, 15),
      email: faker.internet.email(),
      password_hash: defaultPasswordHash,
      display_name: faker.person.fullName(),
      location: faker.location.city(),
      created_at: faker.date.past({ years: 2 }),
    });
  }
  function escape(str) {
    return String(str).replace(/'/g, "''");
  }
  const values = users.map(u => `(${u.id}, '${escape(u.username)}', '${escape(u.email)}', '${escape(u.password_hash)}', '${escape(u.display_name)}', '${escape(u.location)}', '${u.created_at.toISOString()}')`).join(',');
  await pool.query(`INSERT INTO users (id, username, email, password_hash, display_name, location, created_at) VALUES ${values}`);
  return users;
}

async function createTweets(users) {
  let tweetId = 1;
  for (let i = 0; i < NUM_TWEETS; i += 1000) {
    const tweets = [];
    for (let j = 0; j < 1000 && tweetId <= NUM_TWEETS; j++, tweetId++) {
      const user = users[Math.floor(Math.random() * users.length)];
      // Use real English sentences for tweets
      const englishSentences = [
        'Just finished a great workout!',
        'Excited for the weekend ahead.',
        'Working on a new project today.',
        'Had an amazing dinner with friends.',
        'Learning JavaScript is fun!',
        'Reading a fantastic book right now.',
        'The weather is beautiful today.',
        'Can’t wait for the next adventure.',
        'Enjoying some quality family time.',
        'Productivity is at an all-time high!'
      ];
      const content = faker.helpers.arrayElement(englishSentences);
      tweets.push(`(${tweetId}, ${user.id}, '${content.replace(/'/g, "''")}', '${faker.date.recent(180).toISOString()}')`);
    }
    await pool.query(`INSERT INTO tweets (id, user_id, content, created_at) VALUES ${tweets.join(',')}`);
  }
}

async function createFollows(users) {
  for (let i = 0; i < NUM_FOLLOWS; i++) {
    const follower = users[Math.floor(Math.random() * users.length)];
    let following;
    do {
      following = users[Math.floor(Math.random() * users.length)];
    } while (following.id === follower.id);
    await pool.query(`INSERT INTO follows (follower_id, following_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [follower.id, following.id, faker.date.recent(180)]);
  }
}

async function createLikes(users) {
  for (let i = 0; i < NUM_LIKES; i++) {
    const userId = users[Math.floor(Math.random() * users.length)].id;
    const tweetId = Math.floor(Math.random() * NUM_TWEETS) + 1;
    await pool.query(`INSERT INTO likes (user_id, tweet_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [userId, tweetId, faker.date.recent(180)]);
  }
}

async function createRetweets(users) {
  for (let i = 0; i < NUM_RETWEETS; i++) {
    const userId = users[Math.floor(Math.random() * users.length)].id;
    const tweetId = Math.floor(Math.random() * NUM_TWEETS) + 1;
    await pool.query(`INSERT INTO retweets (user_id, tweet_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [userId, tweetId, faker.date.recent(180)]);
  }
}

(async () => {
  try {
    console.log('Creating users...');
    const users = await createUsers();
    console.log('Creating tweets...');
    await createTweets(users);
    console.log('Creating follows...');
    await createFollows(users);
    console.log('Creating likes...');
    await createLikes(users);
    console.log('Creating retweets...');
    await createRetweets(users);
    console.log('Simulation data inserted!');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();
