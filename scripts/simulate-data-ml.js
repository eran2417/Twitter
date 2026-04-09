// Enhanced ML-focused data generation with meaningful English tweets
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: process.env.DB_PRIMARY_USER || 'twitter_user',
  password: process.env.DB_PRIMARY_PASSWORD || 'password',
  host: process.env.DB_PRIMARY_HOST || 'postgres-primary',
  port: process.env.DB_PRIMARY_PORT || 5432,
  database: process.env.DB_PRIMARY_NAME || 'twitter',
});

// Performance monitoring
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      operations: {},
      memoryUsage: [],
    };
  }

  startOperation(name) {
    this.metrics.operations[name] = {
      start: Date.now(),
      count: 0,
    };
  }

  recordOperation(name, count = 1) {
    if (!this.metrics.operations[name]) {
      this.metrics.operations[name] = { start: Date.now(), count: 0 };
    }
    this.metrics.operations[name].count += count;
  }

  endOperation(name) {
    if (this.metrics.operations[name]) {
      const duration = Date.now() - this.metrics.operations[name].start;
      const count = this.metrics.operations[name].count;
      const opsPerSec = Math.round((count / duration) * 1000);
      console.log(`✅ ${name}: ${count} items in ${duration}ms (${opsPerSec} ops/sec)`);
    }
  }

  recordMemory() {
    const used = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    this.metrics.memoryUsage.push(used);
    console.log(`📊 Memory: ${used}MB`);
  }

  summary() {
    const totalTime = Date.now() - this.metrics.startTime;
    console.log('\n' + '='.repeat(60));
    console.log('📈 PERFORMANCE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`Peak Memory: ${Math.max(...this.metrics.memoryUsage)}MB`);
    console.log(`Avg Memory: ${(this.metrics.memoryUsage.reduce((a, b) => a + b, 0) / this.metrics.memoryUsage.length).toFixed(0)}MB`);
    console.log('='.repeat(60) + '\n');
  }
}

const monitor = new PerformanceMonitor();

// Real names for display_name field
const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'William', 'Linda', 'David', 'Barbara',
  'Richard', 'Elizabeth', 'Joseph', 'Susan', 'Thomas', 'Jessica', 'Charles', 'Sarah', 'Christopher', 'Karen',
  'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle', 'Kenneth', 'Carol',
  'Kevin', 'Amanda', 'Brian', 'Melissa', 'George', 'Deborah', 'Edward', 'Stephanie', 'Ronald', 'Rebecca',
  'Timothy', 'Sharon', 'Jason', 'Laura', 'Jeffrey', 'Cynthia', 'Ryan', 'Kathleen', 'Jacob', 'Amy',
  'Gary', 'Shirley', 'Nicholas', 'Angela', 'Eric', 'Helen', 'Jonathan', 'Anna', 'Stephen', 'Brenda'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Peterson', 'Phillips', 'Campbell',
  'Parker', 'Evans', 'Edwards', 'Collins', 'Reeves', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook',
  'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Peterson', 'Cooper', 'Peterson', 'Brady', 'Castillo', 'Kramer'
];

const LOCATIONS = ['New York', 'San Francisco', 'London', 'Tokyo', 'Toronto', 'Berlin', 'Sydney', 'Mumbai', 'Singapore', 'Dubai'];

// User personas with interests
const PERSONAS = {
  tech_enthusiast: {
    bio: 'Software engineer, AI/ML enthusiast',
    interests: ['technology', 'ai', 'programming'],
    followRatio: 0.15,
  },
  news_follower: {
    bio: 'News junkie, always updated',
    interests: ['news', 'politics', 'business'],
    followRatio: 0.1,
  },
  content_creator: {
    bio: 'Digital creator, entrepreneur',
    interests: ['entertainment', 'business', 'lifestyle'],
    followRatio: 0.2,
  },
  casual_user: {
    bio: 'Just here for fun',
    interests: ['entertainment', 'sports', 'memes'],
    followRatio: 0.08,
  },
  sports_fan: {
    bio: 'Sports enthusiast',
    interests: ['sports', 'fitness'],
    followRatio: 0.12,
  },
};

// English tweet templates by topic
const TWEET_TEMPLATES = {
  technology: [
    'Just launched my new project using {tech}. So excited to share it with everyone!',
    'The future of tech is here. {tech} is changing everything.',
    'Working on an interesting problem with {tech}. Any best practices?',
    'Why {tech} is the game changer everyone is talking about right now.',
    'Day 10 of learning {tech}. This is amazing so far!',
  ],
  ai: [
    'Machine learning models are getting smarter every day. The future is now.',
    'Just finished building an AI model that can predict {task}. Incredible results!',
    'AI is transforming industries faster than ever. What\'s next?',
    'Deep learning breakthrough: {model} achieves state-of-the-art performance.',
    'The ethics of AI is something we should all be thinking about.',
  ],
  programming: [
    'Found the perfect solution to {problem}. Clean code feels good.',
    'Refactoring this code to be 50% more efficient. Worth the effort!',
    'Just shipped production code. Time to celebrate!',
    'Debugging for 3 hours only to find a typo. Programming life 😅',
    'Anyone else spend more time naming variables than writing code?',
  ],
  news: [
    'Breaking: {news_topic} announces major updates.',
    'Just read this interesting article about {news_topic}. Worth your time.',
    'The market reacts to {news_topic}. Here\'s what you need to know.',
    '{news_topic} is trending. Let\'s discuss in the comments.',
    'Key takeaways from today\'s {news_topic} announcement.',
  ],
  politics: [
    'Important discussion about {policy}. Everyone should be informed.',
    '{politician} announces new initiative on {topic}. What do you think?',
    'Election coverage: {candidate} leads in latest poll.',
    'Policy update on {topic}: Here\'s what changed and why.',
    'Political analysis: The impact of {policy} on the economy.',
  ],
  business: [
    'Startup funding update: {company} raises ${amount} Series {round}.',
    'Market trends show growth in {industry}. Great opportunities ahead.',
    'Business strategy tip: {advice} can boost your growth.',
    '{company} announces record quarterly earnings.',
    'Entrepreneurship isn\'t easy, but moments like these make it worth it.',
  ],
  entertainment: [
    'Just watched {movie}. Highly recommend! 10/10',
    'New {music_type} album dropped today. Already on repeat!',
    'Celebrity news: {celebrity} launches new {project}.',
    'Streaming now: {show} - Everyone needs to watch this.',
    'Movie review: {movie} exceeded all my expectations.',
  ],
  sports: [
    '{team} wins {event}! What a game!',
    'Playoff updates: {team1} vs {team2} - Incredible performance.',
    '{athlete} breaks record in {sport}. Unbelievable!',
    'Sports analysis: Why {team} is the strongest this season.',
    'Game highlights: {team} dominates {opponent}.',
  ],
  fitness: [
    'Completed my workout! Feeling stronger every day.',
    'Fitness tip: Consistency beats intensity. Keep showing up.',
    'Just hit a new personal record. Never stop pushing!',
    'Nutrition matters as much as exercise. What\'s your diet like?',
    'Starting my 30-day fitness challenge. Who wants to join?',
  ],
  lifestyle: [
    'Travel tip: {destination} is absolutely beautiful.',
    'Life hack: {hack} saved me so much time.',
    'Productivity tip: Start your day with {habit}.',
    'Just finished reading {book}. Changed my perspective.',
    'Wellness matters. Take care of yourself today.',
  ],
  memes: [
    'When you finally understand that algorithm 🧠',
    'Me: tries to have a productive day. My to-do list: 📈',
    'POV: You\'re about to deploy to production',
    'Code works on my machine 🤷',
    'Imposter syndrome hits different on Monday mornings',
  ],
};

// Helper to get random item
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRealisticName() {
  const firstName = getRandomItem(FIRST_NAMES);
  const lastName = getRandomItem(LAST_NAMES);
  return { firstName, lastName, displayName: `${firstName} ${lastName}` };
}

function generateMeaningfulUsername(firstName, lastName, usedUsernames = new Set()) {
  const patterns = [
    `${firstName.toLowerCase()}`,
    `${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${Math.floor(Math.random() * 999)}`,
    `${firstName.toLowerCase().substring(0, 1)}${lastName.toLowerCase()}`,
  ];
  
  let username;
  let attempts = 0;
  const maxAttempts = 20;
  
  do {
    username = getRandomItem(patterns);
    
    // Ensure it fits within VARCHAR(15)
    if (username.length > 15) {
      username = username.substring(0, 15);
    }
    
    attempts++;
  } while (usedUsernames.has(username) && attempts < maxAttempts);
  
  // If still duplicated after maxAttempts, add a random number
  if (usedUsernames.has(username)) {
    username = `${firstName.toLowerCase().substring(0, 8)}${Math.floor(Math.random() * 9999)}`.substring(0, 15);
  }
  
  return username;
}

// Generate meaningful English tweets
function generateMeaningfulTweet(interests) {
  const topic = getRandomItem(interests);
  const templates = TWEET_TEMPLATES[topic] || TWEET_TEMPLATES.lifestyle;
  const template = getRandomItem(templates);

  // Simple replacements for placeholders
  let tweet = template
    .replace('{tech}', getRandomItem(['Python', 'Node.js', 'Rust', 'Go', 'Kotlin']))
    .replace('{task}', getRandomItem(['user behavior', 'market trends', 'customer churn', 'fraud']))
    .replace('{model}', getRandomItem(['GPT-4', 'Claude', 'Llama', 'BERT', 'ResNet']))
    .replace('{problem}', getRandomItem(['N+1 queries', 'memory leaks', 'race conditions', 'deadlock']))
    .replace('{news_topic}', getRandomItem(['Federal Reserve', 'Treasury', 'Congress', 'Securities']))
    .replace('{policy}', getRandomItem(['infrastructure bill', 'tax reform', 'healthcare', 'education']))
    .replace('{politician}', getRandomItem(['Senator', 'Representative', 'Governor', 'Mayor']))
    .replace('{topic}', getRandomItem(['economy', 'jobs', 'climate', 'technology']))
    .replace('{candidate}', getRandomItem(['Candidate A', 'Candidate B', 'Candidate C']))
    .replace('{company}', getRandomItem(['TechCorp', 'StartupX', 'InnovateLab', 'FutureAI']))
    .replace('{amount}', Math.floor(Math.random() * 90 + 10) + 'M')
    .replace('{round}', getRandomItem(['A', 'B', 'C', 'D']))
    .replace('{industry}', getRandomItem(['AI', 'blockchain', 'cleantech', 'biotech']))
    .replace('{advice}', getRandomItem(['focus on customer feedback', 'hire great people', 'iterate fast']))
    .replace('{movie}', getRandomItem(['Inception', 'Dune', 'Interstellar', 'Avatar']))
    .replace('{music_type}', getRandomItem(['indie', 'pop', 'hip-hop', 'electronic']))
    .replace('{celebrity}', getRandomItem(['Artist A', 'Actor B', 'Creator C']))
    .replace('{project}', getRandomItem(['podcast', 'clothing line', 'production', 'charity']))
    .replace('{show}', getRandomItem(['Breaking Bad', 'The Crown', 'Stranger Things', 'Succession']))
    .replace('{team}', getRandomItem(['Lakers', 'Warriors', 'Patriots', 'Yankees']))
    .replace('{event}', getRandomItem(['playoff', 'championship', 'final', 'match']))
    .replace('{team1}', getRandomItem(['Lakers', 'Warriors', 'Patriots']))
    .replace('{team2}', getRandomItem(['Celtics', 'Suns', 'Chiefs']))
    .replace('{athlete}', getRandomItem(['LeBron', 'Curry', 'Mahomes', 'Serena']))
    .replace('{sport}', getRandomItem(['basketball', 'football', 'tennis']))
    .replace('{opponent}', getRandomItem(['their rivals', 'the defending champs', 'their arch-enemy']))
    .replace('{destination}', getRandomItem(['Tokyo', 'Paris', 'Barcelona', 'Dubai']))
    .replace('{hack}', getRandomItem(['this Chrome extension', 'this keyboard shortcut', 'this app']))
    .replace('{habit}', getRandomItem(['meditation', 'journaling', 'exercise', 'reading']))
    .replace('{book}', getRandomItem(['Atomic Habits', 'Deep Work', 'Thinking Fast and Slow']));

  return tweet;
}

async function generateUsers(count) {
  console.log(`\n📝 Generating ${count} users...`);
  monitor.startOperation('user_generation');

  const personaKeys = Object.keys(PERSONAS);
  const hashedPassword = await bcrypt.hash('password123', 10);
  const users = [];
  const usedUsernames = new Set();
  const usedEmails = new Set();

  for (let i = 0; i < count; i++) {
    const personaType = personaKeys[i % personaKeys.length];
    const persona = PERSONAS[personaType];
    const { firstName, lastName, displayName } = generateRealisticName();
    let username = generateMeaningfulUsername(firstName, lastName, usedUsernames);
    let email = `${username}@twitter.local`;
    
    // Ensure email is also unique
    let emailAttempts = 0;
    while (usedEmails.has(email) && emailAttempts < 10) {
      const suffix = Math.floor(Math.random() * 9999);
      email = `${username}${suffix}@twitter.local`;
      emailAttempts++;
    }
    
    usedUsernames.add(username);
    usedEmails.add(email);
    
    const location = getRandomItem(LOCATIONS);

    users.push({
      id: i + 1,
      username,
      email,
      password_hash: hashedPassword,
      display_name: displayName,
      location,
      bio: `${persona.bio} #${personaType.replace(/_/g, '')}`,
      interests: persona.interests,
      persona: personaType,
    });

    if ((i + 1) % 100 === 0) {
      monitor.recordOperation('user_generation', 100);
    }
  }

  // Batch insert users
  const query = `
    INSERT INTO users (username, email, password_hash, display_name, location, bio, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id
  `;

  const insertedUsers = [];
  for (const user of users) {
    try {
      const result = await pool.query(query, [user.username, user.email, user.password_hash, user.display_name, user.location, user.bio]);
      insertedUsers.push({
        ...user,
        id: result.rows[0].id,
      });
    } catch (error) {
      if (!error.message.includes('duplicate key')) {
        console.error(`Error creating user ${user.username}:`, error.message);
      }
    }
  }

  monitor.recordOperation('user_generation', insertedUsers.length);
  monitor.endOperation('user_generation');
  monitor.recordMemory();
  return insertedUsers;
}

async function generateFollowers(users, count) {
  console.log(`\n👥 Generating ${count} follower relationships...`);
  monitor.startOperation('follower_generation');

  const query = `
    INSERT INTO follows (follower_id, following_id, created_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT DO NOTHING
  `;

  let created = 0;
  for (let i = 0; i < count; i++) {
    const follower = getRandomItem(users);
    const following = getRandomItem(users);

    // Enforce CHECK constraint: follower_id != following_id
    if (follower.id !== following.id) {
      try {
        await pool.query(query, [follower.id, following.id]);
        created++;
        monitor.recordOperation('follower_generation', 1);

        if ((i + 1) % 5000 === 0) {
          console.log(`  Created ${created} follower relationships...`);
        }
      } catch (error) {
        // Ignore duplicate key errors
      }
    }
  }

  monitor.endOperation('follower_generation');
  monitor.recordMemory();
}

async function generateTweets(users, count) {
  console.log(`\n✍️  Generating ${count} tweets with English content...`);
  monitor.startOperation('tweet_generation');

  const query = `
    INSERT INTO tweets (user_id, content, created_at)
    VALUES ($1, $2, $3)
    RETURNING id
  `;

  let tweetCount = 0;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  for (let i = 0; i < count; i++) {
    const user = getRandomItem(users);
    let content = generateMeaningfulTweet(user.interests);
    
    // Enforce 280 character limit
    if (content.length > 280) {
      content = content.substring(0, 277) + '...';
    }
    
    // Spread timestamps over 6 months
    const daysAgo = Math.floor(Math.random() * 180);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);

    try {
      await pool.query(query, [user.id, content, createdAt]);
      tweetCount++;
      monitor.recordOperation('tweet_generation', 1);

      if ((i + 1) % 5000 === 0) {
        console.log(`  Created ${tweetCount} tweets...`);
        monitor.recordMemory();
      }
    } catch (error) {
      console.error(`Error creating tweet:`, error.message);
    }
  }

  monitor.endOperation('tweet_generation');
  monitor.recordMemory();
  return tweetCount;
}

async function generateInteractions(users, count) {
  console.log(`\n💬 Generating ${count} interactions (likes, retweets, replies)...`);
  monitor.startOperation('interaction_generation');

  // Get all tweets first
  const tweetsResult = await pool.query('SELECT id, user_id FROM tweets ORDER BY RANDOM() LIMIT $1', [Math.min(count * 5, 500000)]);
  const tweets = tweetsResult.rows;

  let interactionCount = 0;

  for (let i = 0; i < count; i++) {
    const user = getRandomItem(users);
    const tweet = getRandomItem(tweets);

    if (!tweet || user.id === tweet.user_id) continue;

    const interactionType = Math.random();

    try {
      if (interactionType < 0.6) {
        // Like
        const likeQuery = `
          INSERT INTO likes (user_id, tweet_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT DO NOTHING
        `;
        await pool.query(likeQuery, [user.id, tweet.id]);
        interactionCount++;
      } else if (interactionType < 0.85) {
        // Retweet
        const retweetQuery = `
          INSERT INTO retweets (user_id, tweet_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT DO NOTHING
        `;
        await pool.query(retweetQuery, [user.id, tweet.id]);
        interactionCount++;
      } else {
        // Reply
        const replyContent = generateMeaningfulTweet(user.interests);
        const replyQuery = `
          INSERT INTO tweets (user_id, content, reply_to_tweet_id, created_at)
          VALUES ($1, $2, $3, NOW())
        `;
        await pool.query(replyQuery, [user.id, replyContent, tweet.id]);
        interactionCount++;
      }

      monitor.recordOperation('interaction_generation', 1);

      if ((i + 1) % 10000 === 0) {
        console.log(`  Created ${interactionCount} interactions...`);
        monitor.recordMemory();
      }
    } catch (error) {
      // Ignore errors for duplicates
    }
  }

  monitor.endOperation('interaction_generation');
  monitor.recordMemory();
  return interactionCount;
}

async function main() {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 ML-FOCUSED DATA GENERATION SCRIPT');
    console.log('='.repeat(60));

    // Configuration
    const USER_COUNT = 10000;
    const FOLLOWER_COUNT = 50000;
    const TWEET_COUNT = 100000;
    const INTERACTION_COUNT = 500000;

    console.log(`\nConfiguration:`);
    console.log(`  Users: ${USER_COUNT}`);
    console.log(`  Followers: ${FOLLOWER_COUNT}`);
    console.log(`  Tweets: ${TWEET_COUNT}`);
    console.log(`  Interactions: ${INTERACTION_COUNT}`);
    console.log(`  Default Password: password123`);

    // Generate data
    const users = await generateUsers(USER_COUNT);
    await generateFollowers(users, FOLLOWER_COUNT);
    await generateTweets(users, TWEET_COUNT);
    await generateInteractions(users, INTERACTION_COUNT);

    monitor.summary();
    console.log('✨ Data generation complete!');
    
    // Final statistics
    const userCountResult = await pool.query('SELECT COUNT(*) FROM users');
    const tweetCountResult = await pool.query('SELECT COUNT(*) FROM tweets');
    const likeCountResult = await pool.query('SELECT COUNT(*) FROM likes');
    const retweetCountResult = await pool.query('SELECT COUNT(*) FROM retweets');
    const followsCountResult = await pool.query('SELECT COUNT(*) FROM follows');

    console.log('\n📊 Final Statistics:');
    console.log(`  Total Users: ${userCountResult.rows[0].count}`);
    console.log(`  Total Tweets: ${tweetCountResult.rows[0].count}`);
    console.log(`  Total Likes: ${likeCountResult.rows[0].count}`);
    console.log(`  Total Retweets: ${retweetCountResult.rows[0].count}`);
    console.log(`  Total Follows: ${followsCountResult.rows[0].count}`);
    console.log('\n✅ All users can login with password: password123\n');

  } catch (error) {
    console.error('Error during data generation:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
