module.exports.addLink = addLink
module.exports.addLinks = addLinks
module.exports.parseMetadataFromHeader = parseMetadataFromHeader
module.exports.linksHandler = linksHandler
module.exports.addPermissions = addPermissions

var li = require('li')
var path = require('path')
var S = require('string')
var metadata = require('./metadata.js')
var debug = require('./debug.js')
var utils = require('./utils.js')
var error = require('./http-error')

const MODES = ['Read', 'Write', 'Append', 'Control']
const PERMISSIONS = MODES.map(m => m.toLowerCase())

function addLink (res, value, rel) {
  var oldLink = res.get('Link')
  if (oldLink === undefined) {
    res.set('Link', '<' + value + '>; rel="' + rel + '"')
  } else {
    res.set('Link', oldLink + ', ' + '<' + value + '>; rel="' + rel + '"')
  }
}

function addLinks (res, fileMetadata) {
  if (fileMetadata.isResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#Resource', 'type')
  }
  if (fileMetadata.isSourceResource) {
    addLink(res, 'http://www.w3.org/ns/ldp#RDFSource', 'type')
  }
  if (fileMetadata.isContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#Container', 'type')
  }
  if (fileMetadata.isBasicContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#BasicContainer', 'type')
  }
  if (fileMetadata.isDirectContainer) {
    addLink(res, 'http://www.w3.org/ns/ldp#DirectContainer', 'type')
  }
}

function linksHandler (req, res, next) {
  var ldp = req.app.locals.ldp
  var root = !ldp.idp ? ldp.root : ldp.root + req.hostname + '/'
  var filename = utils.uriToFilename(req.url, root)

  filename = path.join(filename, req.path)
  if (path.extname(filename) === ldp.suffixMeta) {
    debug.metadata('Trying to access metadata file as regular file.')

    return next(error(404, 'Trying to access metadata file as regular file'))
  }
  var fileMetadata = new metadata.Metadata()
  if (S(filename).endsWith('/')) {
    fileMetadata.isContainer = true
    fileMetadata.isBasicContainer = true
  } else {
    fileMetadata.isResource = true
  }
  // Add LDP-required Accept-Post header for OPTIONS request to containers
  if (fileMetadata.isContainer && req.method === 'OPTIONS') {
    res.header('Accept-Post', '*/*')
  }
  // Add ACL and Meta Link in header
  addLink(res, utils.pathBasename(req.path) + ldp.suffixAcl, 'acl')
  addLink(res, utils.pathBasename(req.path) + ldp.suffixMeta, 'describedBy')
  // Add other Link headers
  addLinks(res, fileMetadata)
  next()
}

function parseMetadataFromHeader (linkHeader) {
  var fileMetadata = new metadata.Metadata()
  if (linkHeader === undefined) {
    return fileMetadata
  }
  var links = linkHeader.split(',')
  for (var linkIndex in links) {
    var link = links[linkIndex]
    var parsedLinks = li.parse(link)
    for (var rel in parsedLinks) {
      if (rel === 'type') {
        if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Resource') {
          fileMetadata.isResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#RDFSource') {
          fileMetadata.isSourceResource = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#Container') {
          fileMetadata.isContainer = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#BasicContainer') {
          fileMetadata.isBasicContainer = true
        } else if (parsedLinks[rel] === 'http://www.w3.org/ns/ldp#DirectContainer') {
          fileMetadata.isDirectContainer = true
        }
      }
    }
  }
  return fileMetadata
}

// Adds a header that describes the user's permissions
function addPermissions (req, res, next) {
  const { acl, session } = req
  if (!acl) return next()

  // Turn permissions for the public and the user into a header
  const resource = utils.getFullUri(req)
  Promise.all([
    getPermissionsFor(acl, null, resource),
    getPermissionsFor(acl, session.userId, resource)
  ])
  .then(([publicPerms, userPerms]) => {
    debug.ACL(`Permissions for ${session.userId || '(none)'}: ${userPerms}`)
    debug.ACL(`Permissions for public: ${publicPerms}`)
    res.set('WAC-Allow', `user="${userPerms}",public="${publicPerms}"`)
  })
  .then(next, next)
}

// Gets the permissions string for the given user and resource
function getPermissionsFor (acl, user, resource) {
  return Promise.all(MODES.map(mode => acl.can(user, mode).catch(e => false)))
  .then(allowed => PERMISSIONS.filter((_, i) => allowed[i]).join(' '))
}
