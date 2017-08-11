var assert = require('chai').assert

var utils = require('../../lib/utils')

describe('Utility functions', function () {
  describe('pathBasename', function () {
    it('should return bar as relative path for /foo/bar', function () {
      assert.equal(utils.pathBasename('/foo/bar'), 'bar')
    })
    it('should return empty as relative path for /foo/', function () {
      assert.equal(utils.pathBasename('/foo/'), '')
    })
    it('should return empty as relative path for /', function () {
      assert.equal(utils.pathBasename('/'), '')
    })
    it('should return empty as relative path for empty path', function () {
      assert.equal(utils.pathBasename(''), '')
    })
    it('should return empty as relative path for undefined path', function () {
      assert.equal(utils.pathBasename(undefined), '')
    })
  })

  describe('uriToFilename', function () {
    it('should decode hex-encoded space', function () {
      assert.equal(utils.uriToFilename('uri%20', 'base/'), 'base/uri ')
    })
    it('should decode hex-encoded at sign', function () {
      assert.equal(utils.uriToFilename('film%4011', 'base/'), 'base/film@11')
    })
    it('should decode hex-encoded single quote', function () {
      assert.equal(utils.uriToFilename('quote%27', 'base/'), 'base/quote\'')
    })
  })

  describe('stripLineEndings()', () => {
    it('should pass through falsy string arguments', () => {
      assert.equal(utils.stripLineEndings(''), '')
      assert.equal(utils.stripLineEndings(null), null)
      assert.equal(utils.stripLineEndings(undefined), undefined)
    })

    it('should remove line-endings characters', () => {
      let str = '123\n456'
      assert.equal(utils.stripLineEndings(str), '123456')

      str = `123
456`
      assert.equal(utils.stripLineEndings(str), '123456')
    })
  })

  describe('debrack()', () => {
    it('should return null if no string is passed', () => {
      assert.equal(utils.debrack(), null)
    })

    it('should return the string if no brackets are present', () => {
      assert.equal(utils.debrack('test string'), 'test string')
    })

    it('should return the string if less than 2 chars long', () => {
      assert.equal(utils.debrack(''), '')
      assert.equal(utils.debrack('<'), '<')
    })

    it('should remove brackets if wrapping the string', () => {
      assert.equal(utils.debrack('<test string>'), 'test string')
    })
  })

  describe('fullUrlForReq()', () => {
    it('should extract a fully-qualified url from an Express request', () => {
      let req = {
        protocol: 'https:',
        get: (host) => 'example.com',
        baseUrl: '/',
        path: '/resource1',
        query: { sort: 'desc' }
      }

      assert.equal(utils.fullUrlForReq(req), 'https://example.com/resource1?sort=desc')
    })
  })
})
