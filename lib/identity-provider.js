module.exports = IdentityProvider

var webid = require('webid')
var $rdf = require('rdflib')
var uuid = require('uuid')
var sym = $rdf.sym
var lit = $rdf.lit
var async = require('async')
var parallel = async.parallel
var waterfall = async.waterfall
var debug = require('./debug').idp
var express = require('express')
var bodyParser = require('body-parser')
var errorHandler = require('./handlers/error-pages')
var url = require('url')
var uriAbs = require('./utils').uriAbs
var forge = require('node-forge')
var asn1 = forge.asn1
var pki = forge.pki
var parse = require('./utils').parse

var workspaces = [
  {
    name: 'Public',
    label: 'Public workspace',
    type: 'PublicWorkspace'
  }, {
    name: 'Private',
    label: 'Private workspace',
    type: 'PrivateWorkspace'
  }, {
    name: 'Work',
    label: 'Work workspace'
  }, {
    name: 'Shared',
    label: 'Shared workspace',
    type: 'SharedWorkspace'
  }, {
    name: 'Preferences',
    label: 'Preferences workspace'
  }, {
    name: 'Applications',
    label: 'Applications workspace',
    type: 'PreferencesWorkspace'
  }, {
    name: 'Inbox',
    label: 'Inbox'
  }, {
    name: 'Timeline',
    label: 'Timeline'
  }
]

function defaultBuildURI (account, host, port) {
  var hostAndPort = (host || 'localhost') + (port || '')
  return 'https://' + hostAndPort + '/'
}

// IdentityProvider singleton
function IdentityProvider (options) {
  if (!(this instanceof IdentityProvider)) {
    return new IdentityProvider(options)
  }
  options = options || {}
  this.store = options.store
  this.pathCard = options.pathCard || 'profile/card'
  this.suffixURI = options.suffixURI || '#me'
  this.buildURI = options.buildURI || defaultBuildURI
  this.suffixAcl = options.suffixAcl
  this.workspaces = options.workspaces || workspaces
}

// Generate the future webid from the options and the IdentityProvider Settings
IdentityProvider.prototype.agent = function (options) {
  options = options || {}
  var url = options.url || this.buildURI(options.username, options.host)
  var card = url + this.pathCard
  var agent = card + this.suffixURI
  return agent
}

// Store a graph straight into the LDPStore
IdentityProvider.prototype.putGraph = function (uri, graph) {
  var self = this
  return function (callback) {
    var content = $rdf.serialize(content, graph, uri, 'text/turtle')
    var parsed = url.parse(uri)
    var host = parsed.hostname
    var path = parsed.path
    return self.store.put(host, path, content, callback)
  }
}

// Create an identity give the options and the WebID+TLS certificates
IdentityProvider.prototype.create = function (options, cert, callback) {
  var self = this

  options.url = options.url || self.buildURI(options.username, options.host)
  options.card = options.url + self.pathCard
  options.agent = options.card + self.suffixURI
  debug('Creating space ' + options.url)
  options.suffixAcl = self.suffixAcl
  options.workspaces = options.workspaces || self.workspaces

  var card = createCard(options, cert)
  var cardAcl = createCardAcl(options)
  var rootAcl = createRootAcl(options)

  // TODO create workspaces
  // remove port from host

  var subdomain = options.host.split(':')[0]
  self.store.exists(subdomain, '/', function (err) {
    // if page exists
    if (!err || err.status !== 404) {
      debug('Cannot create ' + subdomain + ', it already exists')
      var error = new Error('Account already exists')
      error.status = 406
      return callback(error)
    }

    debug(subdomain + ' is free')

    parallel([
      self.putGraph(options.card, card),
      self.putGraph(options.card + self.suffixAcl, cardAcl),
      self.putGraph(options.url + self.suffixAcl, rootAcl)
    ], function (err) {
      if (err) {
        err.status = 500
        debug('Error creating account ' + options.username + ': ' + err.message)
      }

      debug('Created files for ' + options.username)
      callback(err)
    })
  })
}

function createPreferences (options) {
  var graph = $rdf.graph()
  var pref = options.url + 'Preferences/prefs.ttl'

  graph.add(
    sym(pref),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/pim/space#ConfigurationFile'))

  graph.add(
    sym(pref),
    sym('http://purl.org/dc/terms/title'),
    lit('Preferences file'))

  graph.add(
    sym(options.card),
    sym('http://www.w3.org/ns/pim/space#preferencesFile'),
    sym(pref))

  graph.add(
    sym(options.card),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://xmlns.com/foaf/0.1/Person'))

  options.workspaces.forEach(function() {
    // TODO 
  })

  return graph
}

function createWorkSpace (options, workspace) {
  var resource = options.url + workspace.name + '/'
  var acl = resource + options.suffixAcl

  var aclGraph = createAcl(
    acl,
    resource,
    options.agent,
    options.email)

  if (workspace.type === 'PublicWorkspace') {
    addReadAll(aclGraph, acl)
  }

  if (workspace.type === 'Inbox') {
    addAppendAll(aclGraph, acl)
  }

}

// Generates a WebID card and add the key if the cert is passed
function createCard (options, cert) {
  var graph = $rdf.graph()
  graph.add(
    sym(options.card),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://xmlns.com/foaf/0.1/PersonalProfileDocument'))
  graph.add(
    sym(options.card),
    sym('http://xmlns.com/foaf/0.1/maker'),
    sym(options.agent))
  graph.add(
    sym(options.card),
    sym('http://xmlns.com/foaf/0.1/primaryTopic'),
    sym(options.agent))
  graph.add(
    sym(options.agent),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://xmlns.com/foaf/0.1/Person'))

  if (options.name && options.name.length > 0) {
    graph.add(
      sym(options.agent),
      sym('http://xmlns.com/foaf/0.1/name'),
      lit(options.name))
  }
  graph.add(
    sym(options.agent),
    sym('http://www.w3.org/ns/pim/space#storage'),
    sym(options.url))

  // TODO add workspace with inbox, timeline, preferencesFile..
  // See: https://github.com/linkeddata/gold/blob/master/webid.go

  if (cert) {
    addKey(graph, options.agent, cert)
  }

  return graph
}

// Add the WebID+TLS Public Key to the WebID graph
function addKey (graph, agent, cert) {
  var card = agent.split('#')[0]
  var key = card + '#key' + uuid.v4()

  graph.add(
    sym(agent),
    sym('http://www.w3.org/ns/auth/cert#key'),
    sym(key))
  graph.add(
    sym(key),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/cert#RSAPublicKey'))
  graph.add(
    sym(key),
    sym('http://www.w3.org/2000/01/rdf-schema#label'),
    lit('Created on ' + (new Date()).toString()))

  var modulus = cert.publicKey.n.toString()
  var exponent = cert.publicKey.e.toString()
  graph.add(
    sym(key),
    sym('http://www.w3.org/ns/auth/cert#modulus'),
    lit(modulus, 'http://www.w3.org/2001/XMLSchema#hexBinary')) // TODO add Datatype "http://www.w3.org/2001/XMLSchema#hexBinary"
  graph.add(
    sym(key),
    sym('http://www.w3.org/ns/auth/cert#exponent'),
    lit(exponent, 'http://www.w3.org/2001/XMLSchema#int')) // TODO add Datatype "http://www.w3.org/2001/XMLSchema#int"
}

function addAppendAll (graph, acl) {
  var readAll = acl + '#appendall'

  graph.add(
    sym(readAll),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(url))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#agentClass'),
    sym('http://xmlns.com/foaf/0.1/Agent'))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Append'))
}

function addReadAll (graph, acl) {
  var readAll = acl + '#readall'

  graph.add(
    sym(readAll),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(url))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#agentClass'),
    sym('http://xmlns.com/foaf/0.1/Agent'))
  graph.add(
    sym(readAll),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Read'))
}

// Create an ACL for the WebID card
function createCardAcl (options) {
  var graph = $rdf.graph()

  // Create Card ACL
  var graph = createAcl(
    options.card + options.suffixAcl,
    options.card,
    options.agent,
    options.email)

  // Add ReadAll term
  addReadAll(graph, options.card + options.suffixAcl)

  return graph
}

function createAcl (acl, uri, agent, email) {
  var graph = $rdf.graph()
  var owner = acl + '#owner'

  graph.add(
    sym(owner),
    sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    sym('http://www.w3.org/ns/auth/acl#Authorization'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(uri))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#accessTo'),
    sym(uri))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#agent'),
    sym(agent))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#defaultForNew'),
    sym(uri))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Read'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Write'))
  graph.add(
    sym(owner),
    sym('http://www.w3.org/ns/auth/acl#mode'),
    sym('http://www.w3.org/ns/auth/acl#Control'))

  if (email && email.length > 0) {
    graph.add(
      sym(owner),
      sym('http://www.w3.org/ns/auth/acl#agent'),
      sym('mailto:' + email))
  }

  return graph
}

// Create ACL for the space reserved for the new user
function createRootAcl (options) {
  var graph = createAcl(
    options.url + options.suffixAcl,
    options.url,
    options.agent,
    options.email)

  return graph
}

// TODO create workspaces
IdentityProvider.prototype.get = function (req, res, next) {
  if (req.path !== '/') {
    return next()
  }
  this.store.exists(req.hostname, '/', function (err) {
    if (err && err.status === 404) {
      // TODO maybe a personalized page
      // or a redirect
      debug('Account on ' + req.hostname + ' is available from ' + req.originalUrl)
      return res.sendStatus(404)
    } else {
      debug('Account on ' + req.hostname + ' is not available ' + req.originalUrl)
      return next()
    }
  })
}

function stripLineEndings (obj) {
  return obj.replace(/(\r\n|\n|\r)/gm, '')
}

IdentityProvider.prototype.newCert = function (req, res, next) {
  var self = this

  var options = req.body
  if (!options || !options.spkac || !options.webid) {
    debug('Request for certificate not valid')
    var err = new Error('Request for certificate not valid')
    err.status = 500
    return next(err)
  }
  var spkac = new Buffer(stripLineEndings(options.spkac), 'utf-8')

  debug('Requesting new cert for ' + options.webid)

  if (req.session.userId !== options.webid) {
    debug('user is not logged in: ' + req.session.userId + ' is not ' + options.webid)
    var error = new Error('You are not logged in, so you can\'t create a certificate')
    error.status = 401
    return next(error)
  }

  options.host = req.get('host')

  // Get a new cert
  webid('tls').generate({
    spkac: spkac,
    agent: options.webid
  }, function (err, cert) {
    if (err) {
      debug('Error generating a certificate: ' + err.message)
      err.status = 500
      return next(err)
    }

    // Get the current graph
    self.getGraph(options.webid, function (err, card) {
      if (err) {
        debug('Error getting the webID: ' + err.message)
        return next(err)
      }

      addKey(card, options.webid, cert)
      self.putGraph(options.webid, card)(function (err) {
        if (err) {
          debug('Error saving the WebID: ' + err.message)
          return next(err)
        }

        debug('Sending new cert as response')
        res.set('Content-Type', 'application/x-x509-user-cert')
        // Convert to DER
        var der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes()
        res.send(new Buffer(der, 'binary'))
      })
    })
  })
}

IdentityProvider.prototype.getGraph = function (uri, callback) {
  var self = this

  var parsed = url.parse(uri)
  var hostname = parsed.hostname
  var reqPath = parsed.path

  self.store.get(hostname, reqPath, null, true, 'text/turtle', function (err, stream) {
    if (err) {
      debug('Cannot find WebID card')
      var notexists = new Error('Cannot find WebID card')
      notexists.status = 500
      return callback(notexists)
    }
    var data = ''
    stream
      .on('data', function (chunk) {
        data += chunk
      })
      .on('end', function () {
        // TODO make sure that uri is correct
        parse(data, uri, 'text/turtle', function (err, card) {
          if (err) {
            debug('WebId can\'t be parsed: ' + err.message)
            var invalid = new Error('You have an invalid WebID card')
            invalid.status = 500
            return callback(invalid)
          }

          callback(null, card)
        })
      })
  })
}

// Handle POST requests on account creation
IdentityProvider.prototype.post = function (req, res, next) {
  var self = this
  var options = req.body

  if (!options || !options.username) {
    debug('Account creation is missing username field')
    var err = new Error('You must enter an account name!')
    err.status = 406
    return next(err)
  }

  options.host = req.get('host')
  debug('Create account with settings ', options)

  var agent = self.agent(options)
  var spkac = null
  var cert = null
  waterfall([
    function (callback) {
      if (options.spkac && options.spkac.length > 0) {
        spkac = new Buffer(stripLineEndings(options.spkac), 'utf-8')
        webid('tls').generate({
          spkac: spkac,
          agent: agent // TODO generate agent
        }, callback)
      } else {
        return callback(null, false)
      }
    },
    function (newCert, callback) {
      cert = newCert
      self.create(options, cert, callback)
    }
  ], function (err) {
    if (err) {
      err.status = err.status || 500
      debug('Error creating ' + options.user + ': ' + err.message)
      return next(err)
    }

    debug(options.username + ': account created, now setting the cookies and response')
    // Set the cookies on success
    req.session.userId = agent
    req.session.identified = true
    res.set('User', agent)
    res.status(200)

    if (cert) {
      res.set('Content-Type', 'application/x-x509-user-cert')
        // Convert to DER
      var der = asn1.toDer(pki.certificateToAsn1(cert)).getBytes()
      res.send(der)
    } else {
      res.end()
    }
  })
}

// Middleware (or Router) to serve the IdentityProvider
IdentityProvider.prototype.middleware = function (corsSettings) {
  var router = express.Router('/')
  var parser = bodyParser.urlencoded({ extended: false })

  if (corsSettings) {
    router.use(corsSettings)
  }

  router.post('/new', parser, this.post.bind(this))
  router.post('/cert', parser, this.newCert.bind(this))

  router.all('/*', function (req, res) {
    var host = uriAbs(req)
    res.redirect('https://solid.github.io/solid-signup/?domain=' + host + '&acc=accounts/new&crt=accounts/cert')
  })
  router.use(errorHandler)
  return router
}
