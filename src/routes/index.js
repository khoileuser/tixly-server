const express = require('express');
const router = express.Router();

const helloRoutes = require('./hello.routes');
const authRoutes = require('./auth.routes');
const eventRoutes = require('./event.routes');

router.use('/hello', helloRoutes);
router.use('/auth', authRoutes);
router.use('/events', eventRoutes);

module.exports = router;
