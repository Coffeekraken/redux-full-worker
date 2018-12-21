import { createStore as createReduxStore, combineReducers } from 'redux'

// setting up some variables
let _store
let _reducers
let _worker

// export some constants
export const HYDRATE = 'redux_full_worker/hydrate'
export const SET_INITIAL_STATE = 'redux_full_worker/set_initial_state'

/**
 * Set an initial state for a particular "reducer".
 * This need to be the same shape of the `combineReducers` parameter:
 * ```js
 * {
 *   key: {
 *     // state...
 *   }
 * }
 * ```
 *
 * @param    {Object}    state    The initial state to set in the global state
 *
 * @example    js
 * import { setInitialState } from 'coffeekraken-redux-full-worker'
 * setInitialState({
 *   todos: [{
 *     id: 1, text: 'Do something', done: false
 *   }]
 * })
 *
 * @author    Olivier Bossel <olivier.bossel@gmail.com> (https://olivierbossel.com)
 */
export const setInitialState = state => {

  // add a dumb reducer for this specific
  // key to avoid warnings from react
  Object.keys(state).forEach((key) => {
    _reducers[key] = (state = {}, action) => state
  })

  // get the main reducer with the newly added one
  const reducers = _mainReducer(combineReducers(_reducers), _worker)

  // replace the main reducer by the newly created one
  _store.replaceReducer(reducers)

  // dispatch an initial state action
  _store.dispatch({
    type: SET_INITIAL_STATE,
    state
  })
}

/**
 * Expose the store from the worker to the main app.
 * This is needed to make the link between the worker messages and the store dispatch actions
 * as well as dispatch some HYDRATE message to the main app when the store has been updated
 *
 * @param    {Object}    store    The store to expose
 * @param    {DedicatedWorkerGlobalScope}    self    The worker global variable
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
const _mainReducer = (reducers, worker) =>
  (state = {}, action) => {
    if (action.type === HYDRATE) {
      return {
        ...state,
        ...action.state
      }
    }
    if (action.type === SET_INITIAL_STATE) {
      return {
        ...state,
        ...action.state
      }
    }
    if (!action.type.match(/@@redux/)) {
      worker.postMessage(action)
    }
    return {
      ...state,
      ...reducers(state, action)
    }
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
 * const worker = new ReduxWorker()
 * const store = createStore(worker, reducers, {}, compose(...))
 *
 * @author    Olivier Bossel <olivier.bossel@gmail.com> (https://olivierbossel.com)
 */
const createStore = (worker, reducers, initialState = {}, storeEnhancers) => {
  // create the main reducer
  const mainReducer = _mainReducer(combineReducers(reducers), worker)

  // create the redux store
  const store = createReduxStore(mainReducer, initialState, storeEnhancers)

  // listen for messages coming from the worker
  // and translate them to an HYDRATE one
  worker.addEventListener('message', e => {
    store.dispatch({
      type: HYDRATE,
      state: e.data.state
    })
  })

  // save variables for later use
  _worker = worker
  _reducers = reducers
  _store = store

  // return the created store
  return store
}
export default createStore
