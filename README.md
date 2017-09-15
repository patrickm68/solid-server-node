# solid-server in Node

[![](https://img.shields.io/badge/project-Solid-7C4DFF.svg?style=flat-square)](https://github.com/solid/solid)
[![Build Status](https://travis-ci.org/solid/node-solid-server.svg?branch=master&style=flat-square)](https://travis-ci.org/solid/node-solid-server)
[![NPM Version](https://img.shields.io/npm/v/solid-server.svg?style=flat-square)](https://npm.im/solid-server)
[![Gitter chat](https://img.shields.io/badge/gitter-join%20chat%20%E2%86%92-brightgreen.svg?style=flat-square)](http://gitter.im/solid/node-solid-server)

> [Solid](https://github.com/solid) server in [NodeJS](https://nodejs.org/)

`solid-server` lets you run a Solid server on top of the file-system. You can use it as a [command-line tool](https://github.com/solid/node-solid-server/blob/master/README.md#command-line-usage) (easy) or as a [library](https://github.com/solid/node-solid-server/blob/master/README.md#library-usage) (advanced).

## Solid Features supported
- [x] [Linked Data Platform](http://www.w3.org/TR/ldp/)
- [x] [Web Access Control](http://www.w3.org/wiki/WebAccessControl)
- [x] [WebID+TLS Authentication](https://www.w3.org/2005/Incubator/webid/spec/tls/)
- [x] [Real-time live updates](https://github.com/solid/solid-spec#subscribing) (using WebSockets)
- [x] Identity provider for WebID
- [x] CORS proxy for cross-site data access
- [ ] Group members in ACL
- [x] Email account recovery

## Command Line Usage

### Install

To install, first install [Node](https://nodejs.org/en/) and then run the following

```bash
$ npm install -g solid-server
```

### Run a single-user server (beginner)

The easiest way to setup `solid-server` is by running the wizard. This will create a `config.json` in your current folder

```bash
$ solid init
```
**Note**: If prompted for an SSL key and certificate, follow the instructions below.

To run your server, simply run `solid start`:

```bash
$ solid start
# Solid server (solid v0.2.24) running on https://localhost:8443/
```

If you prefer to use flags instead, the following would be the equivalent

```bash
$ solid start --port 8443 --ssl-key path/to/ssl-key.pem --ssl-cert path/to/ssl-cert.pem
# Solid server (solid v0.2.24) running on https://localhost:8443/
```

If you want to run `solid` on a particular folder (different from the one you are in, e.g. `path/to/folder`):

```bash
$ solid start --root path/to/folder --port 8443 --ssl-key path/to/ssl-key.pem --ssl-cert path/to/ssl-cert.pem
# Solid server (solid v0.2.24) running on https://localhost:8443/
```

### Running in development environments

Solid requires SSL certificates to be valid, so you cannot use self-signed certificates. To switch off this security feature in development environments, you can use the `bin/solid-test` executable, which unsets the `NODE_TLS_REJECT_UNAUTHORIZED` flag and sets the `rejectUnauthorized` option.

##### How do I get an SSL key and certificate?
You need an SSL certificate from a _certificate authority_, such as your domain provider or [Let's Encrypt!](https://letsencrypt.org/getting-started/).

For testing purposes, you can use `bin/solid-test` with a _self-signed_ certificate, generated as follows:
```
$ openssl genrsa 2048 > ../localhost.key
$ openssl req -new -x509 -nodes -sha256 -days 3650 -key ../localhost.key -subj '/CN=*.localhost' > ../localhost.cert
```

### Run multi-user server (intermediate)

You can run `solid` so that new users can sign up, in other words, get their WebIDs _username.yourdomain.com_.

Pre-requisites:
- Get a [Wildcard Certificate](https://en.wikipedia.org/wiki/Wildcard_certificate)
- Add a Wildcard DNS record in your DNS zone (e.g.`*.yourdomain.com`)
- (If you are running locally) Add the line `127.0.0.1 *.localhost` to `/etc/hosts`

```bash
$ solid init
..
? Allow users to register their WebID (y/N) # write `y` here
..
$ solid start
```

Otherwise, if you want to use flags, this would be the equivalent

```bash
$ solid --multiuser --port 8443 --cert /path/to/cert --key /path/to/key --root ./accounts
```

Your users will have a dedicated folder under `./accounts`. Also, your root domain's website will be in `./accounts/yourdomain.tld`. New users can create accounts on `/api/accounts/new` and create new certificates on `/api/accounts/cert`. An easy-to-use sign-up tool is found on `/api/accounts`.

### Running Solid behind a reverse proxy (such as NGINX)
See [Running Solid behind a reverse proxy](https://github.com/solid/node-solid-server/wiki/Running-Solid-behind-a-reverse-proxy).

##### How can send emails to my users with my Gmail?

> To use Gmail you may need to configure ["Allow Less Secure Apps"](https://www.google.com/settings/security/lesssecureapps) in your Gmail account unless you are using 2FA in which case you would have to create an [Application Specific](https://security.google.com/settings/security/apppasswords) password. You also may need to unlock your account with ["Allow access to your Google account"](https://accounts.google.com/DisplayUnlockCaptcha) to use SMTP.

### Run the Linked Data Platform (intermediate)
If you don't want WebID Authentication and Web Access Control, you can run a simple Linked Data Platform.

```bash
# over HTTP
$ solid start --port 8080 --no-webid
# over HTTPS
$ solid start --port 8080 --ssl-key key.pem --ssl-cert cert.pem --no-webid
```

**Note:** if you want to run on HTTP, do not pass the `--ssl-*` flags, but keep `--no-webid`


### Extra flags (expert)
The command line tool has the following options

```
$ solid

  Usage: solid [options] [command]

  Commands:
    init [options]    create solid server configurations
    start [options]   run the Solid server

  Options:
    -h, --help     output usage information
    -V, --version  output the version number


$ solid init --help

  Usage: init [options]
  Create solid server configurations

  Options:
    -h, --help  output usage information
    --advanced  Ask for all the settings


$ solid start --help

  Usage: start [options]

  run the Solid server


  Options:

    --root [value]                Root folder to serve (default: './data')
    --port [value]                SSL port to use
    --serverUri [value]           Solid server uri (default: 'https://localhost:8443')
    --webid                       Enable WebID authentication and access control (uses HTTPS)
    --mount [value]               Serve on a specific URL path (default: '/')
    --config-path [value]
    --db-path [value]
    --auth [value]                Pick an authentication strategy for WebID: `tls` or `oidc`
    --certificate-header [value]
    --owner [value]               Set the owner of the storage (overwrites the root ACL file)
    --ssl-key [value]             Path to the SSL private key in PEM format
    --ssl-cert [value]            Path to the SSL certificate key in PEM format
    --no-reject-unauthorized      Accept self-signed certificates
    --multiuser                   Enable multi-user mode
    --idp [value]                 Obsolete; use --multiuser
    --no-live                     Disable live support through WebSockets
    --proxy [value]               Obsolete; use --corsProxy
    --corsProxy [value]           Serve the CORS proxy on this path
    --suppress-data-browser       Suppress provision of a data browser
    --data-browser-path [value]   An HTML file which is sent to allow users to browse the data (eg using mashlib.js)
    --suffix-acl [value]          Suffix for acl files (default: '.acl')
    --suffix-meta [value]         Suffix for metadata files (default: '.meta')
    --secret [value]              Secret used to sign the session ID cookie (e.g. "your secret phrase")
    --error-pages [value]         Folder from which to look for custom error pages files (files must be named <error-code>.html -- eg. 500.html)
    --force-user [value]          Force a WebID to always be logged in (useful when offline)
    --strict-origin               Enforce same origin policy in the ACL
    --useEmail                    Do you want to set up an email service?
    --email-host [value]          Host of your email service
    --email-port [value]          Port of your email service
    --email-auth-user [value]     User of your email service
    --email-auth-pass [value]     Password of your email service
    --useApiApps                  Do you want to load your default apps on /api/apps?
    --api-apps [value]            Path to the folder to mount on /api/apps
    -v, --verbose                 Print the logs to console
 ```

## Library Usage

### Install Dependencies

```
npm install
```

### Library Usage

The library provides two APIs:

- `solid.createServer(settings)`: starts a ready to use
    [Express](http://expressjs.com) app.
- `lnode(settings)`: creates an [Express](http://expressjs.com) that you can
    mount in your existing express app.

In case the `settings` is not passed, then it will start with the following
default settings.

```javascript
{
  cache: 0, // Set cache time (in seconds), 0 for no cache
  live: true, // Enable live support through WebSockets
  root: './', // Root location on the filesystem to serve resources
  secret: 'node-ldp', // Express Session secret key
  cert: false, // Path to the ssl cert
  key: false, // Path to the ssl key
  mount: '/', // Where to mount Linked Data Platform
  webid: false, // Enable WebID+TLS authentication
  suffixAcl: '.acl', // Suffix for acl files
  corsProxy: false, // Where to mount the CORS proxy
  errorHandler: false, // function(err, req, res, next) to have a custom error handler
  errorPages: false // specify a path where the error pages are
}
```

Have a look at the following examples or in the
[`examples/`](https://github.com/solid/node-solid-server/tree/master/examples) folder
for more complex ones

##### Simple Example

You can create an `solid` server ready to use using `solid.createServer(opts)`

```javascript
var solid = require('solid-server')
var ldp = solid.createServer({
    key: '/path/to/sslKey.pem',
    cert: '/path/to/sslCert.pem',
    webid: true
})
ldp.listen(3000, function() {
  // Started Linked Data Platform
})
```

##### Advanced Example

You can integrate `solid` in your existing [Express](https://expressjs.org)
app, by mounting the `solid` app on a specific path using `lnode(opts)`.

```javascript
var solid = require('solid-server')
var app = require('express')()
app.use('/test', solid(yourSettings))
app.listen(3000, function() {
  // Started Express app with ldp on '/test'
})
...
```

##### Logging

Run your app with the `DEBUG` variable set:

```bash
$ DEBUG="solid:*" node app.js
```

## Testing `solid` Locally

#### Pre-Requisites

In order to really get a feel for the Solid platform, and to test out `solid`,
you will need the following:

1. A WebID profile and browser certificate from one of the Solid-compliant
    identity providers, such as [databox.me](https://databox.me).

2. A server-side SSL certificate for `solid` to use (see the section below
    on creating a self-signed certificate for testing).

While these steps are technically optional (since you could launch it in
HTTP/LDP-only mode), you will not be able to use any actual Solid features
without them.

#### Creating a certificate for local testing

When deploying `solid` in production, we recommend that you go the
usual Certificate Authority route to generate your SSL certificate (as you
would with any website that supports HTTPS). However, for testing it locally,
you can easily generate a self-signed certificate for whatever domain you're
working with.

For example, here is how to generate a self-signed certificate for `localhost`
using the `openssl` library:

```bash

solid --webid --port 8443 --cert ../localhost.cert --key ../localhost.key -v
```

Note that this example creates the `localhost.cert` and `localhost.key` files
in a directory one level higher from the current, so that you don't
accidentally commit your certificates to `solid` while you're developing.

#### Accessing your server

If you started your `solid` server locally on port 8443 as in the example
above, you would then be able to visit `https://localhost:8443` in the browser
(ignoring the Untrusted Connection browser warnings as usual), where your
`solid` server would redirect you to the default data viewer app.

#### Editing your local `/etc/hosts`

To test certificates and account creation on subdomains, `solid`'s test suite
uses the following localhost domains: `nic.localhost`, `tim.localhost`, and
`nicola.localhost`. You will need to create host file entries for these, in
order for the tests to pass.

Edit your `/etc/hosts` file, and append:

```
# Used for unit testing solid
127.0.0.1 nic.localhost, tim.localhost, nicola.localhost
```

#### Running the Unit Tests

```bash
$ npm test
# running the tests with logs
$ DEBUG="solid:*" npm test
```

In order to test a single component, you can run

```javascript
npm run test-(acl|formats|params|patch)
```


## Contributing

`solid` is only possible due to the excellent work of the following contributors:

<table>
  <tbody>
    <tr>
      <th align="left">Tim Berners-Lee</th>
      <td><a href="https://github.com/timbl">GitHub/timbl</a></td>
      <td><a href="http://twitter.com/timberners_lee">Twitter/@timberners_lee</a></td>
      <td><a href="https://www.w3.org/People/Berners-Lee/card#i">WebID</a></td>
    </tr>
    <tr>
      <th align="left">Nicola Greco</th>
      <td><a href="https://github.com/nicola">GitHub/nicola</a></td>
      <td><a href="http://twitter.com/nicolagreco">Twitter/@nicolagreco</a></td>
      <td><a href="https://nicola.databox.me/profile/card#me">WebID</a></td>
    </tr>
    <tr>
      <th align="left">Martin Martinez Rivera</th>
      <td><a href="https://github.com/martinmr">GitHub/martinmr</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <th align="left">Andrei Sambra</th>
      <td><a href="https://github.com/deiu">GitHub/deiu</a></td>
      <td><a href="http://twitter.com/deiu">Twitter/@deiu</a></td>
      <td><a href="https://deiu.me/profile#me">WebID</a></td>
    </tr>
    <tr>
      <th align="left">Dmitri Zagidulin</th>
      <td><a href="https://github.com/dmitrizagidulin/">GitHub/dmitrizagidulin</a></td>
      <td><a href="https://twitter.com/codenamedmitri">Twitter/@codenamedmitri</a></td>
      <td></td>
    </tr>
    <tr>
      <th align="left">Ruben Verborgh</th>
      <td><a href="https://github.com/RubenVerborgh/">GitHub/RubenVerborgh</a></td>
      <td><a href="https://twitter.com/RubenVerborgh">Twitter/@RubenVerborgh</a></td>
      <td><a href="https://ruben.verborgh.org/profile/#me">WebID</a></td>
    </tr>
  </tbody>
</table>

#### Do you want to contribute?

- [Join us in Gitter](https://gitter.im/solid/chat) to help with development or to hang out with us :)
- [Create a new issue](https://github.com/solid/node-solid-server/issues/new) to report bugs
- [Fix an issue](https://github.com/solid/node-solid-server/issues)

Have a look at [CONTRIBUTING.md](https://github.com/solid/node-solid-server/blob/master/CONTRIBUTING.md).

## License

MIT
