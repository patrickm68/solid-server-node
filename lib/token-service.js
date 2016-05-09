'use strict'

const moment = require('moment')
const uid = require('uid-safe').sync
const extend = require('extend')

module.exports = TokenService

class TokenService {
  constructor () {
    this.tokens = {}
  }
  generate (opts = {}) {
    const token = uid(20)
    this.tokens[token] = {
      exp: moment().add(20, 'minutes')
    }
    this.tokens[token] = extend(this.tokens[token], opts)

    return token
  }
  verify (token) {
    const now = new Date()
    if (this.tokens[token] && now < this.tokens[token].expire) {
      return this.tokens[token]
    } else {
      return false
    }
  }

  remove (token) {
    delete this.tokens[token]
  }
}
