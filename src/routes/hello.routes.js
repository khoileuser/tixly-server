const express = require('express');
const { printHello } = require('../services/hello.service');
const router = express.Router();

const HelloService = require('../services/hello.service');

router.post('/', HelloService.printHello);

module.exports = router;
