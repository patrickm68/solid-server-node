const chai = require('chai')
const assert = chai.assert
chai.use(require('chai-as-promised'))
const $rdf = require('rdflib')
const ns = require('solid-namespace')($rdf)
const LDP = require('../../lib/ldp')
const path = require('path')
const stringToStream = require('../../lib/utils').stringToStream
const randomBytes = require('randombytes')
const ResourceMapper = require('../../lib/resource-mapper')

// Helper functions for the FS
const rm = require('./../utils').rm
const write = require('./../utils').write
// var cp = require('./utils').cp
const read = require('./../utils').read
const fs = require('fs')

describe('LDP', function () {
  const root = path.join(__dirname, '..')

  const resourceMapper = new ResourceMapper({
    rootUrl: 'https://localhost:8443/',
    rootPath: root,
    includeHost: false
  })

  const ldp = new LDP({
    resourceMapper,
    serverUri: 'https://localhost',
    multiuser: true,
    webid: false
  })

  describe('cannot delete podRoot', function () {
    it('should error 405 when deleting podRoot', () => {
      return ldp.delete('/').catch(err => {
        assert.equal(err.status, 405)
      })
    })
    it.skip('should error 405 when deleting podRoot/.acl', async () => {
      await ldp.put('/.acl', '', 'text/turtle')
      return ldp.delete('/.acl').catch(err => {
        assert.equal(err.status, 405)
      })
    })
  })

  describe('readResource', function () {
    it('return 404 if file does not exist', () => {
      return ldp.readResource('/resources/unexistent.ttl').catch(err => {
        assert.equal(err.status, 404)
      })
    })

    it('return file if file exists', () => {
      // file can be empty as well
      write('hello world', 'fileExists.txt')
      return ldp.readResource('/resources/fileExists.txt').then(file => {
        rm('fileExists.txt')
        assert.equal(file, 'hello world')
      })
    })
  })

  describe('readContainerMeta', () => {
    it('should return 404 if .meta is not found', () => {
      return ldp.readContainerMeta('/resources/').catch(err => {
        assert.equal(err.status, 404)
      })
    })

    it('should return content if metaFile exists', () => {
      // file can be empty as well
      write('This function just reads this, does not parse it', '.meta')
      return ldp.readContainerMeta('/resources/').then(metaFile => {
        rm('.meta')
        assert.equal(metaFile, 'This function just reads this, does not parse it')
      })
    })

    it('should work also if trailing `/` is not passed', () => {
      // file can be empty as well
      write('This function just reads this, does not parse it', '.meta')
      return ldp.readContainerMeta('/resources').then(metaFile => {
        rm('.meta')
        assert.equal(metaFile, 'This function just reads this, does not parse it')
      })
    })
  })

  describe('getGraph', () => {
    it('should read and parse an existing file', () => {
      const uri = 'https://localhost:8443/resources/sampleContainer/example1.ttl'
      return ldp.getGraph(uri)
        .then(graph => {
          assert.ok(graph)
          const fullname = $rdf.namedNode('http://example.org/stuff/1.0/fullname')
          const match = graph.match(null, fullname)
          assert.equal(match[0].object.value, 'Dave Beckett')
        })
    })

    it('should throw a 404 error on a non-existing file', (done) => {
      const uri = 'https://localhost:8443/resources/nonexistent.ttl'
      ldp.getGraph(uri)
        .catch(error => {
          assert.ok(error)
          assert.equal(error.status, 404)
          done()
        })
    })
  })

  describe('putGraph', () => {
    it('should serialize and write a graph to a file', () => {
      const originalResource = '/resources/sampleContainer/example1.ttl'
      const newResource = '/resources/sampleContainer/example1-copy.ttl'

      const uri = 'https://localhost:8443' + originalResource
      return ldp.getGraph(uri)
        .then(graph => {
          const newUri = 'https://localhost:8443' + newResource
          return ldp.putGraph(graph, newUri)
        })
        .then(() => {
          // Graph serialized and written
          const written = read('sampleContainer/example1-copy.ttl')
          assert.ok(written)
        })
        // cleanup
        .then(() => { rm('sampleContainer/example1-copy.ttl') })
        .catch(() => { rm('sampleContainer/example1-copy.ttl') })
    })
  })

  describe('put', function () {
    it.skip('should write a file in an existing dir', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/testPut.txt', stream, 'text/plain').then(() => {
        const found = read('testPut.txt')
        rm('testPut.txt')
        assert.equal(found, 'hello world')
      })
    })

    it.skip('should fail if a trailing `/` is passed', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/', stream, 'text/plain').catch(err => {
        assert.equal(err.status, 409)
      })
    })

    it.skip('with a larger file to exceed allowed quota', function () {
      const randstream = stringToStream(randomBytes(2100))
      return ldp.put('localhost', '/resources/testQuota.txt', randstream).catch((err) => {
        assert.notOk(err)
      })
    })
    it('should fail if a over quota', function () {
      const hellostream = stringToStream('hello world')
      return ldp.put('localhost', '/resources/testOverQuota.txt', hellostream).catch((err) => {
        assert.equal(err.status, 413)
      })
    })

    it.skip('should fail if a trailing `/` is passed without content type', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/', stream, null).catch(err => {
        assert.equal(err.status, 409)
      })
    })

    it('should fail if no content type is passed', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/testPut.txt', stream, null).catch(err => {
        assert.equal(err.status, 400)
      })
    })

    it('should fail if file.acl and content type not text/turtle', () => {
      const stream = stringToStream('hello world')
      return ldp.put('/resources/testPut.txt.acl', stream, 'text/plain').catch(err => {
        assert.equal(err.status, 415)
      })
    })
  })

  describe('delete', function () {
    // FIXME: https://github.com/solid/node-solid-server/issues/1502
    it.skip('should error when deleting a non-existing file', () => {
      return assert.isRejected(ldp.delete('/resources/testPut.txt'))
    })

    it.skip('should delete a file with ACL in an existing dir', async () => {
      // First create a dummy file
      const stream = stringToStream('hello world')
      await ldp.put('/resources/testPut.txt', stream, 'text/plain')
      await ldp.put('/resources/testPut.txt.acl', stream, 'text/turtle')
      // Make sure it exists
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt', function (err) {
        if (err) {
          throw err
        }
      })
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt.acl', function (err) {
        if (err) {
          throw err
        }
      })

      // Now delete the dummy file
      await ldp.delete('/resources/testPut.txt')
      // Make sure it does not exist anymore
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt', function (err, s) {
        if (!err) {
          throw new Error('file still exists')
        }
      })
      fs.stat(ldp.resourceMapper._rootPath + '/resources/testPut.txt.acl', function (err, s) {
        if (!err) {
          throw new Error('file still exists')
        }
      })
    })

    it.skip('should fail to delete a non-empty folder', async () => {
      // First create a dummy file
      const stream = stringToStream('hello world')
      await ldp.put('/resources/dummy/testPutBlocking.txt', stream, 'text/plain')
      // Make sure it exists
      fs.stat(ldp.resourceMapper._rootPath + '/resources/dummy/testPutBlocking.txt', function (err) {
        if (err) {
          throw err
        }
      })

      // Now try to delete its folder
      return assert.isRejected(ldp.delete('/resources/dummy/'))
    })

    it.skip('should fail to delete nested non-empty folders', async () => {
      // First create a dummy file
      const stream = stringToStream('hello world')
      await ldp.put('/resources/dummy/dummy2/testPutBlocking.txt', stream, 'text/plain')
      // Make sure it exists
      fs.stat(ldp.resourceMapper._rootPath + '/resources/dummy/dummy2/testPutBlocking.txt', function (err) {
        if (err) {
          throw err
        }
      })

      // Now try to delete its parent folder
      return assert.isRejected(ldp.delete('/resources/dummy/'))
    })

    after(async function () {
      // Clean up after delete tests
      try {
        await ldp.delete('/resources/dummy/testPutBlocking.txt')
        await ldp.delete('/resources/dummy/dummy2/testPutBlocking.txt')
        await ldp.delete('/resources/dummy/dummy2/')
        await ldp.delete('/resources/dummy/')
      } catch (err) {

      }
    })
  })
  describe('listContainer', function () {
    /*
    it('should inherit type if file is .ttl', function (done) {
      write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
        '@prefix o: <http://example.org/ontology>.' +
        '<> a <http://www.w3.org/ns/ldp#MagicType> ;' +
        '   dcterms:title "This is a magic type" ;' +
        '   o:limit 500000.00 .', 'sampleContainer/magicType.ttl')

      ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', 'https://server.tld', '', 'application/octet-stream', function (err, data) {
        if (err) done(err)
        var graph = $rdf.graph()
        $rdf.parse(
          data,
          graph,
          'https://server.tld/sampleContainer',
          'text/turtle')

        var statements = graph
          .each(
            $rdf.sym('https://server.tld/magicType.ttl'),
            ns.rdf('type'),
            undefined)
          .map(function (d) {
            return d.uri
          })
        // statements should be:
        // [ 'http://www.w3.org/ns/iana/media-types/text/turtle#Resource',
        //   'http://www.w3.org/ns/ldp#MagicType',
        //   'http://www.w3.org/ns/ldp#Resource' ]
        assert.equal(statements.length, 3)
        assert.isAbove(statements.indexOf('http://www.w3.org/ns/ldp#MagicType'), -1)
        assert.isAbove(statements.indexOf('http://www.w3.org/ns/ldp#Resource'), -1)

        rm('sampleContainer/magicType.ttl')
        done()
      })
    })
*/
    it('should not inherit type of BasicContainer/Container if type is File', () => {
      write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
        '@prefix o: <http://example.org/ontology>.' +
        '<> a <http://www.w3.org/ns/ldp#Container> ;' +
        '   dcterms:title "This is a container" ;' +
        '   o:limit 500000.00 .', 'sampleContainer/containerFile.ttl')

      write('@prefix dcterms: <http://purl.org/dc/terms/>.' +
        '@prefix o: <http://example.org/ontology>.' +
        '<> a <http://www.w3.org/ns/ldp#BasicContainer> ;' +
        '   dcterms:title "This is a container" ;' +
        '   o:limit 500000.00 .', 'sampleContainer/basicContainerFile.ttl')

      return ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', '', 'server.tld')
        .then(data => {
          const graph = $rdf.graph()
          $rdf.parse(
            data,
            graph,
            'https://localhost:8443/resources/sampleContainer',
            'text/turtle')

          const basicContainerStatements = graph
            .each(
              $rdf.sym('https://localhost:8443/resources/sampleContainer/basicContainerFile.ttl'),
              ns.rdf('type'),
              undefined
            )
            .map(d => { return d.uri })

          const expectedStatements = [
            'http://www.w3.org/ns/iana/media-types/text/turtle#Resource',
            'http://www.w3.org/ns/ldp#Resource'
          ]
          assert.deepEqual(basicContainerStatements.sort(), expectedStatements)

          const containerStatements = graph
            .each(
              $rdf.sym('https://localhost:8443/resources/sampleContainer/containerFile.ttl'),
              ns.rdf('type'),
              undefined
            )
            .map(d => { return d.uri })

          assert.deepEqual(containerStatements.sort(), expectedStatements)

          rm('sampleContainer/containerFile.ttl')
          rm('sampleContainer/basicContainerFile.ttl')
        })
    })

    it('should ldp:contains the same files in dir', () => {
      ldp.listContainer(path.join(__dirname, '../resources/sampleContainer/'), 'https://server.tld/resources/sampleContainer/', '', 'server.tld')
        .then(data => {
          fs.readdir(path.join(__dirname, '../resources/sampleContainer/'), function (err, expectedFiles) {
            // Strip dollar extension
            expectedFiles = expectedFiles.map(ldp.resourceMapper._removeDollarExtension)

            if (err) {
              return Promise.reject(err)
            }

            const graph = $rdf.graph()
            $rdf.parse(data, graph, 'https://localhost:8443/resources/sampleContainer/', 'text/turtle')
            const statements = graph.match(null, ns.ldp('contains'), null)
            const files = statements
              .map(s => s.object.value.replace(/.*\//, ''))
              .map(decodeURIComponent)

            files.sort()
            expectedFiles.sort()
            assert.deepEqual(files, expectedFiles)
          })
        })
    })
  })
})
