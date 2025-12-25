require('dotenv').config();

const env = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongodb: {
    uri: process.env.MONGODB_URI,
  },
};

if (!env.mongodb.uri) {
  throw new Error('MONGODB_URI is not defined in environment variables');
}

module.exports = env;
