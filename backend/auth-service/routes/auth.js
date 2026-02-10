const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db, logger, kafkaProducer } = require('../shared');

const router = express.Router();

// Register
router.post('/register',
  [
    body('username')
      .isLength({ min: 3, max: 15 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-15 characters, alphanumeric and underscores only'),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('displayName').isLength({ min: 1, max: 50 }),
    body('location').optional().isLength({ max: 100 }).withMessage('Location must be less than 100 characters')
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password, displayName, location } = req.body;

      // Check for existing username and email globally (across all partitions)
      const existingUser = await db.query(
        'SELECT username, email FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        const existing = existingUser.rows[0];
        if (existing.username === username) {
          return res.status(409).json({ error: 'Username already exists' });
        }
        if (existing.email === email) {
          return res.status(409).json({ error: 'Email already exists' });
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Insert user with transaction
      const result = await db.transaction(async (client) => {
        const userResult = await client.query(
          `INSERT INTO users (username, email, password_hash, display_name, location)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, username, email, display_name, location, avatar_url, verified, 
                     follower_count, following_count, tweet_count, created_at`,
          [username, email, passwordHash, displayName, location]
        );

        const user = userResult.rows[0];

        // Publish event to Kafka with Avro encoding via Schema Registry
        try {
          await kafkaProducer.publishUserRegistered({
            id: user.id,
            username: user.username,
            email: user.email,
            display_name: user.display_name,
            location: user.location,
            created_at: user.created_at
          });
        } catch (kafkaError) {
          logger.error('Failed to publish user registration event:', kafkaError);
          // Continue even if Kafka fails
        }

        return user;
      });

      // Generate JWT
      const token = jwt.sign(
        { userId: result.id, username: result.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
      );

      logger.info(`User registered: ${username}`);

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: result
      });
    } catch (error) {
      // Since we removed database unique constraints, we handle uniqueness at application level
      // Other database errors are still possible (foreign key violations, etc.)
      next(error);
    }
  }
);

// Login
router.post('/login',
  [
    body('username').notEmpty(),
    body('password').notEmpty()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      // Get user from database
      const result = await db.query(
        `SELECT id, username, email, password_hash, display_name, avatar_url, 
                verified, follower_count, following_count, tweet_count, created_at
         FROM users 
         WHERE username = $1 OR email = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
      );

      // Remove password hash from response
      delete user.password_hash;

      logger.info(`User logged in: ${username}`);

      res.json({
        message: 'Login successful',
        token,
        user
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ 
          error: 'Username or email already exists' 
        });
      }
      next(error);
    }
  }
);

// Verify token
router.get('/verify', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user data
    const result = await db.query(
      `SELECT id, username, email, display_name, avatar_url, verified, 
              follower_count, following_count, tweet_count, created_at
       FROM users 
       WHERE id = $1`,
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      valid: true,
      user: result.rows[0]
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(error);
  }
});

module.exports = router;
