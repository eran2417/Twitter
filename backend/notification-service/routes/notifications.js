const express = require('express');
const logger = require('../shared/utils/logger');

const router = express.Router();

// Placeholder for notifications
router.get('/', (req, res) => {
  res.json({ message: 'Notifications service' });
});

module.exports = router;