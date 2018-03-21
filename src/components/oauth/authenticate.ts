import { Request, Response } from 'oauth2-server';

let oauth = require('./oauth');

export function authenticate(options) {
  options = options || {};
  return function (req, res, next) {
    let request = new Request({
      headers: {authorization: req.headers.authorization},
      method: req.method,
      query: req.query,
      body: req.body,
    });
    let response = new Response(res);
    oauth.authenticate(request, response, options)
      .then(function (token) {
        // Request is authorized.
        req.user = token;
        next();
      })
      .catch(function (err) {
        // Request is not authorized.
        res.status(err.code || 500).json(err);
      });
  };
};
