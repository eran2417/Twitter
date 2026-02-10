const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const searchRoutes = require('./routes/search');
const { logger } = require('./shared');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Routes
app.use('/search', searchRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'search-service' });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  logger.info(`Search service listening on port ${PORT}`);
});