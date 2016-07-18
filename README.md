hooks
============

Add before and after middleware hooks to your JavaScript methods.

## Motivation
Suppose you have a JavaScript object with a `save` method.

It would be nice to be able to declare code that runs before `save` and after `save`.
For example, you might want to run validation code before every `save`,
and you might want to dispatch a job to a background job queue after `save`.

One might have an urge to hard code this all into `save`, but that turns out to
couple all these pieces of functionality (validation, save, and job creation) more
tightly than is necessary. For example, what if someone does not want to do background
job creation after the logical save?

It is nicer to tack on functionality using what we call `before` and `after` hooks. These
are functions that you define and that you direct to execute before or after particular
methods.

## Example
We can use `async-hooks` to add validation and background jobs in the following way:

```javascript
var hooks = require('hooks');

var Document = function () {};

Document.prototype.save = function(foo, bar, callback) {
  console.log('original function called');
  var isValid = this.isValid();
  if (!isValid) {
    callback(new Error('Oh no!'));
  } else {
    callback(null, {foo: 'bar'});
  }
};


// Add hooks' methods: `hook`, `before`, and `after`
for (var k in hooks) {
  Document.prototype[k] = hooks[k];
}

// Define a middleware function to be invoked before 'save'
Document.prototype.before('save', function validate (foo, bar, next) {
  console.log('before function called');

  // The `this` context inside of `pre` and `post` functions
  // is the Document instance
  if (this.isValid()){
    next();
  } else {
    // next() passes control to the next middleware
    next(new Error("Invalid")); // next(error) invokes an error callback
  }
});

// Define a middleware function to be invoked after 'save'
Document.prototype.after('save', function createJob (result, next) {
  console.log('after function called');
  next();
});
```

## befores and afters as Middleware
We structure befores and afters as middleware to give you maximum flexibility:

1. You can define **multiple** befores (or afters) for a single method.
2. These befores (or afters) are then executed as a chain of methods.
3. Any functions in this middleware chain can choose to halt the chain's execution by `next`ing an Error from that middleware function.
If this occurs in a before hook then none of the other middleware in the chain will execute and the main method (e.g., `save`) will not execute. This is nice, for example, when we don't want a document to save if it is invalid.
If this occurs in an after hook, then the original callback function will be called immediately and none of the other (after) middleware in the chain will executed.
4. Befores and afters are executed in the order in which they were attched.

## Mutating Arguments via Middleware

1. The same arguments are passed to all of the before hooks as are passed to the original function
2. The same arguments are passed to all of the after hooks as are returned from the original function

`before` and `after` middleware can also accept the intended arguments for the method
they augment. This is useful if you want to mutate the arguments before passing
them along to the next middleware and eventually pass a mutated arguments list to
the main method itself.

As a simple example, let's define a method `set` that just sets a key, value pair.
If we want to namespace the key, we can do so by adding a `before` middleware hook
that runs before `set`, alters the arguments by namespacing the `key` argument, and passes them onto `set`:

```javascript
Document.before('set', function (key, val, next) {
  next(null, 'namespace-' + key, val);
});

var doc = new Document();
doc.set('hello', 'world', function (error, result) {
  console.log(this.hello); // undefined
  console.log(this['namespace-hello']); // 'world'
});
```

As you can see above, we pass arguments via `next`.

If you are not mutating the arguments, then you can pass zero arguments
to `next`, and the next middleware function will still have access
to the arguments.

```javascript
Document.before('set', function (key, val, next) {
  // I have access to key and val here
  next(); // We don't need to pass anything to next
});
Document.before('set', function (key, val, next) {
  // And I still have access to the original key and val here
  next();
});
```

======================================================================================
======================REWRITE ENDS HERE==============================
======================================================================================
Finally, you can add arguments that downstream middleware can also see:

```javascript
// Note that in the definition of `set`, there is no 3rd argument, options
Document.hook('set', function (key, val) {
  // But...
  var options = arguments[2]; // ...I have access to an options argument
                              // because of before function before2 (defined below)
  console.log(options); // '{debug: true}'
  this[key] = val;
});
Document.before('set', function before1 (next, key, val) {
  // I only have access to key and val arguments
  console.log(arguments.length); // 3
  next(key, val, {debug: true});
});
Document.before('set', function before2 (next, key, val, options) {
  console.log(arguments.length); // 4
  console.log(options); // '{ debug: true}'
  next();
});
Document.before('set', function before3 (next, key, val, options) {
  // I still have access to key, val, AND the options argument introduced via the beforeceding middleware
  console.log(arguments.length); // 4
  console.log(options); // '{ debug: true}'
  next();
});

var doc = new Document()
doc.set('hey', 'there');
```

## after middleware

after middleware intercepts the callback originally sent to the asynchronous function you have hooked to.

This means that the following chain of execution will occur in a typical `save` operation:

(1) doc.save -> (2) before --(next)--> (3) save calls back -> (4) after --(next)--> (5) targetFn

Illustrated below:

```
Document.before('save', function (next) {
  this.key = "value";
  next();
});
// after handler occurs before `set` calls back. This is useful if we need to grab something
// async before `set` finishes.
Document.after('set', function (next) {
  var me = this;
  getSomethingAsync(function(value){ // let's assume it returns "Hello Async"
    me.key2 = value;
    next();
  });
});

var doc = new Document();
doc.save(function(err){
  console.log(this.key);  // "value" - this value was saved
  console.log(this.key2); // "Hello Async" - this value was *not* saved
}

```

after middleware must call `next()` or execution will stop.

## Parallel `before` middleware

All middleware up to this point has been "serial" middleware -- i.e., middleware whose logic
is executed as a serial chain.

Some scenarios call for parallel middleware -- i.e., middleware that can wait for several
asynchronous services at once to respond.

For instance, you may only want to save a Document only after you have checked
that the Document is valid according to two different remote services.

We accomplish asynchronous middleware by adding a second kind of flow control callback
(the only flow control callback so far has been `next`), called `done`.

- `next` passes control to the next middleware in the chain
- `done` keeps track of how many parallel middleware have invoked `done` and passes
   control to the target method when ALL parallel middleware have invoked `done`. If
   you pass an `Error` to `done`, then the error is handled, and the main method that is
   wrapped by befores and afters will not get invoked.

We declare before middleware that is parallel by passing a 3rd boolean argument to our `before`
definition method.

We illustrate via the parallel validation example mentioned above:

```javascript
Document.hook('save', function targetFn (callback) {
  // Save logic goes here
  // ...
  // This only gets run once the two `done`s are both invoked via beforeOne and beforeTwo.
});

                     // true marks this as parallel middleware
Document.before('save', true, function beforeOne (next, doneOne, callback) {
  remoteServiceOne.validate(this.serialize(), function (err, isValid) {
    // The code in here will probably be run after the `next` below this block
    // and could possibly be run after the console.log("Hola") in `beforeTwo
    if (err) return doneOne(err);
    if (isValid) doneOne();
  });
  next(); // Pass control to the next middleware
});

// We will suppose that we need 2 different remote services to validate our document
Document.before('save', true, function beforeTwo (next, doneTwo, callback) {
  remoteServiceTwo.validate(this.serialize(), function (err, isValid) {
    if (err) return doneTwo(err);
    if (isValid) doneTwo();
  });
  next();
});

// While beforeOne and beforeTwo are parallel, beforeThree is a serial before middleware
Document.before('save', function beforeThree (next, callback) {
  next();
});

var doc = new Document();
doc.save( function (err, doc) {
  // Do stuff with the saved doc here...
});
```

In the above example, flow control may happen in the following way:

(1) doc.save -> (2) beforeOne --(next)--> (3) beforeTwo --(next)--> (4) beforeThree --(next)--> (wait for dones to invoke) -> (5) doneTwo -> (6) doneOne -> (7) targetFn

So what's happening is that:

1. You call `doc.save(...)`
2. First, your beforeOne middleware gets executed. It makes a remote call to the validation service and `next()`s to the beforeTwo middleware.
3. Now, your beforeTwo middleware gets executed. It makes a remote call to another validation service and `next()`s to the beforeThree middleware.
4. Your beforeThree middleware gets executed. It immediately `next()`s. But nothing else gets executing until both `doneOne` and `doneTwo` are invoked inside the callbacks handling the response from the two valiation services.
5. We will suppose that validation remoteServiceTwo returns a response to us first. In this case, we call `doneTwo` inside the callback to remoteServiceTwo.
6. Some fractions of a second later, remoteServiceOne returns a response to us. In this case, we call `doneOne` inside the callback to remoteServiceOne.
7. `hooks` implementation keeps track of how many parallel middleware has been defined per target function. It detects that both asynchronous before middlewares (`beforeOne` and `beforeTwo`) have finally called their `done` functions (`doneOne` and `doneTwo`), so the implementation finally invokes our `targetFn` (i.e., our core `save` business logic).

## Removing befores

You can remove a particular before associated with a hook:

    Document.before('set', someFn);
    Document.removebefore('set', someFn);

And you can also remove all befores associated with a hook:
    Document.removebefore('set'); // Removes all declared `before`s on the hook 'set'

## Tests
To run the tests:
    make test

### Contributors
- [Brian Noguchi](https://github.com/bnoguchi)

### License
MIT License

---
### Author
Brian Noguchi
