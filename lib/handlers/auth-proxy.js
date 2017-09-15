// An authentication proxy is a reverse proxy
// that sends a logged-in Solid user's details to a backend
module.exports = addAuthProxyHandlers

const proxy = require('http-proxy-middleware')
const debug = require('../debug')
const allow = require('./allow')

const PROXY_SETTINGS = {
  logLevel: 'silent',
  changeOrigin: true
}

// Registers Auth Proxy handlers for each target
function addAuthProxyHandlers (app, targets) {
  for (const sourcePath in targets) {
    addAuthProxyHandler(app, sourcePath, targets[sourcePath])
  }
}

// Registers an Auth Proxy handler for the given target
function addAuthProxyHandler (app, sourcePath, target) {
  debug.settings(`Add auth proxy from ${sourcePath} to ${target}`)

  // Proxy to the target, removing the source path
  // (e.g., /my/proxy/path resolves to http://my.proxy/path)
  const sourcePathLength = sourcePath.length
  const settings = Object.assign({
    target,
    onProxyReq: addAuthHeaders,
    onProxyReqWs: addAuthHeaders,
    pathRewrite: path => path.substr(sourcePathLength)
  }, PROXY_SETTINGS)

  // Activate the proxy
  app.use(`${sourcePath}*`, allow('Read'), proxy(settings))
}

// Adds a headers with authentication information
function addAuthHeaders (proxyReq, req) {
  const { session = {}, headers = {} } = req
  if (session.userId) {
    proxyReq.setHeader('User', session.userId)
  }
  if (headers.host) {
    proxyReq.setHeader('Forwarded', `host=${headers.host}`)
  }
}
