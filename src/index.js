import { createStore as createReduxStore, combineReducers } from 'redux'
import { detect } from 'detect-browser'

// browser detection
const browser = detect()

// setting up some variables
let _store
let _reducers
let _worker

// export some constants
export const HYDRATE = 'redux_full_worker/HYDRATE'

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
export const expose = (store, self) => {
  let timeout
  if (browser) {
    store.subscribe(() => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        self.postMessage({
          type: HYDRATE,
          state: store.getState()
        })
      })
    })
    self.addEventListener('message', e => {
      store.dispatch(e.data)
    })
  }
  // return the store for NodeJS implementation
  return store
}

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
const _mainReducer = (reducers, worker) => (state = {}, action) => {
  if (action.type === HYDRATE) {
    return {
      ...state,
      ...action.state
    }
  }
  if (!action.type.match(/@@redux/)) {
    if (browser) {
      worker.postMessage(action)
    } else {
      worker.dispatch(action)
    }
  }
  return {
    ...state,
    ...reducers(state, action)
  }
}

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
export const registerReducer = (namespace, reducer) => {
  // save new reducer in the stack
  _reducers[namespace] = reducer

  // get the main reducer with the newly added one
  const reducers = _mainReducer(combineReducers(_reducers), _worker)

  // replace the main reducer by the newly created one
  _store.replaceReducer(reducers)
}

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
export const createStore = (
  ReduxWorker,
  reducers,
  initialState,
  storeEnhancers
) => {
  // instanciate worker if is a web worker instance
  let worker = ReduxWorker
  if (browser) {
    worker = new ReduxWorker()
  }

  // register simple reducer for the one that does not exist already
  Object.keys(initialState).forEach((key) => {
    if (!reducers[key]) {
      reducers[key] = (state = {}, action) => state
    }
  })

  // create the main reducer
  const mainReducer = _mainReducer(combineReducers(reducers), worker)

  // create the redux store
  const store = createReduxStore(mainReducer, initialState, storeEnhancers)

  // allow to register some reducers asyncronously
  store.asyncReducers = reducers

  // make distinction between a browser implementation
  // and a NodeJS one
  if (browser) {
    // listen for messages coming from the worker
    // and translate them to an HYDRATE one
    worker.addEventListener('message', e => {
      // register simple reducer for the one that does not exist already
      Object.keys(e.data.state).forEach((key) => {
        if (!_reducers[key]) {
          registerReducer(key, (state = {}, action) => state)
        }
      })
      // dispatch the hydrate action
      // along with the new state to set
      store.dispatch({
        type: HYDRATE,
        state: e.data.state
      })
    })
  } else {
    worker.subscribe(() => {
      setTimeout(() => {
        store.dispatch({
          type: HYDRATE,
          state: worker.getState()
        })
      })
    })
  }

  // save variables for later use
  _worker = worker
  _reducers = reducers
  _store = store

  // return the created store
  return store
}
