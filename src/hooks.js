/**
 * @fileOverview This is a mixin that you can add to the prototype of any class.
 * var hooks = require('hooks');
 * for (var k in hooks) {
 *   Document.prototype[k] = hooks[k];
 * }
 * It will add the following methods to your class
 * - hook - Set up a function as being able to have before and after hooks
 *        Document.prototype.hook(Document.prototype.save);
 * - before - Set up a function to run before the regular function is called
 *       Document.prototype.before('save', function(arguments_to_save, callback) {...});
 * - after - Set up a function to run after the regular function is called
 *       Document.prototype.after('save', function(response_from_save, callback) {...});
 * - removeAfter
 * - removeBefore
 */

(function() {
  var _ = include('underscore');

  exportModule('hooks', {

    /**
     * Idempotent function that makes sure that the class has all of the necessary functions
     * @param {string} functionName
     */
    _setupHooks: function(functionName) {
      this._before = this._before || {};
      this._after = this._after || {};

      this._before[functionName] = this._before[functionName] || [];
      this._after[functionName] = this._after[functionName] || [];
    },

    _totalBeforeHooks: function(name) {
      return this._getBeforeHooks(name).length;
    },

    _totalAfterHooks: function(name) {
      return this._getAfterHooks(name).length;
    },

    _getBeforeHooks: function(name) {
      return this._before[name];
    },

    _getAfterHooks: function(name) {
      return this._after[name];
    },

    _thereAreBeforeHooks: function(name) {
      return this._before[name].length > 0;
    },

    _thereAreAfterHooks: function(name) {
      return this._after[name].length > 0;
    },

    _isHookedAlready: function(functionName) {
      return !!this._before && !!this._before[functionName];
    },

    /**
     *  Declares a new hook to which you can add before and after
     *  @param {string} functionName
     */
    _hook: function(functionName) {
      console.assert(_.isString(functionName));
      var runBeforeHook,
          runOriginalFunction,
          runAfterHook;
      if (this._isHookedAlready(functionName)) {
        return;
      }

      this._setupHooks(functionName);

      var originalFunction = this[functionName];

      this[functionName] = function() {
        // Callback to original function
        console.assert(_.isFunction(arguments[arguments.length - 1]));

        return runBeforeHook.call(this, null, 0, arguments, arguments);
      };

      /**
       * @param  {Error=} error
       * @param  {number} currentBeforeHookCounter
       * @param  {Array} originalArguments
       * @param  {Array=} in_beforeHookCallbackArguments
       */
      runBeforeHook = function(error, currentBeforeHookCounter, originalArguments, in_beforeHookCallbackArguments) {
        console.assert(_.isNumber(currentBeforeHookCounter));
        if (error instanceof Error) {
          var callbackFunction = originalArguments[originalArguments.length - 1];
          callbackFunction.call(this, error);
          return;
        }

        if (currentBeforeHookCounter < this._totalBeforeHooks(functionName)) {
          var currentBeforeFunction = this._getBeforeHooks(functionName)[currentBeforeHookCounter];
          var nextBeforeHookCounter = currentBeforeHookCounter + 1;

          if (currentBeforeFunction.length === 0) {
            // The arguments of the hook function doesn't have sufficient arguments
            //  Any before or after hook needs at least 1 argument for the function this must be
            //  called next.
            throw new Error('Your before must have a next argument -- e.g., function(next, ...)');
          }

          // arguments eventually passed to the hooks - are mutable
          var beforeHookArguments = Array.prototype.slice.call(originalArguments);

          // Replace original callback
          var that = this;
          beforeHookArguments[beforeHookArguments.length - 1] = function(beforeHookError) {
            // The last beforeHook's callback arguments win (if any are given)
            // Though really it will be the last afterHook's callback arguments that win (if any are given)
            // It will always be the last called function that gets to specify the callback arguments
            var callbackArguments;
            if ((beforeHookError === null || beforeHookError === undefined) && arguments.length > 1 ||
                (beforeHookError !== null && beforeHookError !== undefined)) {
              var beforeHookCallbackArguments = Array.prototype.slice.call(arguments);
              beforeHookCallbackArguments.shift();
              callbackArguments = beforeHookCallbackArguments;
            } else {
              callbackArguments = in_beforeHookCallbackArguments;
            }
            console.log('beforeHook callbackArguments', callbackArguments);
            runBeforeHook.call(that, beforeHookError, nextBeforeHookCounter, originalArguments, callbackArguments);
          };

          currentBeforeFunction.apply(this, beforeHookArguments);
        } else {
          runOriginalFunction.call(this, originalArguments, in_beforeHookCallbackArguments);
        }
      };

      /**
       * @param  {Array} originalArguments
       * @param  {Array} in_beforeHookCallbackArguments
       */
      runOriginalFunction = function(originalArguments, in_beforeHookCallbackArguments) {
        var that = this;
        var originalFunctionArguments = Array.prototype.slice.call(in_beforeHookCallbackArguments);

        originalFunctionArguments[originalArguments.length - 1] = function(originalFunctionError) {
          // If the originalFunction passes arguments to its callback, those arguments are passed to the callback
          // If no arguments are passed, then the beforeHookCallbackArguments are passed back
          // TODO: This is confusing. Is there a better way?
          var originalCallbackArguments = arguments.length > 0 ? arguments : in_beforeHookCallbackArguments;
          var originalCallback = originalArguments[originalArguments.length - 1];
          console.log('originalCallbackArguments', originalCallbackArguments);
          runAfterHook.call(that, originalFunctionError, 0, originalCallback, originalCallbackArguments);
        };

        console.log('originalFunctionArguments', originalFunctionArguments);
        originalFunction.apply(this, originalFunctionArguments);
      };

      /**
       * @param  {Error=} error
       * @param  {number} currentAfterHookCounter
       * @param  {function} originalCallback
       * @param  {Array=} originalCallbackArguments
       */
      runAfterHook = function(error, currentAfterHookCounter, originalCallback, originalCallbackArguments) {
        console.assert(_.isNumber(currentAfterHookCounter));
        console.assert(_.isFunction(originalCallback));
        if (error instanceof Error) {
          originalCallback.call(this, error);
          return;
        }

        // Are there (more) after functions to call?
        if (currentAfterHookCounter < this._totalAfterHooks(functionName)) {
          var currentAfterFunction = this._getAfterHooks(functionName)[currentAfterHookCounter];
          var nextAfterHookCounter = currentAfterHookCounter + 1;

          if (currentAfterFunction.length === 0) {
            // The arguments of the hook function doesn't have sufficient arguments
            //  Any before or after hook needs at least 1 argument for the function this must be
            //  called next.
            throw new Error('Your after must have a next argument -- e.g., function(next, ...)');
          }

          var afterHookArguments = Array.prototype.slice.call(originalCallbackArguments);
          var that = this;
          afterHookArguments.push(function(afterHookError) {
            // The last afterHook's callback arguments win
            var callbackArguments;
            if ((afterHookError === null || afterHookError === undefined) && arguments.length > 1 ||
                (afterHookError !== null && afterHookError !== undefined)) {
              var afterHookCallbackArguments = Array.prototype.slice.call(arguments);
              afterHookCallbackArguments.shift();
              callbackArguments = afterHookCallbackArguments;
            } else {
              callbackArguments = originalCallbackArguments;
            }
            console.log('afterHook callbackArguments', callbackArguments);
            runAfterHook.call(that, error, nextAfterHookCounter, originalCallback, callbackArguments);
          });

          currentAfterFunction.apply(this, afterHookArguments);
        } else {
          originalCallback.apply(this, originalCallbackArguments);
        }
      };
    },

    /**
     * @param  {string}   functionName
     * @param  {Function} fn
     */
    before: function(functionName, fn) {
      console.assert(_.isString(functionName));
      console.assert(_.isFunction(fn));
      this._hook(functionName);

      this._before[functionName].push(fn);
    },

    /**
     * @param  {string}   functionName
     * @param  {Function} fn
     */
    after: function(functionName, fn) {
      this._hook(functionName);

      this._after[functionName].push(fn);
    },

    /**
     * @param  {string}   functionName
     * @param  {Function} fnToRemove
     */
    removeAfter: function(functionName, fnToRemove) {
      if (arguments.length === 1) {
        // Remove all after callbacks for hook `functionName`
        this._after[functionName].length = 0;
      } else {
        this._after[functionName] = this._after[functionName].filter(function(currFn) {
          return currFn !== fnToRemove;
        });
      }
    },

    /**
     * @param  {string}   functionName
     * @param  {Function} fnToRemove
     */
    removeBefore: function(functionName, fnToRemove) {
      if (arguments.length === 1) {
        // Remove all before callbacks for hook `functionName`
        this._before[functionName].length = 0;
      } else {
        this._before[functionName] = this._before[functionName].filter(function(currFn) {
          return currFn !== fnToRemove;
        });
      }
    }
  });
})();
