const express = require('express');
const router = express.Router();

const helloRoutes = require('./hello.routes');
const authRoutes = require('./auth.routes');
const eventRoutes = require('./event.routes');
const bookingRoutes = require('./booking.routes');
const analyticsRoutes = require('./analytics.routes');

router.use('/hello', helloRoutes);
router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/', bookingRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
