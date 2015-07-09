/*jslint node: true*/
"use strict";

// Third-party dependencies
var express = require('express');
var app = express();
var getRawBody = require('raw-body');
var expressWs = require('express-ws');
var fs = require('fs');
var responseTime = require('response-time'); // Add X-Response-Time headers
var path = require('path');
var session = require('express-session');
var http = require('http');
var https = require('https');
var request = require('request')

// ldnode dependencies
var acl = require('./acl.js');
var metadata = require('./metadata.js');
var options = require('./options.js');
var login = require('./login.js');
var logging = require('./logging.js');
var container = require('./container.js');
var parse = require('./parse.js');

// Request handlers
var getHandler = require('./handlers/get.js');
var postHandler = require('./handlers/post.js');
var putHandler = require('./handlers/put.js');
var deleteHandler = require('./handlers/delete.js');
var patchHandler = require('./handlers/patch.js');

function ldnode (argv, callback) {
  var opts = options(argv);
  var app = express();

  // Setting options as local variable
  app.locals.ldp = opts;

  // Session [TODO]
  app.use(session({
    secret: opts.sessionSecret || 'node-ldp',
    saveUninitialized: false,
    resave: false
  }));

  // Creating root container
  container.createRootContainer();

  // Setting up routes
  app.use(opts.pathStart, routes());

  // Adding proxy
  if (opts.xssProxy) {
    proxy(app, opts.proxyFilter);
  }

  // Setup Express app
  if (opts.live) {
    ws(app);
  }

  logging.log("Server -- Router attached to " + opts.pathStart);
}

function createServer(app) {
  logging.log("Server -- Listening on port " + opts.port);

  if (app.locals.ldp && app.locals.ldp.webid) {
    var credentials = {
      key: fs.readFileSync(opts.privateKey),
      cert: fs.readFileSync(opts.cert),
      requestCert: true
    };
    logging.log("Server -- Private Key: " + credentials.key);
    logging.log("Server -- Certificate: " + credentials.cert);

    return https.createServer(credentials, app);
  }

  return app;
 }

function proxy (app, path) {
  logging.log('XSS Proxy listening to ' + path);
  app.get(path, function (req, res) {
    logging.log('originalUrl: ' + req.originalUrl);
    var uri = req.query.uri;
    if (!uri) {
      return res
        .status(400)
        .send("Proxy has no uri param ");
    }

    logging.log('Proxy destination URI: ' + uri);
    request.get(uri).pipe(res);
  });
}

function routes () {
  var router = express.Router('/');
  router.use('/*', function(req, res, next) {
    getRawBody(req,
      {
        length: req.headers['content-length'],
        limit: '1mb',
        encoding: 'utf-8' // typer.parse(req.headers['content-type']).parameters.charset
      },
      function(err, string) {
        if (err) {
          return next(err);
        }
        req.text = string;
        next();
      });
  });

  router.use('/*', login.loginHandler);

  //ACL handlers
  router.get("/*", acl.allowReadHandler);
  router.head("/*", acl.allowReadHandler);
  router.post("/*", acl.allowWriteHandler);
  router.patch("/*", acl.allowWriteHandler);
  router.put("/*", acl.allowWriteHandler);
  router.delete("/*", acl.allowWriteHandler);

  // Convert json-ld and nquads to turtle
  router.use('/*', parse.parseHandler);
  // Add links headers
  router.use(metadata.linksHandler);
  // Add response time
  router.use(responseTime());

  // HTTP methods handlers
  router.get('/*', getHandler.handler);
  router.head('/*', getHandler.headHandler);
  router.put('/*', putHandler.handler);
  router.delete('/*', deleteHandler.handler);
  router.post('/*', postHandler.handler);
  router.patch('/*', patchHandler.handler);
  return router;
}

function ws (app) {
  expressWs(app);
  app.mountpath = ''; //  needs to be set for addSocketRoute aka .ws()
  // was options.pathFilter
  app.ws('/', function(socket, res) {
    logging.log("    WEB SOCKET incoming on " + socket.path);
    socket.on('message', function(msg) {
      console.log("Web socket message = " + msg);
      // subscribeToChanges(socket, res);
    });
  });
}

ldnode.proxy = proxy;
ldnode.ws = ws;
ldnode.routes = routes;
ldnode.run = run;

module.exports = ldnode;

