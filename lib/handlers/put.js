module.exports = handler

const debug = require('debug')('solid:put')

async function handler (req, res, next) {
  const ldp = req.app.locals.ldp
  debug(req.originalUrl)
  res.header('MS-Author-Via', 'SPARQL')

  try {
    await ldp.put(req, req)
    debug('succeded putting the file')

    res.sendStatus(201)
    return next()
  } catch (err) {
    debug('error putting the file:' + err.message)
    err.message = 'Can\'t write file: ' + err.message
    return next(err)
  }
}
