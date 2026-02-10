const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const tweetRoutes = require('./routes/tweets');
const timelineRoutes = require('./routes/timeline');
const { logger } = require('./shared');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Routes
app.use('/tweets', tweetRoutes);
app.use('/timeline', timelineRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'feed-service' });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  logger.info(`Feed service listening on port ${PORT}`);
});