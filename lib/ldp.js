module.exports = LDP
var mime = require('mime')
var path = require('path')
var S = require('string')
var fs = require('fs')
var $rdf = require('rdflib')
var async = require('async')
var url = require('url')
var mkdirp = require('fs-extra').mkdirp
var uuid = require('node-uuid')
var debug = require('./debug')
var utils = require('./utils')
var ns = require('./vocab/ns').ns
var error = require('./http-error')
var stringToStream = require('./utils').stringToStream
var serialize = require('./utils').serialize
var extend = require('extend')
var doWhilst = require('async').doWhilst
var rimraf = require('rimraf')
var turtleExtension = '.ttl'

function addContainerStats (ldp, filename, resourceGraph, next) {
  ldp.stat(filename, function (err, containerStats) {
    if (!err) {
      addStats(resourceGraph, '', containerStats)
      resourceGraph.add(
        resourceGraph.sym(''),
        ns.rdf('type'),
        ns.ldp('BasicContainer'))

      resourceGraph.add(
        resourceGraph.sym(''),
        ns.rdf('type'),
        ns.ldp('Container'))
    }
    next()
  })
}

function addFile (ldp, resourceGraph, baseUri, uri, container, file, callback) {
  // Skip .meta and .acl
  if (S(file).endsWith(ldp.suffixMeta) || S(file).endsWith(ldp.suffixAcl)) {
    return callback(null)
  }

  // Get file stats
  ldp.stat(container + file, function (err, stats) {
    if (err) {
      // File does not exist, skip
      return callback(null)
    }

    var fileSubject = file + (stats.isDirectory() ? '/' : '')
    // var fileBaseUri = utils.filenameToBaseUri(fileSubject, uri, root)

    // Add fileStats to resource Graph
    addStats(resourceGraph, fileSubject, stats)

    // Add to `contains` list
    resourceGraph.add(
      resourceGraph.sym(''),
      ns.ldp('contains'),
      resourceGraph.sym(fileSubject))

    // Set up a metaFile path
    var metaFile = container + file +
      (stats.isDirectory() ? '/' : '') +
      (S(file).endsWith(turtleExtension) ? '' : ldp.suffixMeta)

    getMetadataGraph(ldp, metaFile, baseUri, function (err, metadataGraph) {
      if (err) {
        metadataGraph = $rdf.graph()
      }

      // Add Container or BasicContainer types
      if (stats.isDirectory()) {
        resourceGraph.add(
          metadataGraph.sym(fileSubject),
          ns.rdf('type'),
          ns.ldp('BasicContainer'))

        resourceGraph.add(
          metadataGraph.sym(fileSubject),
          ns.rdf('type'),
          ns.ldp('Container'))
      }
      // Add generic LDP type
      resourceGraph.add(
        metadataGraph.sym(fileSubject),
        ns.rdf('type'),
        ns.ldp('Resource'))

      // Add type from metadataGraph
      metadataGraph
        .statementsMatching(
          metadataGraph.sym(baseUri),
          ns.rdf('type'),
          undefined)
        .forEach(function (typeStatement) {
          // If the current is a file and its type is BasicContainer,
          // This is not possible, so do not infer its type!
          if (
            (
              typeStatement.object.uri !== ns.ldp('BasicContainer').uri &&
              typeStatement.object.uri !== ns.ldp('Container').uri
            ) ||
            !stats.isFile()
          ) {
            resourceGraph.add(
              resourceGraph.sym(fileSubject),
              typeStatement.predicate,
              typeStatement.object)
          }
        })

      return callback(null)
    })
  })
}

function addStats (resourceGraph, baseUri, stats) {
  resourceGraph.add(
    resourceGraph.sym(baseUri),
    ns.stat('mtime'),
    stats.mtime.getTime() / 1000)

  resourceGraph.add(
    resourceGraph.sym(baseUri),
    ns.stat('size'),
    stats.size)
}

function readdir (filename, callback) {
  debug.handlers('GET -- Reading directory')
  fs.readdir(filename, function (err, files) {
    if (err) {
      debug.handlers('GET -- Error reading files: ' + err)
      return callback(error(err, 'Can\'t read container'))
    }

    debug.handlers('Files in directory: ' + files)
    return callback(null, files)
  })
}

function getMetadataGraph (ldp, metaFile, fileBaseUri, callback) {
  ldp.stat(metaFile, function (err, metaStats) {
    if (err) {
      return callback(err)
    }

    if (metaStats && metaStats.isFile()) {
      ldp.readFile(metaFile, function (err, rawMetadata) {
        if (err) {
          return callback(err)
        }

        var metadataGraph = $rdf.graph()
        try {
          $rdf.parse(
            rawMetadata,
            metadataGraph,
            fileBaseUri,
            'text/turtle')
        } catch (dirErr) {
          return callback(error(err, 'Can\'t parse container metadata'))
        }
        return callback(null, metadataGraph)
      })
    } else {
      return callback(null, $rdf.graph())
    }
  })
}

function LDP (argv) {
  argv = argv || {}
  extend(this, argv)

  // Setting root
  if (!this.root) {
    this.root = process.cwd()
  }
  if (!(S(this.root).endsWith('/'))) {
    this.root += '/'
  }

  // Suffixes
  if (!this.suffixAcl) {
    this.suffixAcl = '.acl'
  }
  if (!this.suffixMeta) {
    this.suffixMeta = '.meta'
  }
  this.turtleExtensions = ['.ttl', this.suffixAcl, this.suffixMeta]

  // Error pages folder
  this.errorPages = null
  if (!this.noErrorPages) {
    this.errorPages = argv.errorPages
    if (!this.errorPages) {
      // TODO: For now disable error pages if errorPages parameter is not explicitly passed
      this.noErrorPages = true
    } else if (!S(this.errorPages).endsWith('/')) {
      this.errorPages += '/'
    }
  }

  if (this.fileBrowser !== false) {
    this.fileBrowser = argv.fileBrowser ||
      'https://linkeddata.github.io/warp/#/list/'
  }

  if (this.dataBrowser !== false) {
    this.dataBrowser = true
  }

  if (this.skin !== false) {
    this.skin = true
  }

  if (this.proxy && this.proxy[0] !== '/') {
    this.proxy = '/' + this.proxy
  }

  debug.settings('Suffix Acl: ' + this.suffixAcl)
  debug.settings('Suffix Meta: ' + this.suffixMeta)
  debug.settings('Filesystem Root: ' + this.root)
  debug.settings('Allow WebID registration (multi-user): ' +
    !!this.webid)
  debug.settings('Live-updates: ' + !!this.live)
  debug.settings('Identity Provider: ' + !!this.idp)
  debug.settings('Default file browser app: ' + this.fileBrowser)
  debug.settings('Default data browser app: ' + this.dataBrowser)

  return this
}

LDP.prototype.stat = function (file, callback) {
  fs.stat(file, function (err, stats) {
    if (err) {
      return callback(error(err, 'Can\'t read metadata'))
    }

    return callback(null, stats)
  })
}

LDP.prototype.createReadStream = function (filename) {
  return fs.createReadStream(filename)
}

LDP.prototype.readFile = function (filename, callback) {
  fs.readFile(
    filename,
    { 'encoding': 'utf8' },
    function (err, data) {
      if (err) {
        return callback(error(err, 'Can\'t read file'))
      }

      return callback(null, data)
    })
}

LDP.prototype.readContainerMeta = function (directory, callback) {
  var ldp = this

  if (directory[directory.length - 1] !== '/') {
    directory += '/'
  }

  ldp.readFile(directory + ldp.suffixMeta, function (err, data) {
    if (err) {
      return callback(error(err, 'Can\'t read meta file'))
    }

    return callback(null, data)
  })
}

LDP.prototype.listContainer = function (filename, uri, containerData,
                                        contentType, callback) {
  var ldp = this
  var host = url.parse(uri).hostname
  var root = !ldp.idp ? ldp.root : ldp.root + host + '/'

  var baseUri = utils.filenameToBaseUri(filename, uri, root)
  var resourceGraph = $rdf.graph()

  try {
    $rdf.parse(containerData, resourceGraph, baseUri, 'text/turtle')
  } catch (err) {
    debug.handlers('GET -- Error parsing data: ' + err)
    return callback(error(500, 'Can\'t parse container'))
  }

  async.waterfall([
    // add container stats
    function (next) {
      addContainerStats(ldp, filename, resourceGraph, next)
    },
    // reading directory
    function (next) {
      readdir(filename, next)
    },
    // Iterate through all the files
    function (files, next) {
      async.each(
        files,
        function (file, cb) {
          addFile(ldp, resourceGraph, baseUri, uri, filename, file, cb)
        },
        next)
    }
  ],
  function (err, data) {
    if (err) {
      return callback(error(500, 'Can\'t list container'))
    }
    // TODO 'text/turtle' is fixed, should be contentType instead
    // This forces one more translation turtle -> desired
    serialize(resourceGraph, null, 'text/turtle', function (err, result) {
      if (err) {
        debug.handlers('GET -- Error serializing container: ' + err)
        return callback(error(500, 'Can\'t serialize container'))
      }
      return callback(null, result)
    })
  })
}

LDP.prototype.post = function (hostname, containerPath, slug, stream, container,
                               callback) {
  var ldp = this

  debug.handlers('POST -- On parent: ' + containerPath)

  // prepare slug
  if (container && !S(slug).endsWith('/')) {
    slug += '/'
  }

  // TODO: possibly package this in ldp.post
  ldp.getAvailablePath(hostname, containerPath, slug, function (resourcePath) {
    debug.handlers('POST -- Will create at: ' + resourcePath)
    var meta = ''

    if (container) {
      if (resourcePath[resourcePath.length - 1] !== '/') {
        resourcePath += '/'
      }
      meta = ldp.suffixMeta
    }

    ldp.put(hostname, resourcePath + meta, stream, function (err) {
      if (err) callback(err)

      callback(null, resourcePath)
    })
  })
}

LDP.prototype.put = function (host, resourcePath, stream, callback) {
  var ldp = this
  var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
  var filePath = utils.uriToFilename(resourcePath, root, host)

  // PUT requests not supported on containers. Use POST instead
  if (filePath[filePath.length - 1] === '/') {
    return callback(error(409,
      'PUT not supported on containers, use POST instead'))
  }

  mkdirp(path.dirname(filePath), function (err) {
    if (err) {
      debug.handlers('PUT -- Error creating directory: ' + err)
      return callback(error(err,
        'Failed to create the path to the new resource'))
    }
    var file = stream.pipe(fs.createWriteStream(filePath))
    file.on('error', function () {
      callback(error(500, 'Error writing data'))
    })
    file.on('finish', function () {
      debug.handlers('PUT -- Wrote data to: ' + filePath)
      callback(null)
    })
  })
}

LDP.prototype.exists = function (host, reqPath, callback) {
  this.get(host, reqPath, undefined, false, undefined, callback)
}

LDP.prototype.get = function (host, reqPath, baseUri, includeBody, contentType,
                              callback) {
  var ldp = this
  var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
  var filename = utils.uriToFilename(reqPath, root)

  ldp.stat(filename, function (err, stats) {
    // File does not exist
    if (err) {
      return callback(error(err, 'Can\'t find resource requested'))
    }

    // Just return, since resource exists
    if (!includeBody) {
      return callback(null, stats, contentType, stats.isDirectory())
    }

    // Found a container
    if (stats.isDirectory()) {
      return ldp.readContainerMeta(filename, function (err, metaFile) {
        if (err) {
          metaFile = ''
        }

        ldp.listContainer(filename, baseUri, metaFile, contentType,
          function (err, data) {
            if (err) {
              debug.handlers('GET container -- Read error:' + err.message)
              return callback(err)
            }
            var stream = stringToStream(data)
            // TODO 'text/turtle' is fixed, should be contentType instead
            // This forces one more translation turtle -> desired
            return callback(null, stream, 'text/turtle', true)
          })
      })
    } else {
      var stream = ldp.createReadStream(filename)
      stream
        .on('error', function (err) {
          debug.handlers('GET -- Read error:' + err.message)
          return callback(error(err, 'Can\'t create file ' + err))
        })
        .on('open', function () {
          debug.handlers('GET -- Read Start.')
          var contentType = mime.lookup(filename)
          if (utils.hasSuffix(filename, ldp.turtleExtensions)) {
            contentType = 'text/turtle'
          }
          return callback(null, stream, contentType, false)
        })
    }
  })
}

LDP.prototype.delete = function (host, resourcePath, callback) {
  var ldp = this
  var root = !ldp.idp ? ldp.root : ldp.root + host + '/'
  var filename = utils.uriToFilename(resourcePath, root)
  ldp.stat(filename, function (err, stats) {
    if (err) {
      return callback(error(404, 'Can\'t find ' + err))
    }

    if (stats.isDirectory()) {
      return ldp.deleteContainer(filename, callback)
    } else {
      return ldp.deleteResource(filename, callback)
    }
  })
}

LDP.prototype.deleteContainer = function (directory, callback) {
  var self = this
  if (directory[directory.length - 1] !== '/') {
    directory += '/'
  }

  var countValid = 0
  fs.readdir(directory, function (err, list) {
    if (err) return callback(error(404, 'The container does not exist'))

    if (list.indexOf(self.suffixMeta) > -1) {
      countValid++
    }

    if (list.indexOf(self.suffixAcl) > -1) {
      countValid++
    }

    if (list.length !== countValid) {
      return callback(error(409, 'Container is not empty'))
    }

    return rimraf(directory, function (err) {
      if (err) return callback(error(err, 'Failed to delete the container'))
      return callback(null)
    })
  })
}

LDP.prototype.deleteResource = function (filename, callback) {
  return fs.unlink(filename, function (err, data) {
    if (err) {
      debug.container('DELETE -- unlink() error: ' + err)
      return callback(error(err, 'Failed to delete resource'))
    }
    return callback(null, data)
  })
}

LDP.prototype.getAvailablePath = function (host, containerURI, slug, callback) {
  var self = this
  var exists

  if (!slug) {
    slug = uuid.v1()
  }

  var newPath = path.join(containerURI, slug)

  // TODO: maybe a nicer code
  doWhilst(
    function (next) {
      self.exists(host, newPath, function (err) {
        exists = !err

        if (exists) {
          var id = uuid.v1().split('-')[0] + '-'
          newPath = path.join(containerURI, id + slug)
        }

        next()
      })
    },
    function () {
      return exists === true
    },
    function () {
      callback(newPath)
    })
}
