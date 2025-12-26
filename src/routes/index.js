const express = require('express');
const router = express.Router();

const helloRoutes = require('./hello.routes');
const authRoutes = require('./auth.routes');

router.use('/hello', helloRoutes);
router.use('/auth', authRoutes);

module.exports = router;
