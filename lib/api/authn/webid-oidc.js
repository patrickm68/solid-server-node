'use strict'
/**
 * OIDC Relying Party API handler module.
 */

const express = require('express')
const { routeResolvedFile } = require('../../utils')
const bodyParser = require('body-parser').urlencoded({ extended: false })
const OidcManager = require('../../models/oidc-manager')
const { LoginRequest } = require('../../requests/login-request')

const PasswordResetEmailRequest = require('../../requests/password-reset-email-request')
const PasswordChangeRequest = require('../../requests/password-change-request')

const {
  AuthCallbackRequest,
  LogoutRequest
} = require('@solid/oidc-auth-manager').handlers

/**
 * Sets up OIDC authentication for the given app.
 *
 * @param app {Object} Express.js app instance
 * @param argv {Object} Config options hashmap
 */
function initialize (app, argv) {
  const oidc = OidcManager.fromServerConfig(argv)
  app.locals.oidc = oidc
  oidc.initialize()

  // Attach the OIDC API
  app.use('/', middleware(oidc))

  // Perform the actual authentication
  app.use('/', oidc.rs.authenticate())

  // Expose session.userId
  app.use('/', (req, res, next) => {
    oidc.webIdFromClaims(req.claims)
      .then(webId => {
        if (webId) {
          req.session.userId = webId
        }

        next()
      })
      .catch(err => {
        let error = new Error('Could not verify Web ID from token claims')
        error.statusCode = 401
        error.statusText = 'Invalid login'
        error.cause = err

        next(error)
      })
  })
}

/**
 * Returns a router with OIDC Relying Party and Identity Provider middleware:
 *
 * @method middleware
 *
 * @param oidc {OidcManager}
 *
 * @return {Router} Express router
 */
function middleware (oidc) {
  const router = express.Router('/')

  // User-facing Authentication API
  router.get(['/login', '/signin'], LoginRequest.get)

  router.post('/login/password', bodyParser, LoginRequest.loginPassword)

  router.post('/login/tls', bodyParser, LoginRequest.loginTls)

  router.get('/account/password/reset', PasswordResetEmailRequest.get)
  router.post('/account/password/reset', bodyParser, PasswordResetEmailRequest.post)

  router.get('/account/password/change', PasswordChangeRequest.get)
  router.post('/account/password/change', bodyParser, PasswordChangeRequest.post)

  router.get('/logout', LogoutRequest.handle)
  router.post('/logout', LogoutRequest.handle)

  router.get('/goodbye', (req, res) => { res.render('auth/goodbye') })

  // The relying party callback is called at the end of the OIDC signin process
  router.get('/api/oidc/rp/:issuer_id', AuthCallbackRequest.get)

  // Static assets related to authentication
  const authAssets = [
    ['/common/', 'solid-auth-client/dist-popup/popup.html'],
    ['/common/js/', 'solid-auth-client/dist-lib/solid-auth-client.bundle.js'],
    ['/common/js/', 'solid-auth-client/dist-lib/solid-auth-client.bundle.js.map']
  ]
  authAssets.map(([path, file]) => routeResolvedFile(router, path, file))
  // Redirect for .well-known login popup location
  router.get('/.well-known/solid/login',
    (req, res) => res.redirect('/common/popup.html'))

  // Initialize the OIDC Identity Provider routes/api
  // router.get('/.well-known/openid-configuration', discover.bind(provider))
  // router.get('/jwks', jwks.bind(provider))
  // router.post('/register', register.bind(provider))
  // router.get('/authorize', authorize.bind(provider))
  // router.post('/authorize', authorize.bind(provider))
  // router.post('/token', token.bind(provider))
  // router.get('/userinfo', userinfo.bind(provider))
  // router.get('/logout', logout.bind(provider))
  let oidcProviderApi = require('oidc-op-express')(oidc.provider)
  router.use('/', oidcProviderApi)

  return router
}

/**
 * Sets the `WWW-Authenticate` response header for 401 error responses.
 * Used by error-pages handler.
 *
 * @param req {IncomingRequest}
 * @param res {ServerResponse}
 * @param err {Error}
 */
function setAuthenticateHeader (req, res, err) {
  let locals = req.app.locals

  let errorParams = {
    realm: locals.host.serverUri,
    scope: 'openid webid',
    error: err.error,
    error_description: err.error_description,
    error_uri: err.error_uri
  }

  let challengeParams = Object.keys(errorParams)
    .filter(key => !!errorParams[key])
    .map(key => `${key}="${errorParams[key]}"`)
    .join(', ')

  res.set('WWW-Authenticate', 'Bearer ' + challengeParams)
}

/**
 * Provides custom logic for error status code overrides.
 *
 * @param statusCode {number}
 * @param req {IncomingRequest}
 *
 * @returns {number}
 */
function statusCodeOverride (statusCode, req) {
  if (isEmptyToken(req)) {
    return 400
  } else {
    return statusCode
  }
}

/**
 * Tests whether the `Authorization:` header includes an empty or missing Bearer
 * token.
 *
 * @param req {IncomingRequest}
 *
 * @returns {boolean}
 */
function isEmptyToken (req) {
  let header = req.get('Authorization')

  if (!header) { return false }

  if (header.startsWith('Bearer')) {
    let fragments = header.split(' ')

    if (fragments.length === 1) {
      return true
    } else if (!fragments[1]) {
      return true
    }
  }

  return false
}

module.exports = {
  initialize,
  isEmptyToken,
  middleware,
  setAuthenticateHeader,
  statusCodeOverride
}
