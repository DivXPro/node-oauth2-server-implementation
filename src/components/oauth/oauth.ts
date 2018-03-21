'use strict';

let OauthServer = require('oauth2-server');
let config = require('config');

export const oauth = new OauthServer({
  model: config.get('db') === 'mongo' ? require('./mongo-models.js') : require('./models.js'),
  accessTokenLifetime: config.get('accessTokenLifetime') || 3600,
  refreshTokenLifetime: config.get('refreshTokenLifetime') || 1209600,
});

