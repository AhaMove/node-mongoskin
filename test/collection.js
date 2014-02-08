/*!
 * mongoskin - test/collection.js
 * 
 * Copyright(c) 2011 - 2012 kissjs.org
 * Copyright(c) 2012 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

var mongoskin = require('../');
var SkinCollection = mongoskin.SkinCollection;
var constant = require('../lib/mongoskin/constant');
var should = require('should');
var servermanager = require('./utils/server_manager');

describe('collection.js', function () {
  var RS, RS_primary = '127.0.0.1';
  if(servermanager.MONGOSKIN_REPLICASET) {
    before(function (done) {
      servermanager.ensureUp(function (err, rs, primary) {
        RS = rs;
        RS_primary = primary;
        done(err);
      });
    });
  }

  var cases = [
    ['normal', {database: 'mongoskin_test', safe: true}],
  ];
  if (servermanager.MONGOSKIN_REPLICASET) {
    cases.push(['replicaset', {database: 'mongoskin_replicaset_test', strict: true}]);
  }

  cases.forEach(function (caseItem) {
    describe(caseItem[0], function () {
      var isReplicaset = caseItem[0] === 'replicaset';
      var db = null;
      var servers = null;
      var authfailServers = null;
      var options = caseItem[1];

      before(function (done) {
        if (isReplicaset) {
          servers = [];
          authfailServers = [];
          for (var i = 0; i < RS.ports.length; i++) {
            servers.push(RS.host + ':' + RS.ports[i] + '/?auto_reconnect=true');
          }
          authfailServers = servers;
        } else {
          servers = RS_primary;
        }
        db = mongoskin.db(servers, options);
        db.bind('testcollection');
        db.testcollection.ensureIndex({title: -1}, function (err, index) {
          should.not.exist(err);
          index.should.equal('title_-1');
          db.testcollection.findItems(function (err, rows) {
            should.not.exist(err);
            rows.should.be.instanceof(Array).with.length(0);
            done();
          });
        });
      });

      after(function (done) {
        db.testcollection.drop(function (err, result) {
          if (err) {
            return done(err);
          }
          should.ok(result);
          db.close(done);
        });
      });

      describe('open()', function () {
        var skinDb;
        beforeEach(function () {
          skinDb = {
            open: function (callback) {
              var that = this;
              process.nextTick(function () {
                callback(null, that.db);
              });
            },
            db: {
              name: 'mock db',
              collection: function (name, options, callback) {
                if (typeof options === 'function') {
                  callback = options;
                  options = null;
                }
                process.nextTick(function () {
                  callback(null, {
                    name: 'mock collection'
                  });
                });
              }
            }
          };
        });

        it('should return a collection', function (done) {
          var collection = new SkinCollection(skinDb, 'foo');
          collection.hint = 123;
          collection.open(function (err, coll) {
            should.not.exist(err);
            coll.should.have.property('name', 'mock collection');
            collection.state.should.equal(constant.STATE_OPEN);
            done();
          });
        });

        it('should return mock skinDb.open() error', function (done) {
          skinDb.open = function (callback) {
            process.nextTick(function () {
              callback(new Error('mock skinDb.open() error'));
            });
          };
          var collection = new SkinCollection(skinDb, 'foo');
          collection.open(function (err, coll) {
            should.exist(err);
            err.should.have.property('message', 'mock skinDb.open() error');
            should.not.exist(coll);
            collection.state.should.equal(constant.STATE_CLOSE);
            done();
          });
        });

        it('should return mock db.collection() error', function (done) {
          skinDb.db.collection = function (name, options, callback) {
            if (typeof options === 'function') {
              callback = options;
              options = null;
            }
            process.nextTick(function () {
              callback(new Error('mock db.collection() error'));
            });
          };
          var collection = new SkinCollection(skinDb, 'foo');
          collection.open(function (err, coll) {
            should.exist(err);
            should.not.exist(coll);
            err.should.have.property('message', 'mock db.collection() error');
            collection.state.should.equal(constant.STATE_CLOSE);
            done();
          });
        });

      });

      describe('id()', function () {
        it('should convert string id to ObjectID success', function () {
          var id = '4ec4b2b9f44a927223000001';
          id = db.testcollection.id(id);
          id.should.be.instanceof(db.testcollection.ObjectID);
          id = db.testcollection.id(id);
          id.should.be.instanceof(db.testcollection.ObjectID);
          id = '4ec4b2b9f44a927223000foo';
          id = db.testcollection.id(id);
          id.should.be.instanceof(db.testcollection.ObjectID);
        });
        it('should return source id when id length !== 24', function () {
          var ids = [123, '4ec4b2b9f44a92722300000', 'abc', '4ec4b2b9f44a927223000f00123123'];
          ids.forEach(function (id) {
            db.testcollection.id(id).should.equal(id);
          });
        });
      });

      describe('find(), findItems(), findEach()', function () {
        var objectIds = [], stringIds = [];
        before(function (done) {
          db.bind('comment');
          var inserts = [];
          for (var i = 0; i < 100; i++) {
            inserts.push({
              text: 'this is comment ' + i,
              createtime: new Date()
            });
          }
          db.comment.insert(inserts, function (err, docs) {
            if (err) {
              return done(err);
            }
            for (var i = 0, l = docs.length; i < l; i++) {
              var doc = docs[i];
              stringIds.push(doc._id.toString());
              objectIds.push(doc._id);
            }
            done();
          });
        });
        after(function (done) {
          db.comment.drop(done);
        });

        it('should find().toArray() return 100 comments', function (done) {
          db.comment.find().toArray(function (err, rows) {
            should.not.exist(err);
            rows.should.be.instanceof(Array).with.length(100);
            done();
          });
        });

        it('should findItems(fn) all comments', function (done) {
          db.comment.findItems(function (err, comments) {
            should.not.exist(err);
            should.exist(comments);
            comments.should.be.instanceof(Array).with.length(100);
            done();
          });
        });

        it('should findItems({} fn) all comments', function (done) {
          db.comment.findItems(function (err, comments) {
            should.not.exist(err);
            should.exist(comments);
            comments.should.be.instanceof(Array).with.length(100);
            done();
          });
        });

        it('should findItems({limit: 10}) query wrong return top 0 comments', function (done) {
          db.comment.findItems({limit: 10}, function (err, comments) {
            should.not.exist(err);
            comments.should.be.instanceof(Array).with.length(0);
            done();
          });
        });

        it('should findItems({}, {limit: 10}) return top 10 comments', function (done) {
          db.comment.findItems({}, {limit: 10}, function (err, comments) {
            should.not.exist(err);
            comments.should.be.instanceof(Array).with.length(10);
            done();
          });
        });

        it('should findEach(fn) call fn 100 times', function (done) {
          var count = 0;
          db.comment.findEach(function (err, comment) {
            should.not.exist(err);
            if (!comment) {
              count.should.equal(100);
              return done();
            }
            count++;
          });
        });

        it('should findEach({}, {limit: 20}, fn) call fn 20 times', function (done) {
          var count = 0;
          db.comment.findEach({}, {limit: 20}, function (err, comment) {
            should.not.exist(err);
            if (!comment) {
              count.should.equal(20);
              return done();
            }
            count++;
          });
        });

        describe('mock find() error', function () {
          var _find;
          before(function () {
            _find = db.comment.find;
            db.comment.find = function () {
              var callback = arguments[arguments.length - 1];
              process.nextTick(function () {
                callback(new Error('mock find() error'));
              });
            };
          });
          after(function () {
            if (_find) {
              db.comment.find = _find;
            }
          });

          it('should findItems() error', function (done) {
            db.comment.findItems(function (err, docs) {
              should.exist(err);
              err.should.be.instanceof(Error).with.have.property('message', 'mock find() error');
              should.not.exist(docs);
              done();
            });
          });
          it('should findEach() error', function (done) {
            db.comment.findEach(function (err, docs) {
              should.exist(err);
              err.should.be.instanceof(Error).with.have.property('message', 'mock find() error');
              should.not.exist(docs);
              done();
            });
          });
        });

      });

      describe('findById(), updateById(), removeById()', function () {
        var now = new Date();
        var articleId;
        before(function (done) {
          db.bind('article');
          db.article.insert({title: 'test article title ' + now, created_at: now}, function (err, article) {
            if (article) {
              articleId = article[0]._id;
            }
            done(err);
          });
        });
        after(function (done) {
          db.article.drop(done);
        });

        describe('findById()', function () {
          it('should find one object by ObjectID', function (done) {
            db.article.findById(articleId, function (err, article) {
              should.not.exist(err);
              should.exist(article);
              article.should.have.property('_id').with.instanceof(db.ObjectID);
              article.should.have.property('created_at').with.instanceof(Date);
              article.should.have.property('title').with.include(now.toString());
              article.created_at.toString().should.equal(now.toString());
              done();
            });
          });
          it('should find one object by String id', function (done) {
            db.article.findById(articleId.toString(), function (err, article) {
              should.not.exist(err);
              should.exist(article);
              article.should.have.property('_id').with.instanceof(db.ObjectID);
              article.should.have.property('created_at').with.instanceof(Date);
              article.should.have.property('title').with.include(now.toString());
              article.created_at.toString().should.equal(now.toString());
              done();
            });
          });
          it('should not find when id not exists', function (done) {
            db.article.findById('foo', function (err, article) {
              should.not.exist(err);
              should.not.exist(article);
              done();
            });
          });
        });

        describe('updateById()', function () {
          it('should update obj by id', function (done) {
            var updatedTime = new Date();
            var doc = {
              $set: {
                title: 'new title ' + updatedTime,
                updated_at: updatedTime
              }
            };
            db.article.updateById(articleId.toString(), doc, function (err, success, result) {
              should.not.exist(err);
              success.should.equal(1);
              result.should.have.property('ok', 1);
              db.article.findById(articleId, function (err, article) {
                should.not.exist(err);
                should.exist(article);
                article.should.have.property('title', 'new title ' + updatedTime);
                article.should.have.property('updated_at').with.instanceof(Date);
                article.updated_at.toString().should.equal(updatedTime.toString());
                done();
              });
            });
          });
        });

        describe('removeById()', function () {
          it('should remove obj by id', function (done) {
            var id = articleId.toString();
            db.article.findById(id, function (err, article) {
              should.not.exist(err);
              should.exist(article);
              db.article.removeById(id, function (err, success) {
                should.not.exist(err);
                success.should.equal(1);
                db.article.findById(id, function (err, article) {
                  should.not.exist(err);
                  should.not.exist(article);
                  done();
                });
              });
            });
          });

          it('should remove not exists obj', function (done) {
            var id = articleId.toString();
            db.article.removeById(id, function (err, success) {
              should.not.exist(err);
              success.should.equal(0);
              done();
            });
          });
        });

      });
    });
  });
});
