/*jslint node: true*/
"use strict";

var time = require('./time.js');

function log(message) {
    // TODO substitute with npm debug
    if (process.env.DEBUG) {
        //console.log.apply(console, arguments); // was arguments
        console.log(time.timestamp() + ' ' + message ); // was arguments
    }
}

exports.log = log;

