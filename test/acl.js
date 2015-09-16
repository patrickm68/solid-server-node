/*jslint node: true*/
var assert = require('chai').assert;
var fs = require('fs');
var $rdf = require('rdflib');
var request = require('request');
var S = require('string');
var supertest = require('supertest');
var async = require('async');

// Helper functions for the FS
var rm = require('./test-utils').rm;
var write = require('./test-utils').write;
var cp = require('./test-utils').cp;
var read = require('./test-utils').read;

var ldnode = require('../index');
var ACL = require('../lib/acl').ACL;
var ns = require('../lib/vocab/ns.js').ns;

describe('ACL HTTP', function() {
    this.timeout(10000);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    var address = 'https://localhost:3456/test/';

    var ldpHttpsServer;
    var ldp = ldnode.createServer({
        mount: '/test',
        root: __dirname + '/resources',
        key: __dirname + '/keys/key.pem',
        cert: __dirname + '/keys/cert.pem',
        webid: true
    });

    before(function (done) {
        var ldpHttpsServer = ldp.listen(3456, done);
    });

    after(function () {
        if (ldpHttpsServer) ldpHttpsServer.close();
    });

    var aclExtension = '.acl';
    var metaExtension = '.meta';
    var server = supertest(address);

    var testDir = 'acl/testDir';
    var testDirAclFile = testDir + '/' + aclExtension;
    var testDirMetaFile = testDir + '/' + metaExtension;

    var abcFile = testDir + '/abc.ttl';
    var abcAclFile = abcFile + aclExtension;
    var abcdFile = testDir + '/dir1/dir2/abcd.ttl';
    var abcdAclFile = abcFile + aclExtension;

    var globFile = testDir + "/*";

    var groupFile = testDir + "/group";

    var origin1 = "http://example.org/";
    var origin2 = "http://example.com/";

    var user1 = "https://user1.databox.me/profile/card#me";
    var user2 = "https://user2.databox.me/profile/card#me";
    var userCredentials = {
        user1: {
            cert: fs.readFileSync(__dirname + '/keys/user1-cert.pem'),
            key: fs.readFileSync(__dirname + '/keys/user1-key.pem')
        },
        user2: {
            cert: fs.readFileSync(__dirname + '/keys/user2-cert.pem'),
            key: fs.readFileSync(__dirname + '/keys/user2-key.pem')
        }
    };

    function createOptions(path, user) {
        var options = {
            url: address + path
        };
        if (user) {
            options.agentOptions = userCredentials[user];
        }
        return options;
    }


    describe('Basic', function() {
        it('Should return "Hello, World!"', function(done) {
            var options = createOptions('hello.html', 'user1');
            request(options, function(error, response, body) {
                assert.equal(response.statusCode, 200);
                assert.match(response.headers['content-type'], /text\/html/);
                done();
            });
        });
        it("Should return User header", function(done) {
            var options = createOptions('hello.html', 'user1');
            request(options, function(error, response, body) {
                assert.equal(response.statusCode, 200);
                assert.equal(response.headers.user, user1);
                done();
            });
        });
    });

    describe("Empty .acl", function() {
        it("Should create test folder", function(done) {
            var options = createOptions(testDirMetaFile, 'user1');
            options.body = "";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("Should create empty acl file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = '';
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("Should return text/turtle for the acl file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            options.headers = {
                accept: 'text/turtle'
            };
            request.get(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                assert.match(response.headers['content-type'], /text\/turtle/);
                done();
            });
        });
        it("Should create test file", function(done) {
            var options = createOptions(abcFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = '<a> <b> <c> .';
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("Should create test file's acl file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = '';
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("Should access test file's acl file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            options.headers = {
                accept: 'text/turtle'
            };
            request.get(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                assert.match(response.headers['content-type'], /text\/turtle/);
                done();
            });
        });
    });

    describe("Origin", function() {
        it("Should PUT new ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + testDir + "/" + ">, <" + address + testDirAclFile + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#agent> <" + user1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#origin> <" + origin1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n" +
                "<#Public>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + testDir + "/" + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n" +
                " <http://www.w3.org/ns/auth/acl#origin> <" + origin1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
                //TODO triple header
                //TODO user header
            });
        });
        it("user1 should be able to access test directory", function(done) {
            var options = createOptions(testDir, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to access to test directory when origin is valid",
            function(done) {
                var options = createOptions(testDir, 'user1');
                options.headers = {
                    origin: origin1
                };
                request.head(options, function(error, response, body) {
                    assert.equal(error, null);
                    assert.equal(response.statusCode, 200);
                    done();
                });
            });
        it("user1 should be denied access to test directory when origin is invalid",
            function(done) {
                var options = createOptions(testDir, 'user1');
                options.headers = {
                    origin: origin2
                };
                request.head(options, function(error, response, body) {
                    assert.equal(error, null);
                    assert.equal(response.statusCode, 403);
                    done();
                });
            });
        it("agent should be able to access test directory", function(done) {
            var options = createOptions(testDir);
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("agent should be able to access to test directory when origin is valid",
            function(done) {
                var options = createOptions(testDir, 'user1');
                options.headers = {
                    origin: origin1
                };
                request.head(options, function(error, response, body) {
                    assert.equal(error, null);
                    assert.equal(response.statusCode, 200);
                    done();
                });
            });
        it("agent should be denied access to test directory when origin is invalid",
            function(done) {
                var options = createOptions(testDir);
                options.headers = {
                    origin: origin2
                };
                request.head(options, function(error, response, body) {
                    assert.equal(error, null);
                    assert.equal(response.statusCode, 401);
                    done();
                });
            });
    });

    describe("Owner-only", function() {
        var body = "<#Owner>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + testDir + "/" +
            ">, <" + address + testDirAclFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#owner> <" + user1 + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n";
        it("user1 should be able to access test directory", function(done) {
            var options = createOptions(testDir, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user2 should be able to access test directory", function(done) {
            var options = createOptions(testDir, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("Should create new ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = body;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to access ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to access test directory", function(done) {
            var options = createOptions(testDir, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to modify ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = body;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user2 should not be able to access test direcotory", function(done) {
            var options = createOptions(testDir, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should not be able to access ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should not be able to modify ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user2');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("agent request should require authorization", function(done) {
            var options = createOptions(testDirAclFile);
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
    });

    describe("Read-only", function() {
        var body = "<#Owner>\n" +
            " a <http://www.w3.org/ns/auth/acl#Authorization> ;\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + testDir + "/" +
            ">, <" + address + testDirAclFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agent> <" + user1 + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n" +
            "<#Public>\n" +
            " a <http://www.w3.org/ns/auth/acl#Authorization> ;\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + testDir + "/" + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n";

        it("user1 should be able to create new ACL file",
            function(done) {
                var options = createOptions(testDirAclFile, 'user1');
                options.headers = {
                    'content-type': 'text/turtle'
                };
                options.body = body;
                request.put(options, function(error, response, body) {
                    assert.equal(error, null);
                    assert.equal(response.statusCode, 201);
                    done();
                });
            });
        it("user1 should be able to access ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to access test directory", function(done) {
            var options = createOptions(testDir, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to modify ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = body;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user2 should be able to access test direcotory", function(done) {
            var options = createOptions(testDir, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user2 should not be able to access ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should not be able to modify ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user2');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("agent should be able to access test direcotory", function(done) {
            var options = createOptions(testDir);
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("agent should not be able to modify ACL file", function(done) {
            var options = createOptions(testDirAclFile);
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
    });

    describe("Glob", function() {
        it("user2 should be able to send glob request", function(done) {
            var options = createOptions(globFile, 'user2');
            request.get(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                var globGraph = $rdf.graph();
                $rdf.parse(body, globGraph, address + testDir + '/', 'text/turtle');
                var authz = globGraph.the(undefined, undefined, ns.acl("Authorization"));
                assert.equal(authz, null);
                done();
            });
        });
        it("user1 should be able to send glob request", function(done) {
            var options = createOptions(globFile, 'user1');
            request.get(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                var globGraph = $rdf.graph();
                $rdf.parse(body, globGraph, address + testDir + '/', 'text/turtle');
                var authz = globGraph.the(undefined, undefined, ns.acl("Authorization"));
                assert.equal(authz, null);
                done();
            });
        });
        it("user1 should be able to delete ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            request.del(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
    });

    describe("Append-only", function() {
        var body = "<#Owner>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + abcFile +
            ">, <" + address + abcAclFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agent> <" + user1 + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n" +
            "<#AppendOnly>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + abcFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Append> .\n";
        it("user1 should be able to write test file's acl file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = body;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to access test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to access test file", function(done) {
            var options = createOptions(abcFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        //TODO POST instead of PUT
        it("user1 should be able to modify test file", function(done) {
            var options = createOptions(abcFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<a> <b> <c> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user2 should not be able to access test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should not be able to access test file", function(done) {
            var options = createOptions(abcFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should be able to modify test file", function(done) {
            var options = createOptions(abcFile, 'user2');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("agent should not be able to access test file", function(done) {
            var options = createOptions(abcFile);
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("agent should be able to modify test file", function(done) {
            var options = createOptions(abcFile);
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<g> <h> <i> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to delete test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            request.del(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
    });

    describe("Restricted", function() {
        var body = "<#Owner>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + abcFile + ">, <" +
            address + abcAclFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agent> <" + user1 + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n" +
            "<#Restricted>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + abcFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agent> <" + user2 + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write>.\n";
        it("user1 should be able to modify test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = body;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to access test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to access test file", function(done) {
            var options = createOptions(abcFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to modify test file", function(done) {
            var options = createOptions(abcFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<a> <b> <c> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user2 should be able to access test file", function(done) {
            var options = createOptions(abcFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user2 should not be able to access test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should be able to modify test file", function(done) {
            var options = createOptions(abcFile, 'user2');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("agent should not be able to access test file", function(done) {
            var options = createOptions(abcFile);
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("agent should not be able to modify test file", function(done) {
            var options = createOptions(abcFile);
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("user1 should be able to delete test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            request.del(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
    });

    describe("Group", function() {
        var groupTriples = "<#> a <http://xmlns.com/foaf/0.1/Group>;\n" +
            " <http://xmlns.com/foaf/0.1/member> <a>, <b>, <" + user2 + "> .\n";
        var body = "<#Owner>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + abcFile + ">, <" +
            address + abcAclFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agent> <" + user1 + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#defaultForNew> <" + address + testDir + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n" +
            "<#Group>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + abcFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agentClass> <" + address + groupFile + "#>;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n";
        it("user1 should be able to add group triples", function(done) {
            var options = createOptions(groupFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = groupTriples;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to modify test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = body;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });

        it("user1 should be able to access test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to modify test file", function(done) {
            var options = createOptions(abcFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<a> <b> <c> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to access test file", function(done) {
            var options = createOptions(abcFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user2 should not be able to access test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should be able to access test file", function(done) {
            var options = createOptions(abcFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user2 should not be able to modify test file", function(done) {
            var options = createOptions(abcFile, 'user2');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("agent should not be able to access test file", function(done) {
            var options = createOptions(abcFile);
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("agent should not be able to modify test file", function(done) {
            var options = createOptions(abcFile);
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
        it("user1 should be able to delete group file", function(done) {
            var options = createOptions(groupFile, 'user1');
            request.del(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to delete test file's ACL file", function(done) {
            var options = createOptions(abcAclFile, 'user1');
            request.del(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
    });

    describe("defaultForNew", function() {
        var body = "<#Owner>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + testDir + "/" + ">, <" +
            address + testDirAclFile + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agent> <" + user1 + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#defaultForNew> <" + address + testDir + "/" + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read>, <http://www.w3.org/ns/auth/acl#Write> .\n" +
            "<#Default>\n" +
            " <http://www.w3.org/ns/auth/acl#accessTo> <" + address + testDir + "/" + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#defaultForNew> <" + address + testDir + "/" + ">;\n" +
            " <http://www.w3.org/ns/auth/acl#agentClass> <http://xmlns.com/foaf/0.1/Agent>;\n" +
            " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n";
        it("user1 should be able to modify test direcotory's ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = body;
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to access test direcotory's ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user1 should be able to create new test file", function(done) {
            var options = createOptions(abcdFile, 'user1');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<a> <b> <c> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 201);
                done();
            });
        });
        it("user1 should be able to access new test file", function(done) {
            var options = createOptions(abcdFile, 'user1');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user2 should not be able to access test direcotory's ACL file", function(done) {
            var options = createOptions(testDirAclFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("user2 should be able to access new test file", function(done) {
            var options = createOptions(abcdFile, 'user2');
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("user2 should not be able to modify new test file", function(done) {
            var options = createOptions(abcdFile, 'user2');
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 403);
                done();
            });
        });
        it("agent should be able to access new test file", function(done) {
            var options = createOptions(abcdFile);
            request.head(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        it("agent should not be able to modify new test file", function(done) {
            var options = createOptions(abcdFile);
            options.headers = {
                'content-type': 'text/turtle'
            };
            options.body = "<d> <e> <f> .\n";
            request.put(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 401);
                done();
            });
        });
    });

    describe("WebID delegation tests", function() {
        it("user1 should be able delegate to user2", function(done) {
            var body = "<" + user1 + "> <http://www.w3.org/ns/auth/acl#delegates> <" + user2 +"> .";
            var options = {
                url: user1,
                headers: {
                    'content-type': 'text/turtle'
                },
                agentOptions: {
                    key: userCredentials.user1.key,
                    cert: userCredentials.user1.cert
                }
            };
            request.post(options, function(error, response, body) {
                assert.equal(error, null);
                assert.equal(response.statusCode, 200);
                done();
            });
        });
        // it("user2 should be able to make requests on behalf of user1", function(done) {
            // var options = createOptions(abcdFile, 'user2');
            // options.headers = {
                // 'content-type': 'text/turtle',
                // 'On-Behalf-Of': '<' + user1 + '>'
            // };
            // options.body = "<d> <e> <f> .";
            // request.post(options, function(error, response, body) {
                // assert.equal(error, null);
                // assert.equal(response.statusCode, 200);
                // done();
            // });
        // });
    });

    describe("Cleaup", function() {
        it("should remove all files and dirs created", function(done) {
            try {
                // must remove the ACLs in sync
                fs.unlinkSync(__dirname + '/resources/' + testDir + '/dir1/dir2/abcd.ttl');
                fs.rmdirSync(__dirname + '/resources/' + testDir + '/dir1/dir2/');
                fs.rmdirSync(__dirname + '/resources/' + testDir + '/dir1/');
                fs.unlinkSync(__dirname + '/resources/' + abcFile);
                fs.unlinkSync(__dirname + '/resources/' + testDirAclFile);
                fs.unlinkSync(__dirname + '/resources/' + testDirMetaFile);
                fs.rmdirSync(__dirname + '/resources/' + testDir);
                fs.rmdirSync(__dirname + '/resources/acl/');
                done();
            } catch (e) {
                done(e);
            }
        });
    });
});

describe('ACL Class', function () {
    this.timeout(10000);
    var ldpConfig = {
        mount: '/test',
        root: __dirname + '/resources',
        key: __dirname + '/keys/key.pem',
        cert: __dirname + '/keys/cert.pem',
        webid: true
    };
    var ldpServer = ldnode(ldpConfig);
    var ldp = ldpServer.locals.ldp;

    var user1 = "https://user1.databox.me/profile/card#me";
    var user2 = "https://user2.databox.me/profile/card#me";
    var address = 'https://server.tld/test';

    describe('readACL', function () {
        it('should report a 404 error if no acl is found', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: 'https://server.tld/test'
            });

            acl.readACL(__dirname + '/resources/.acl', 'https://server.tld/test', function (err, res) {
                assert.equal(err.status, 404);
                assert.notOk(res);
                done();
            });
        });

        it('should report a 404 error if .acl cannot be parsed', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });
            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " XXXXXXXhttp://www.w3.org/ns/auth/acl#owner> <" + user1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n",
                '.acl');

            acl.readACL(__dirname + '/resources/.acl', address, function (err, res) {
                rm('.acl');
                assert.equal(err.status, 500);
                assert.notOk(res);
                done();
            });
        });

        it('should return a parsed graph of the acl on success', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });
            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#owner> <" + user1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n",
                '.acl');

            acl.readACL(__dirname + '/resources/.acl', address, function (err, graph) {
                rm('.acl');
                assert.notOk(err);
                assert.ok(graph);
                done();
            });
        });

        it('should return a graph on empty ACL', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });
            write(
                "\n",
                '.acl');

            acl.readACL(__dirname + '/resources/.acl', address, function (err, graph) {
                rm('.acl');
                assert.notOk(err);
                assert.ok(graph);
                done();
            });
        });


    });

    describe('findACLInPath', function () {
        it('should allow user when permission is found in pathAcl/pathUri', function(done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });

            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#owner> <" + user1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n",
                '.acl');

            acl.readACL(__dirname + '/resources/.acl', address, function (err, aclGraph) {
                async.parallel([
                    function(next) {
                        acl.findACLinPath('Read', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(result, true);
                            assert.notOk(err);
                            next();
                        });
                    },
                    function(next) {
                        acl.findACLinPath('Write', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(result, true);
                            assert.notOk(err);
                            next();
                        });
                    },
                    function(next) {
                        acl.findACLinPath('Append', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(result, true);
                            assert.notOk(err);
                            next();
                        });
                    }
                ], function(err) {
                    rm('.acl');
                    done(err);
                });
            });
        });

        it('should return 403 if user is not authorized', function(done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });

            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#owner> <" + user2 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n",
                '.acl');

            acl.readACL(__dirname + '/resources/.acl', address, function (err, aclGraph) {
                async.parallel([
                    function(next) {
                        acl.findACLinPath('Read', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(err.status, 403);
                            assert.notOk(result);
                            next();
                        });
                    },
                    function(next) {
                        acl.findACLinPath('Write', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(err.status, 403);
                            assert.notOk(result);
                            next();
                        });
                    },
                    function(next) {
                        acl.findACLinPath('Append', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(err.status, 403);
                            assert.notOk(result);
                            next();
                        });
                    }
                ], function(err) {
                    rm('.acl');
                    done(err);
                });
            });
        });
        it('should return 401 if user is not authenticated', function(done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                uri: address
            });

            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#owner> <" + user2 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n",
                '.acl');

            acl.readACL(__dirname + '/resources/.acl', address, function (err, aclGraph) {
                async.parallel([
                    function(next) {
                        acl.findACLinPath('Read', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(err.status, 401);
                            assert.notOk(result);
                            next();
                        });
                    },
                    function(next) {
                        acl.findACLinPath('Write', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(err.status, 401);
                            assert.notOk(result);
                            next();
                        });
                    },
                    function(next) {
                        acl.findACLinPath('Append', __dirname + '/resources/.acl', address, aclGraph, 'accessTo', user1, function (err, result) {
                            assert.equal(err.status, 401);
                            assert.notOk(result);
                            next();
                        });
                    }
                ], function(err) {
                    rm('.acl');
                    done(err);
                });
            });
        });

        it('should report that ACL has not been found if aclGraph is empty', function(done) {
            var acl = new ACL({
                ldp: ldp
            });

            acl.findACLinPath('Read', __dirname + '/resources/.acl', address, $rdf.graph(), 'accessTo', user1, function (err, result) {
                assert.notOk(err);
                assert.equal(result, false);
                done();
            });
        });
    });

    describe('findACL', function () {
        it('should return no error if permission is found', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });

            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#owner> <" + user1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n",
                '.acl');

            acl.findACL('Read', '/', user1, function (err) {
                rm('.acl');
                assert.notOk(err);
                done();
            });
        });

        it('should return error error if user is allowed to `Read` but not to `Write`', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });

            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#owner> <" + user1 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Read> .\n",
                '.acl');

            acl.findACL('Write', '/', user1, function (err) {
                rm('.acl');
                assert.equal(err.status, 403);
                done();
            });
        });

        it('should return error 403 if user is not allowed', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });

            write(
                "<#Owner>\n" +
                " <http://www.w3.org/ns/auth/acl#accessTo> <" +
                    address + "/" + ">, <" + address + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#owner> <" + user2 + ">;\n" +
                " <http://www.w3.org/ns/auth/acl#mode> <http://www.w3.org/ns/auth/acl#Control> .\n",
                '.acl');

            acl.findACL('Control', '/', user1, function (err) {
                rm('.acl');
                assert.equal(err.status, 403);
                done();
            });
        });

        it('should return no error if no permission rule is found', function (done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                uri: address
            });

            write(
                '',
                '.acl');

            acl.findACL('Control', '/', user1, function (err) {
                rm('.acl');
                assert.notOk(err);
                done();
            });
        });
    });

    describe('fetchDocument', function () {
        // TODO missing tests
    });

    describe('getUserId', function () {
        it('should return userId in session if On-Behalf-Of is not specified', function(done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: 'https://user1.databox.me/profile/card#me',
                    identified: true
                }
            });

            acl.getUserId(function(err, userId) {
                assert.equal(userId, 'https://user1.databox.me/profile/card#me');
                done(err);
            });
        });

        it('should return userId in session if On-Behalf-Of is not valid', function(done) {
            var acl = new ACL({
                ldp: ldp,
                origin: 'https://example.com',
                session: {
                    userId: user1,
                    identified: true
                },
                onBehalfOf: ''
            });

            acl.getUserId(function(err, userId) {
                assert.equal(userId, user1);
                done(err);
            });
        });
        // TODO
        // it('should return On-Behalf-Of if is the delegatee', function(done) {
        //     var acl = new ACL({
        //         ldp: ldp,
        //         origin: 'https://example.com',
        //         session: {
        //             userId: user2,
        //             identified: true
        //         },
        //         onBehalfOf: '<' + user1 + '>'
        //     });

        //     acl.getUserId(function(err, userId) {
        //         assert.equal(userId, user1);
        //         done(err);
        //     });
        // });
    });

    describe('verifyDelegator', function () {
        // TODO
    });

});
