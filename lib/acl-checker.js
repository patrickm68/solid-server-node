'use strict'

const path = require('path')
const PermissionSet = require('solid-permissions').PermissionSet
const rdf = require('rdflib')
const url = require('url')
const HTTPError = require('./http-error')

const DEFAULT_ACL_SUFFIX = '.acl'

class ACLChecker {
  constructor (options = {}) {
    this.debug = options.debug || console.log.bind(console)
    this.fetch = options.fetch
    this.strictOrigin = options.strictOrigin
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
  }

  can (user, mode, resource, options = {}) {
    const debug = this.debug
    debug('Can ' + (user || 'an agent') + ' ' + mode + ' ' + resource + '?')
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(resource)) {
      mode = 'Control'
    }

    // Find nearest ACL
    let accessType = 'accessTo'
    let nearestACL = Promise.reject()
    for (const acl of ACLChecker.possibleACLs(resource, this.suffix)) {
      nearestACL = nearestACL.catch(() => new Promise((resolve, reject) => {
        debug('Check if acl exist: ' + acl)
        this.fetch(acl, function (err, graph) {
          if (err || !graph || !graph.length) {
            if (err) debug(`Error reading ${acl}: ${err}`)
            accessType = 'defaultForNew'
            reject(err)
          } else {
            resolve({ acl, graph })
          }
        })
      }))
    }
    nearestACL = nearestACL.catch(() => {
      throw new Error('No ACL resource found')
    })

    // Check the permissions within the ACL
    return nearestACL.then(({ acl, graph }) =>
      this.checkAccess(
        graph, // The ACL graph
        user, // The webId of the user
        mode, // Read/Write/Append
        resource, // The resource we want to access
        accessType, // accessTo or defaultForNew
        acl, // The current Acl file!
        options
      )
    )
    .then(() => { debug('ACL policy found') })
    .catch(err => {
      debug(`Error: ${err.message}`)
      if (!user) {
        debug('Authentication required')
        throw new HTTPError(401, `Access to ${resource} requires authorization`)
      } else {
        debug(`${mode} access denied for ${user}`)
        throw new HTTPError(403, `Access denied for ${user}`)
      }
    })
  }

  /**
   * Tests whether a graph (parsed .acl resource) allows a given operation
   * for a given user. Calls the provided callback with `null` if the user
   * has access, otherwise calls it with an error.
   * @method checkAccess
   * @param graph {Graph} Parsed RDF graph of current .acl resource
   * @param user {String} WebID URI of the user accessing the resource
   * @param mode {String} Access mode, e.g. 'Read', 'Write', etc.
   * @param resource {String} URI of the resource being accessed
   * @param accessType {String} One of `accessTo`, or `default`
   * @param acl {String} URI of this current .acl resource
   * @param options {Object} Options hashmap
   * @param [options.origin] Request's `Origin:` header
   * @param [options.host] Request's host URI (with protocol)
   */
  checkAccess (graph, user, mode, resource, accessType, acl, options = {}) {
    if (!graph || graph.length === 0) {
      debug('ACL ' + acl + ' is empty')
      return Promise.reject(new Error('No policy found - empty ACL'))
    }
    let isContainer = accessType.startsWith('default')
    let aclOptions = {
      aclSuffix: this.suffix,
      graph: graph,
      host: options.host,
      origin: options.origin,
      rdf: rdf,
      strictOrigin: this.strictOrigin,
      isAcl: uri => this.isAcl(uri),
      aclUrlFor: uri => this.aclUrlFor(uri)
    }
    let acls = new PermissionSet(resource, acl, isContainer, aclOptions)
    return acls.checkAccess(resource, user, mode)
    .then(hasAccess => {
      if (hasAccess) {
        this.debug(`${mode} access permitted to ${user}`)
        return true
      } else {
        this.debug(`${mode} access NOT permitted to ${user}` +
          aclOptions.strictOrigin ? ` and origin ${options.origin}` : '')
        throw new Error('ACL file found but no matching policy found')
      }
    })
    .catch(err => {
      this.debug(`${mode} access denied to ${user}`)
      this.debug(err)
      throw err
    })
  }

  aclUrlFor (uri) {
    if (this.isAcl(uri)) {
      return uri
    } else {
      return uri + this.suffix
    }
  }

  isAcl (resource) {
    if (typeof resource === 'string') {
      return resource.endsWith(this.suffix)
    } else {
      return false
    }
  }

  static possibleACLs (uri, suffix) {
    var first = uri.endsWith(suffix) ? uri : uri + suffix
    var urls = [first]
    var parsedUri = url.parse(uri)
    var baseUrl = (parsedUri.protocol ? parsedUri.protocol + '//' : '') +
      (parsedUri.host || '')
    if (baseUrl + '/' === uri) {
      return urls
    }

    var times = parsedUri.pathname.split('/').length
    // TODO: improve temporary solution to stop recursive path walking above root
    if (parsedUri.pathname.endsWith('/')) {
      times--
    }

    for (var i = 0; i < times - 1; i++) {
      uri = path.dirname(uri)
      urls.push(uri + (uri[uri.length - 1] === '/' ? suffix : '/' + suffix))
    }
    return urls
  }
}

module.exports = ACLChecker
module.exports.DEFAULT_ACL_SUFFIX = DEFAULT_ACL_SUFFIX
