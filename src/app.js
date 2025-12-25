const express = require('express');

const connectDB = require('./config/db');
const env = require('./config/env');
const routes = require('./routes');

const app = express();

connectDB(env.mongodb.uri);

app.use(express.json());

app.use('/api/v1', routes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
});
