'use strict';

import * as _ from 'lodash';
import * as config from 'config';
let sqldb = require('./sqldb');
let User = sqldb.User;
let OAuthClient = sqldb.OAuthClient;
let OAuthAccessToken = sqldb.OAuthAccessToken;
let OAuthAuthorizationCode = sqldb.OAuthAuthorizationCode;
let OAuthRefreshToken = sqldb.OAuthRefreshToken;

function getAccessToken (bearerToken) {
  return OAuthAccessToken
    .findOne({
      where: {access_token: bearerToken},
      attributes: [['access_token', 'accessToken'], ['expires', 'accessTokenExpiresAt'], 'scope'],
      include: [
        {
          model: User,
          attributes: ['id', 'username', 'companyId'],
        },
        OAuthClient,
      ],
    })
    .then(function (accessToken) {
      if (!accessToken) return false;
      let token = accessToken.toJSON();
      token.user = token.User;
      token.client = token.OAuthClient;
      // token.scope = token.scope;
      return token;
    })
    .catch(function (err) {
      console.log('getAccessToken - Err: ', err);
    });
}

function getClient (clientId, clientSecret) {
  const options = {
    where: {client_id: clientId},
    attributes: ['id', 'client_id', 'redirect_uri'],
  };
  if (clientSecret) options.where.client_secret = clientSecret;

  return sqldb.OAuthClient
    .findOne(options)
    .then(function (client) {
      if (!client) return new Error('client not found');
      let clientWithGrants = client.toJSON();
      clientWithGrants.grants = ['authorization_code', 'password', 'refresh_token', 'client_credentials'];
      // Todo: need to create another table for redirect URIs
      clientWithGrants.redirectUris = [clientWithGrants.redirect_uri];
      delete clientWithGrants.redirect_uri;
      clientWithGrants.refreshTokenLifetime = config.get('refreshTokenLifetime') || undefined;
      clientWithGrants.accessTokenLifetime = config.get('accessTokenLifetime') || undefined;
      return clientWithGrants;
    }).catch(function (err) {
      console.log('getClient - Err: ', err);
    });
}

function getUser (username, password) {
  const companySplit = config.companySplit;
  let userName = username.split(companySplit)[0];
  let companyId = username.split(companySplit)[1];

  return User
    .findOne({
      where: {username: userName, companyId: companyId},
      attributes: ['id', 'username', 'password', 'companyId'],
    })
    .then(function (user) {
      return user.password.toString() === password.toString() ? user.toJSON() : false;
    })
    .catch(function (err) {
      console.log('getUser - Err: ', err);
    });
}

function revokeAuthorizationCode (code) {
  return OAuthAuthorizationCode.findOne({
    where: {
      authorization_code: code.code,
    },
  }).then(function (rCode) {
    if (rCode) rCode.destroy();
    /***
     * As per the discussion we need set older date
     * revokeToken will expected return a boolean in future version
     * https://github.com/oauthjs/node-oauth2-server/pull/274
     * https://github.com/oauthjs/node-oauth2-server/issues/290
     */
    let expiredCode = code;
    expiredCode.expiresAt = new Date('2015-05-28T06:59:53.000Z');
    return expiredCode;
  }).catch(function (err) {
    console.log('getUser - Err: ', err);
  });
}

function revokeToken (token) {
  return OAuthRefreshToken.findOne({
    where: { refresh_token: token.refreshToken },
  }).then(function (rT) {
    if (rT) rT.destroy();
    /***
     * As per the discussion we need set older date
     * revokeToken will expected return a boolean in future version
     * https://github.com/oauthjs/node-oauth2-server/pull/274
     * https://github.com/oauthjs/node-oauth2-server/issues/290
     */
    let expiredToken = token;
    expiredToken.refreshTokenExpiresAt = new Date('2015-05-28T06:59:53.000Z');
    return expiredToken;
  }).catch(function (err) {
    console.log('revokeToken - Err: ', err);
  });
}

function saveToken (token, client, user) {
  return Promise.all([
    OAuthAccessToken.create({
      access_token: token.accessToken,
      expires: token.accessTokenExpiresAt,
      client_id: client.id,
      user_id: user.id,
      scope: token.scope,
    }),
    token.refreshToken ? OAuthRefreshToken.create({ // no refresh token for client_credentials
      refresh_token: token.refreshToken,
      expires: token.refreshTokenExpiresAt,
      client_id: client.id,
      user_id: user.id,
      scope: token.scope,
    }) : [],
  ])
    .then(function (resultsArray) {
      return _.assign(  // expected to return client and user, but not returning
        {
          client: client,
          user: user,
        },
        token
      );
    })
    .catch(function (err) {
      console.log('revokeToken - Err: ', err);
    });
}

function getAuthorizationCode (code) {
  return OAuthAuthorizationCode
    .findOne({
      attributes: ['client_id', 'expires', 'user_id', 'scope'],
      where: {authorization_code: code},
      include: [User, OAuthClient],
    })
    .then(function (authCodeModel) {
      if (!authCodeModel) return false;
      let client = authCodeModel.OAuthClient.toJSON();
      let user = authCodeModel.User.toJSON();
      return {
        code: code,
        client: client,
        expiresAt: authCodeModel.expires,
        redirectUri: client.redirect_uri,
        user: user,
        scope: authCodeModel.scope,
      };
    }).catch(function (err) {
      console.log('getAuthorizationCode - Err: ', err);
    });
}

function saveAuthorizationCode (code, client, user) {
  return OAuthAuthorizationCode
    .create({
      expires: code.expiresAt,
      client_id: client.id,
      authorization_code: code.authorizationCode,
      user_id: user.id,
      scope: code.scope,
    })
    .then(function () {
      code.code = code.authorizationCode;
      return code;
    }).catch(function (err) {
      console.log('saveAuthorizationCode - Err: ', err);
    });
}

function getUserFromClient (client) {
  let options = {
    where: {client_id: client.client_id},
    include: [User],
    attributes: ['id', 'client_id', 'redirect_uri'],
  };
  if (client.client_secret) options.where.client_secret = client.client_secret;

  return OAuthClient
    .findOne(options)
    .then(function (client) {
      if (!client) return false;
      if (!client.User) return false;
      return client.User.toJSON();
    }).catch(function (err) {
      console.log('getUserFromClient - Err: ', err);
    });
}

function getRefreshToken (refreshToken) {
  if (!refreshToken || refreshToken === 'undefined') return false;

  return OAuthRefreshToken
    .findOne({
      attributes: ['client_id', 'user_id', 'expires'],
      where: {refresh_token: refreshToken},
      include: [OAuthClient, User],
    })
    .then(function (savedRT) {
      return {
        user: savedRT ? savedRT.User.toJSON() : {},
        client: savedRT ? savedRT.OAuthClient.toJSON() : {},
        refreshTokenExpiresAt: savedRT ? new Date(savedRT.expires) : null,
        refreshToken: refreshToken,
        refresh_token: refreshToken,
        scope: savedRT.scope,
      };
    }).catch(function (err) {
      console.log('getRefreshToken - Err: ', err);
    });
}

function verifyScope (token) {
  // let user = token.user;
  let client = token.client;
  let scope = token.scope;
  return (client.scope === scope && scope != null) ? scope : false;
}

module.exports = {
  // generateOAuthAccessToken, optional - used for jwt
  // generateAuthorizationCode, optional
  // generateOAuthRefreshToken, - optional
  getAccessToken: getAccessToken,
  getAuthorizationCode: getAuthorizationCode, // getOAuthAuthorizationCode renamed to,
  getClient: getClient,
  getRefreshToken: getRefreshToken,
  getUser: getUser,
  getUserFromClient: getUserFromClient,
  // grantTypeAllowed, Removed in oauth2-server 3.0
  revokeAuthorizationCode: revokeAuthorizationCode,
  revokeToken: revokeToken,
  saveToken: saveToken, // saveOAuthAccessToken, renamed to
  saveAuthorizationCode: saveAuthorizationCode, // renamed saveOAuthAuthorizationCode,
  verifyScope: verifyScope,
};
