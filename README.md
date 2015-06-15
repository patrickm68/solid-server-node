node-ldp-httpd
==============

All you need to run distributed linked data apps on top of a bit of file system.  Typically used as a proxy, with Apache doing the ACLs and GETs, just to do the fast real-time patch of data resources.

Linked Data Platform server based on rdflib.js and node.js

Using the rdflib.js library originally developed for the browser environment
and since ported to node.js, a linked data server supporting the POST and PATCH.
Minimum requirement is to suport the client side of the same library, which currently (September 2014)
uses a form of SPARQL-Patch via POST.

Features

- handles GET, PUT and PATCH
- includes proxy for cross-site data access

Goals (see issues):

- provide Access control using RDF ACLs
- provide authentication using webid
- real-time live updates using websokets (etc)


* Install

Run

    npm install

to install all dependencies. All dependencies are installed to the local node_modules directory and no other steps are necessary.

* Tests

To run the test suite run

    npm test

from the main directory. The test suite assumes the test server is already running. To start the server run

    make

from the main directory in another terminal.

There is another suite of tests in the test directory that covers the SPARQL-PATCH functionality. To run it run

    make

from the test directory. This suite also assumes the test server is already running. Eventually all tests in this second suite will be moved to the first one.
