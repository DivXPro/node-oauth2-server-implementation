'use strict';

let express = require('express');
let path = require('path');
let logger = require('morgan');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let config = require('config');
let authenticate = require('./components/oauth/authenticate');
let routes = require('./routes/index');
let users = require('./routes/users');
let app = express();
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

if (config.get('seedDB')) {
  require('./components/oauth/seed');
}
if (config.get('seedMongoDB')) {
  require('./components/oauth/seed-mongo');
}

/** Public Area **/

require('./components/oauth')(app);

/** Control Private through OAuth **/

app.use('/', routes);
app.use('/users', users);

app.get('/secure', authenticate(), function (req, res) {
  res.json({message: 'Secure data'});
});

app.get('/me', authenticate(), function (req, res) {
  res.json({
    me: req.user,
    message: 'Authorization success, Without Scopes, Try accessing /profile with `profile` scope',
    description: 'Try postman https://www.getpostman.com/collections/37afd82600127fbeef28',
    more: 'pass `profile` scope while Authorize',
  });
});

app.get('/profile', authenticate({scope: 'profile'}), function (req, res) {
  res.json({
    profile: req.user,
  });
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  let err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err,
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {},
  });
});

module.exports = app;
