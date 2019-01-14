'use strict'

const rdf = require('rdflib')
const debug = require('./debug').ACL
const HTTPError = require('./http-error')
const aclCheck = require('@solid/acl-check')
const { URL } = require('url')

const DEFAULT_ACL_SUFFIX = '.acl'
const ACL = rdf.Namespace('http://www.w3.org/ns/auth/acl#')

// An ACLChecker exposes the permissions on a specific resource
class ACLChecker {
  constructor (resource, options = {}) {
    this.resource = resource
    this.resourceUrl = new URL(resource)
    this.agentOrigin = options.agentOrigin
    this.fetch = options.fetch
    this.fetchGraph = options.fetchGraph
    this.strictOrigin = options.strictOrigin
    this.trustedOrigins = options.trustedOrigins
    this.suffix = options.suffix || DEFAULT_ACL_SUFFIX
    this.aclCached = {}
    this.messagesCached = {}
    this.requests = {}
  }

  // Returns a fulfilled promise when the user can access the resource
  // in the given mode, or rejects with an HTTP error otherwise
  async can (user, mode) {
    const cacheKey = `${mode}-${user}`
    if (this.aclCached[cacheKey]) {
      return this.aclCached[cacheKey]
    }
    this.messagesCached[cacheKey] = this.messagesCached[cacheKey] || []

    const acl = await this.getNearestACL().catch(err => {
      this.messagesCached[cacheKey].push(new HTTPError(err.status || 500, err.message || err))
    })
    if (!acl) {
      this.aclCached[cacheKey] = Promise.resolve(false)
      return this.aclCached[cacheKey]
    }
    let resource = rdf.sym(this.resource)
    if (this.resource.endsWith('/' + this.suffix)) {
      resource = rdf.sym(ACLChecker.getDirectory(this.resource))
    }
    // If this is an ACL, Control mode must be present for any operations
    if (this.isAcl(this.resource)) {
      mode = 'Control'
      resource = rdf.sym(this.resource.substring(0, this.resource.length - this.suffix.length))
    }
    const directory = acl.isContainer ? rdf.sym(ACLChecker.getDirectory(acl.acl)) : null
    const aclFile = rdf.sym(acl.acl)
    const agent = user ? rdf.sym(user) : null
    const modes = [ACL(mode)]
    const agentOrigin = this.agentOrigin ? rdf.sym(this.agentOrigin) : null
    const trustedOrigins = this.trustedOrigins ? this.trustedOrigins.map(trustedOrigin => rdf.sym(trustedOrigin)) : null
    const accessDenied = aclCheck.accessDenied(acl.graph, resource, directory, aclFile, agent, modes, agentOrigin, trustedOrigins)
    if (accessDenied && this.agentOrigin && this.resourceUrl.origin !== this.agentOrigin) {
      this.messagesCached[cacheKey].push(HTTPError(403, accessDenied))
    } else if (accessDenied && user) {
      this.messagesCached[cacheKey].push(HTTPError(403, accessDenied))
    } else if (accessDenied && !user) {
      this.messagesCached[cacheKey].push(HTTPError(401, 'Unauthenticated'))
    } else if (accessDenied) {
      this.messagesCached[cacheKey].push(HTTPError(401, accessDenied))
    }
    this.aclCached[cacheKey] = Promise.resolve(!accessDenied)
    return this.aclCached[cacheKey]
  }

  async getError (user, mode) {
    const cacheKey = `${mode}-${user}`
    this.aclCached[cacheKey] = this.aclCached[cacheKey] || this.can(user, mode)
    const isAllowed = await this.aclCached[cacheKey]
    return isAllowed ? null : this.messagesCached[cacheKey].reduce((prevMsg, msg) => msg.status > prevMsg.status ? msg : prevMsg, { status: 0 })
  }

  static getDirectory (aclFile) {
    const parts = aclFile.split('/')
    parts.pop()
    return `${parts.join('/')}/`
  }

  // Gets the ACL that applies to the resource
  async getNearestACL () {
    const { resource } = this
    let isContainer = false
    const possibleACLs = this.getPossibleACLs()
    const acls = [...possibleACLs]
    let returnAcl = null
    while (possibleACLs.length > 0 && !returnAcl) {
      const acl = possibleACLs.shift()
      let graph
      try {
        this.requests[acl] = this.requests[acl] || this.fetch(acl)
        graph = await this.requests[acl]
      } catch (err) {
        if (err && (err.code === 'ENOENT' || err.status === 404)) {
          isContainer = true
          continue
        }
        debug(err)
        throw err
      }
      const relative = resource.replace(acl.replace(/[^/]+$/, ''), './')
      debug(`Using ACL ${acl} for ${relative}`)
      returnAcl = { acl, graph, isContainer }
    }
    if (!returnAcl) {
      throw new HTTPError(500, `No ACL found for ${resource}, searched in \n- ${acls.join('\n- ')}`)
    }
    const groupUrls = returnAcl.graph
      .statementsMatching(null, ACL('agentGroup'), null)
      .map(node => node.object.value.split('#')[0])
    await Promise.all(groupUrls.map(groupUrl => {
      this.requests[groupUrl] = this.requests[groupUrl] || this.fetch(groupUrl, returnAcl.graph)
      return this.requests[groupUrl]
    }))

    return returnAcl
  }

  // Gets all possible ACL paths that apply to the resource
  getPossibleACLs () {
    // Obtain the resource URI and the length of its base
    let { resource: uri, suffix } = this
    const [{ length: base }] = uri.match(/^[^:]+:\/*[^/]+/)

    // If the URI points to a file, append the file's ACL
    const possibleAcls = []
    if (!uri.endsWith('/')) {
      possibleAcls.push(uri.endsWith(suffix) ? uri : uri + suffix)
    }

    // Append the ACLs of all parent directories
    for (let i = lastSlash(uri); i >= base; i = lastSlash(uri, i - 1)) {
      possibleAcls.push(uri.substr(0, i + 1) + suffix)
    }
    return possibleAcls
  }

  isAcl (resource) {
    return resource.endsWith(this.suffix)
  }
}

// Returns the index of the last slash before the given position
function lastSlash (string, pos = string.length) {
  return string.lastIndexOf('/', pos)
}

module.exports = ACLChecker
module.exports.DEFAULT_ACL_SUFFIX = DEFAULT_ACL_SUFFIX
