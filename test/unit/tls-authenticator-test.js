'use strict'

const chai = require('chai')
const expect = chai.expect
const sinon = require('sinon')
chai.use(require('sinon-chai'))
chai.use(require('dirty-chai'))
chai.use(require('chai-as-promised'))
chai.should()

const { TlsAuthenticator } = require('../../lib/models/authenticator')

const SolidHost = require('../../lib/models/solid-host')
const AccountManager = require('../../lib/models/account-manager')

const host = SolidHost.from({ serverUri: 'https://example.com' })
const accountManager = AccountManager.from({ host, multiUser: true })

describe('TlsAuthenticator', () => {
  describe('fromParams()', () => {
    let req = {
      connection: {}
    }
    let options = { accountManager }

    it('should return a TlsAuthenticator instance', () => {
      let tlsAuth = TlsAuthenticator.fromParams(req, options)

      expect(tlsAuth.accountManager).to.equal(accountManager)
      expect(tlsAuth.connection).to.equal(req.connection)
    })
  })

  describe('findValidUser()', () => {
    let webId = 'https://alice.example.com/#me'
    let certificate = { uri: webId }
    let connection = {
      renegotiate: sinon.stub().yields(),
      getPeerCertificate: sinon.stub().returns(certificate)
    }
    let options = { accountManager, connection }

    let tlsAuth = new TlsAuthenticator(options)

    tlsAuth.extractWebId = sinon.stub().resolves(webId)
    sinon.spy(tlsAuth, 'renegotiateTls')
    sinon.spy(tlsAuth, 'ensureLocalUser')

    return tlsAuth.findValidUser()
      .then(validUser => {
        expect(tlsAuth.renegotiateTls).to.have.been.called()
        expect(connection.getPeerCertificate).to.have.been.called()
        expect(tlsAuth.extractWebId).to.have.been.calledWith(certificate)
        expect(tlsAuth.ensureLocalUser).to.have.been.calledWith(webId)

        expect(validUser.webId).to.equal(webId)
      })
  })

  describe('renegotiateTls()', () => {
    it('should reject if an error occurs while renegotiating', () => {
      let connection = {
        renegotiate: sinon.stub().yields(new Error('Error renegotiating'))
      }

      let tlsAuth = new TlsAuthenticator({ connection })

      expect(tlsAuth.renegotiateTls()).to.be.rejectedWith(/Error renegotiating/)
    })

    it('should resolve if no error occurs', () => {
      let connection = {
        renegotiate: sinon.stub().yields(null)
      }

      let tlsAuth = new TlsAuthenticator({ connection })

      expect(tlsAuth.renegotiateTls()).to.be.fulfilled()
    })
  })

  describe('getCertificate()', () => {
    it('should throw on a non-existent certificate', () => {
      let connection = {
        getPeerCertificate: sinon.stub().returns(null)
      }

      let tlsAuth = new TlsAuthenticator({ connection })

      expect(() => tlsAuth.getCertificate()).to.throw(/No client certificate detected/)
    })

    it('should throw on an empty certificate', () => {
      let connection = {
        getPeerCertificate: sinon.stub().returns({})
      }

      let tlsAuth = new TlsAuthenticator({ connection })

      expect(() => tlsAuth.getCertificate()).to.throw(/No client certificate detected/)
    })

    it('should return a certificate if no error occurs', () => {
      let certificate = { uri: 'https://alice.example.com/#me' }
      let connection = {
        getPeerCertificate: sinon.stub().returns(certificate)
      }

      let tlsAuth = new TlsAuthenticator({ connection })

      expect(tlsAuth.getCertificate()).to.equal(certificate)
    })
  })

  describe('extractWebId()', () => {
    it('should reject if an error occurs verifying certificate', () => {
      let tlsAuth = new TlsAuthenticator({})

      tlsAuth.verifyWebId = sinon.stub().yields(new Error('Error processing certificate'))

      expect(tlsAuth.extractWebId()).to.be.rejectedWith(/Error processing certificate/)
    })

    it('should resolve with a verified web id', () => {
      let tlsAuth = new TlsAuthenticator({})

      let webId = 'https://alice.example.com/#me'
      tlsAuth.verifyWebId = sinon.stub().yields(null, webId)

      let certificate = { uri: webId }

      expect(tlsAuth.extractWebId(certificate)).to.become(webId)
    })
  })

  describe('ensureLocalUser()', () => {
    it('should throw an error if external user and this server not the preferred provider', done => {
      let tlsAuth = new TlsAuthenticator({ accountManager })

      let externalWebId = 'https://alice.someothersite.com#me'

      tlsAuth.discoverProviderFor = sinon.stub().resolves('https://another-provider.com')

      tlsAuth.ensureLocalUser(externalWebId)
        .catch(err => {
          expect(err.message).to.match(/This server is not the preferred provider for Web ID https:\/\/alice.someothersite.com#me/)
          done()
        })
    })

    it('should return a user instance if the webid is local', () => {
      let tlsAuth = new TlsAuthenticator({ accountManager })

      let webId = 'https://alice.example.com/#me'

      return tlsAuth.ensureLocalUser(webId)
        .then(user => {
          expect(user.username).to.equal('alice')
          expect(user.webId).to.equal(webId)
        })
    })

    it('should return a user instance if external user and this server is preferred provider', () => {
      let tlsAuth = new TlsAuthenticator({ accountManager })

      let externalWebId = 'https://alice.someothersite.com#me'

      tlsAuth.discoverProviderFor = sinon.stub().resolves('https://example.com')

      tlsAuth.ensureLocalUser(externalWebId)
        .then(user => {
          expect(user.username).to.equal(externalWebId)
          expect(user.webId).to.equal(externalWebId)
        })
    })
  })

  describe('verifyWebId()', () => {
    it('should yield an error if no cert is given', done => {
      let tlsAuth = new TlsAuthenticator({})

      tlsAuth.verifyWebId(null, (error) => {
        expect(error.message).to.equal('No certificate given')

        done()
      })
    })
  })
})
