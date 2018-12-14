module.exports = handler

const path = require('path')
const debug = require('debug')('solid:index')
const utils = require('../utils')
const Negotiator = require('negotiator')
const url = require('url')
const URI = require('urijs')

function handler (req, res, next) {
  const indexFile = 'index.html'
  const ldp = req.app.locals.ldp
  const negotiator = new Negotiator(req)
  const requestedType = negotiator.mediaType()
  const filename = utils.reqToPath(req)

  ldp.stat(filename, function (err, stats) {
    if (err) return next()

    if (!stats.isDirectory()) {
      return next()
    }
    // redirect to the right container if missing trailing /
    if (req.path.lastIndexOf('/') !== req.path.length - 1) {
      return res.redirect(301, URI.joinPaths(req.path, '/', '//').toString())
    }

    if (requestedType && requestedType.indexOf('text/html') !== 0) {
      return next()
    }
    debug('Looking for index in ' + req.path)

    // Check if file exists in first place
    ldp.exists(req.hostname, path.join(req.path, indexFile), function (err) {
      if (err) {
        return next()
      }
      res.locals.path = url.resolve(req.path, indexFile)
      debug('Found an index for current path')
      return next()
    })
  })
}
