module.exports = handler

const fs = require('fs')
const glob = require('glob')
const _path = require('path')
const $rdf = require('rdflib')
const Negotiator = require('negotiator')
const mime = require('mime-types')

const debug = require('debug')('solid:get')
const debugGlob = require('debug')('solid:glob')
const allow = require('./allow')

const translate = require('../utils.js').translate
const error = require('../http-error')

const RDFs = require('../ldp').mimeTypesAsArray()

async function handler (req, res, next) {
  const ldp = req.app.locals.ldp
  const includeBody = req.method === 'GET'
  const negotiator = new Negotiator(req)
  const baseUri = ldp.resourceMapper.resolveUrl(req.hostname, req.path)
  const path = res.locals.path || req.path
  const requestedType = negotiator.mediaType()
  let possibleRDFType = negotiator.mediaType(RDFs)

  res.header('MS-Author-Via', 'SPARQL')

  // Set live updates
  if (ldp.live) {
    res.header('Updates-Via', ldp.resourceMapper.resolveUrl(req.hostname).replace(/^http/, 'ws'))
  }

  debug(req.originalUrl + ' on ' + req.hostname)

  const options = {
    'hostname': req.hostname,
    'path': path,
    'includeBody': includeBody,
    'possibleRDFType': possibleRDFType,
    'range': req.headers.range
  }

  let ret
  try {
    ret = await ldp.get(options)
  } catch (err) {
    // use globHandler if magic is detected
    if (err.status === 404 && glob.hasMagic(path)) {
      debug('forwarding to glob request')
      return globHandler(req, res, next)
    } else {
      debug(req.method + ' -- Error: ' + err.status + ' ' + err.message)
      return next(err)
    }
  }

  let stream
  let contentType
  let container
  let contentRange
  let chunksize

  if (ret) {
    stream = ret.stream
    contentType = ret.contentType
    container = ret.container
    contentRange = ret.contentRange
    chunksize = ret.chunksize
  }

  // Till here it must exist
  if (!includeBody) {
    debug('HEAD only')
    res.setHeader('Content-Type', ret.contentType)
    return res.status(200).send('OK')
  }

  // Handle dataBrowser
  if (requestedType && requestedType.includes('text/html')) {
    const { path: filename } = await ldp.resourceMapper.mapUrlToFile({ url: options })
    let mimeTypeByExt = mime.lookup(_path.basename(filename))
    let isHtmlResource = mimeTypeByExt && mimeTypeByExt.includes('html')
    let useDataBrowser = ldp.dataBrowserPath && (
      container ||
      RDFs.includes(contentType) && !isHtmlResource && !ldp.suppressDataBrowser)

    if (useDataBrowser) {
      res.set('Content-Type', 'text/html')
      const defaultDataBrowser = _path.join(__dirname, '../../static/databrowser.html')
      const dataBrowserPath = ldp.dataBrowserPath === 'default' ? defaultDataBrowser : ldp.dataBrowserPath
      debug('   sending data browser file: ' + dataBrowserPath)
      res.sendFile(dataBrowserPath)
      return
    } else if (stream) {
      res.setHeader('Content-Type', contentType)
      return stream.pipe(res)
    }
  }

  // If request accepts the content-type we found
  if (stream && negotiator.mediaType([contentType])) {
    res.setHeader('Content-Type', contentType)
    if (contentRange) {
      const headers = { 'Content-Range': contentRange, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize }
      res.writeHead(206, headers)
      return stream.pipe(res)
    } else {
      return stream.pipe(res)
    }
  }

  // If it is not in our RDFs we can't even translate,
  // Sorry, we can't help
  if (!possibleRDFType) {
    return next(error(406, 'Cannot serve requested type: ' + contentType))
  }

  try {
    // Translate from the contentType found to the possibleRDFType desired
    const data = await translate(stream, baseUri, contentType, possibleRDFType)
    debug(req.originalUrl + ' translating ' + contentType + ' -> ' + possibleRDFType)
    res.setHeader('Content-Type', possibleRDFType)
    res.send(data)
    return next()
  } catch (err) {
    debug('error translating: ' + req.originalUrl + ' ' + contentType + ' -> ' + possibleRDFType + ' -- ' + 500 + ' ' + err.message)
    return next(error(500, 'Error translating between RDF formats'))
  }
}

async function globHandler (req, res, next) {
  const ldp = req.app.locals.ldp
  // TODO: This is a hack, that does not check if the target file exists, as this is quite complex with globbing.
  // TODO: Proper support for this is not implemented, as globbing support might be removed in the future.
  const filename = ldp.resourceMapper.getFullPath(req)
  const requestUri = (await ldp.resourceMapper.mapFileToUrl({ path: filename, hostname: req.hostname })).url

  const globOptions = {
    noext: true,
    nobrace: true,
    nodir: true
  }

  glob(filename, globOptions, function (err, matches) {
    if (err || matches.length === 0) {
      debugGlob('No files matching the pattern')
      return next(error(404, 'No files matching glob pattern'))
    }

    // Matches found
    const globGraph = $rdf.graph()

    debugGlob('found matches ' + matches)
    Promise.all(matches.map(match => new Promise(async (resolve, reject) => {
      const urlData = await ldp.resourceMapper.mapFileToUrl({ path: match, hostname: req.hostname })
      fs.readFile(match, {encoding: 'utf8'}, function (err, fileData) {
        if (err) {
          debugGlob('error ' + err)
          return resolve()
        }
        // Files should be Turtle
        if (urlData.contentType !== 'text/turtle') {
          return resolve()
        }
        // The agent should have Read access to the file
        hasReadPermissions(match, req, res, function (allowed) {
          if (allowed) {
            try {
              $rdf.parse(fileData, globGraph, urlData.url, 'text/turtle')
            } catch (parseErr) {
              debugGlob(`error parsing ${match}: ${parseErr}`)
            }
          }
          return resolve()
        })
      })
    })))
    .then(() => {
      const data = $rdf.serialize(undefined, globGraph, requestUri, 'text/turtle')
      // TODO this should be added as a middleware in the routes
      res.setHeader('Content-Type', 'text/turtle')
      debugGlob('returning turtle')

      res.send(data)
      return next()
    })
  })
}

// TODO: get rid of this ugly hack that uses the Allow handler to check read permissions
function hasReadPermissions (file, req, res, callback) {
  const ldp = req.app.locals.ldp

  if (!ldp.webid) {
    return callback(true)
  }

  const root = ldp.resourceMapper.getBasePath(req.hostname)
  const relativePath = '/' + _path.relative(root, file)
  res.locals.path = relativePath
  allow('Read')(req, res, err => callback(!err))
}
