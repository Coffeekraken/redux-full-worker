"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createStore = exports.registerReducer = exports.expose = exports.HYDRATE = void 0;

var _redux = require("redux");

var _detectBrowser = require("detect-browser");

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

// browser detection
var browser = (0, _detectBrowser.detect)(); // setting up some variables

var _store;

var _reducers;

var _worker; // export some constants


var HYDRATE = 'redux_full_worker/HYDRATE';
/**
 * Expose the store from the worker to the main app.
 * This is needed to make the link between the worker messages and the store dispatch actions
 * as well as dispatch some HYDRATE message to the main app when the store has been updated
 *
 * @param    {Object}    store    The store to expose
 * @param    {DedicatedWorkerGlobalScope}    self    The worker global variable
 * @return    {Object}    Return the store for NodeJS implementation
 *
 * @example    js
 * import { expose } from 'coffeekraken-redux-full-worker'
 * // create store, reducers, etc...
 * expose(store, self)
 *
 * @author    Olivier Bossel <olivier.bossel@gmail.com> (https://olivierbossel.com)
 */

exports.HYDRATE = HYDRATE;

var expose = function expose(store, self) {
  var timeout;

  if (browser) {
    store.subscribe(function () {
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        self.postMessage({
          type: HYDRATE,
          state: store.getState()
        });
      });
    });
    self.addEventListener('message', function (e) {
      store.dispatch(e.data);
    });
  } // return the store for NodeJS implementation


  return store;
};
/**
 * Create the main reducer that is responsible to hydrate the state
 * or to delegate the action to his registered reducers
 *
 * @param    {Object}    reducers    The result of the `combineReducers` function
 * @param    {WebWorker}    worker    The web worker instance
 *
 * @private
 * @author    Olivier Bossel <olivier.bossel@gmail.com> (https://olivierbossel.com)
 */


exports.expose = expose;

var _mainReducer = function _mainReducer(reducers, worker) {
  return function () {
    var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var action = arguments.length > 1 ? arguments[1] : undefined;

    if (action.type === HYDRATE) {
      return _objectSpread({}, state, action.state);
    }

    if (!action.type.match(/@@redux/)) {
      if (browser) {
        worker.postMessage(action);
      } else {
        worker.dispatch(action);
      }
    }

    return _objectSpread({}, state, reducers(state, action));
  };
};
/**
 * Register a reducer in the store
 * @param    {String}    namespace    The reducer namespace
 * @param    {Function}    reducer    The actual reducer function
 *
 * @example    js
 * import { registerReducer } from 'coffeekraken-redux-full-worker'
 * const reducer = (state = {}, action) => state // simpliest reducer
 * registerReducer('todos', reducer)
 *
 * @author    Olivier Bossel <olivier.bossel@gmail.com> (https://olivierbossel.com)
 */


var registerReducer = function registerReducer(namespace, reducer) {
  // save new reducer in the stack
  _reducers[namespace] = reducer; // get the main reducer with the newly added one

  var reducers = _mainReducer((0, _redux.combineReducers)(_reducers), _worker); // replace the main reducer by the newly created one


  _store.replaceReducer(reducers);
};
/**
 * Create the redux store and listen for messages coming from the worker
 * to hydrate the state  accordingly
 *
 * @param    {WebWorker}    worker    The worker that handle the reducers, etc...
 * @param    {Object}    reducers    A plain js object `key:reducer` formatted. Do not pass the result of the `combineReducers` here. I will be done for you inside
 * @param    {Object}    [initialState={}]    The initial state
 * @param    {Function}    storeEnhancers    The store enhancers to apply
 *
 * @example    js
 * import createStore from 'coffeekraken-redux-full-worker'
 * import { compose } from 'redux'
 * import todosReducer from './reducers'
 * import ReduxWorker from './redux.worker'
 * const reducers = {
 *   todos: todosReducer,
 *   // etc...
 * }
 * const store = createStore(ReduxWorker, reducers, {}, compose(...))
 *
 * @author    Olivier Bossel <olivier.bossel@gmail.com> (https://olivierbossel.com)
 */


exports.registerReducer = registerReducer;

var createStore = function createStore(ReduxWorker, reducers, initialState, storeEnhancers) {
  // instanciate worker if is a web worker instance
  var worker = ReduxWorker;

  if (browser) {
    worker = new ReduxWorker();
  } // register simple reducer for the one that does not exist already


  Object.keys(initialState).forEach(function (key) {
    if (!reducers[key]) {
      reducers[key] = function () {
        var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var action = arguments.length > 1 ? arguments[1] : undefined;
        return state;
      };
    }
  }); // create the main reducer

  var mainReducer = _mainReducer((0, _redux.combineReducers)(reducers), worker); // create the redux store


  var store = (0, _redux.createStore)(mainReducer, initialState, storeEnhancers); // allow to register some reducers asyncronously

  store.asyncReducers = reducers; // make distinction between a browser implementation
  // and a NodeJS one

  if (browser) {
    // listen for messages coming from the worker
    // and translate them to an HYDRATE one
    worker.addEventListener('message', function (e) {
      // register simple reducer for the one that does not exist already
      Object.keys(e.data.state).forEach(function (key) {
        if (!_reducers[key]) {
          registerReducer(key, function () {
            var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
            var action = arguments.length > 1 ? arguments[1] : undefined;
            return state;
          });
        }
      }); // dispatch the hydrate action
      // along with the new state to set

      store.dispatch({
        type: HYDRATE,
        state: e.data.state
      });
    });
  } else {
    worker.subscribe(function () {
      setTimeout(function () {
        store.dispatch({
          type: HYDRATE,
          state: worker.getState()
        });
      });
    });
  } // save variables for later use


  _worker = worker;
  _reducers = reducers;
  _store = store; // return the created store

  return store;
};

exports.createStore = createStore;