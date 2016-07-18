(function() {
  var path = require('path');
  var async = require('async');
  var should = require('should');
  var _;
  var hooks;

  var ModuleRobot = require('@adsk/module-robot');
  var moduleRobot = new ModuleRobot({
    basePath: path.join(__dirname, '..'),
    folders: []
  });

  var Document = function () {};

  Document.prototype.save = function(foo, bar, callback) {
    console.log('original function called');
    var isValid = this.isValid(foo, bar);
    if (!isValid) {
      callback(new Error(':('));
    } else {
      bar++;
      console.log(2, bar);
      callback(null, 'bar', bar);
    }
  };
  Document.prototype.isValid = function (foo, bar) {
    return foo === 'foo';
  };

  describe('Hook Tests', function() {
    before(function(done) {
      moduleRobot.once('ready', function() {
        hooks = include('hooks');
        _ = include('underscore');
        _.extend(Document.prototype, hooks);

        // Define a middleware function to be invoked before 'save'
        Document.prototype.before('save', function validate (foo, bar, next) {
          console.log('before function called');
          // The `this` context inside of `pre` and `post` functions
          // is the Document instance
          if (this.isValid(foo, bar)){
            bar++;
            console.log(1, bar);
            next(null, foo, bar);
          } else {
            // next() passes control to the next middleware
            next(new Error('Invalid')); // next(error) invokes an error callback
          }
        });

        // Define a middleware function to be invoked after 'save'
        Document.prototype.after('save', function createJob (error, foo, bar, next) {
          console.log('after function called', arguments);
          bar++;
          console.log(3, bar);
          next();
        });

        done();
      });
    });

    it('should handle no errors', function(done) {
      var document = new Document();

      document.save('foo', 0, function (error, foo, bar) {
        console.log('callback called')
        should.not.exist(error);
        foo.should.equal('bar');
        bar.should.equal(2);
        done();
      });
    });

    it('should handle errors', function(done) {
      var document = new Document();

      document.save('baz', 0, function (error, result) {
        should.exist(error);
        done();
      });
    });
  });
})();