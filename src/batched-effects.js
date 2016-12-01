/** @module */

'use strict';

var PropertyEffects = require('./property-effects');

var Polymer = {
  Path: require('./path')
};

let utils = require('./utils');

let effectUid = 0;

function runComputedEffects(inst, changedProps, oldProps) {
  const COMPUTE = inst.PROPERTY_EFFECT_TYPES.COMPUTE;
  if (inst[COMPUTE]) {
    let inputProps = changedProps;
    let computedProps;
    while (runEffects(inst, COMPUTE, inputProps)) {
      utils.mixin(oldProps, inst.__dataOld);
      utils.mixin(changedProps, inst.__dataPending);
      computedProps = utils.mixin(computedProps || {}, inst.__dataPending);
      inputProps = inst.__dataPending;
      inst.__dataPending = null;
    }
    return computedProps;
  }
}

function computeLinkedPaths(inst, changedProps, computedProps) {
  const links = inst.__dataLinkedPaths;
  if (links) {
    computedProps = computedProps || {};
    let link;
    for (let a in links) {
      let b = links[a];
      for (let path in changedProps) {
        if (Polymer.Path.isDescendant(a, path)) {
          link = Polymer.Path.translate(a, b, path);
          changedProps[link] = computedProps[link] =
            inst.__data[link] = changedProps[path];
        } else if (Polymer.Path.isDescendant(b, path)) {
          link = Polymer.Path.translate(b, a, path);
          changedProps[link] = computedProps[link] =
            inst.__data[link] = changedProps[path];
        }
      }
    }
  }
  return computedProps;
}

function notifyProperties(inst, changedProps, computedProps, oldProps) {
  // Determine which props to notify
  //  let props = inst.__dataFromAbove ? computedProps : changedProps;
  // Save interim data for potential re-entry
  let runId = (inst._runId = ((inst._runId || 0) + 1));
  inst.__dataInterim = inst.__dataInterim ?
    utils.mixin(inst.__dataInterim, changedProps) : changedProps;
  inst.__dataInterimOld = inst.__dataInterimOld ?
    utils.mixin(inst.__dataInterimOld, oldProps) : oldProps;
  // Flush host if we actually notified and host was batching
  // Combine & return interim data only for last entry
  if (runId == inst._runId) {
    changedProps = inst.__dataInterim;
    oldProps = inst.__dataInterimOld;
    inst.__dataInterim = null;
    inst.__dataInterimOld = null;
    return { changedProps, oldProps };
  }
}

function runEffects(inst, type, props, oldProps) {
  let ran;
  let effects = inst[type];
  if (effects) {
    let id = effectUid++;
    for (let prop in props) {
      if (runEffectsForProperty(inst, effects, id, prop,
                                oldProps && oldProps[prop])) {
        ran = true;
      }
    }
  }
  return ran;
}

function runEffectsForProperty(inst, effects, id, prop, old) {
  let ran;
  let rootProperty = Polymer.Path.root(prop);
  let fxs = effects[rootProperty];
  if (fxs) {
    let fromAbove = inst.__dataFromAbove;
    for (let i=0, l=fxs.length, fx; (i<l) && (fx=fxs[i]); i++) {
      if (Polymer.Path.matches(fx.path, prop) &&
          (!fx.info || fx.info.lastRun !== id)) {
        fx.fn(inst, prop, inst.__data[prop], old, fx.info, fromAbove);
        if (fx.info) {
          fx.info.lastRun = id;
        }
        ran = true;
      }
    }
  }
  return ran;
}

/**
 * Batched effects
 * @extends PropertyEffects
 */
class BatchedEffects extends PropertyEffects {

  constructor() {
    super();
    this.__dataPendingClients = null;
  }

  // -- set properties machinery

  _propertiesChanged(currentProps, changedProps, oldProps) {
    // console.log('propsChangedBatched', changedProps);
    // ----------------------------
    // let c = Object.getOwnPropertyNames(changedProps || {});
    // console.group(this.localName + '#' + this.id + ': ' + c);
    // ----------------------------
    // Compute
    let computedProps = runComputedEffects(this, changedProps, oldProps);
    // Compute linked paths
    computedProps = computeLinkedPaths(this, changedProps, computedProps);
    // Notify
    let props = notifyProperties(this, changedProps, computedProps, oldProps);
    if (props) {
      oldProps = props.oldProps;
      changedProps = props.changedProps;

      // Flush clients
      this._flushClients();
      // Observe
      runEffects(this, this.PROPERTY_EFFECT_TYPES.OBSERVE,
                 changedProps, oldProps);
    }
    // ----------------------------
    // console.groupEnd(this.localName + '#' + this.id + ': ' + c);
    // ----------------------------
  }

  _setPropertyFromComputation(prop, value) {
    if (this._hasPropertyEffect(prop)) {
      this._setPendingProperty(prop, value);
    } else {
      this[prop] = value;
    }
  }

  _enqueueClient(client) {
    this.__dataPendingClients = this.__dataPendingClients || new Map();
    if (client !== this) {
      this.__dataPendingClients.set(client, true);
    }
  }

  _flushClients() {
    // Flush all clients
    let clients = this.__dataPendingClients;
    if (clients) {
      clients.forEach((v, client) => {
        // TODO(kschaaf): more explicit check?
        if (client._flushProperties) {
          client._flushProperties(true);
        }
      });
      this.__dataPendingClients = null;
    }
  }

  /**
   * Iterates over all properties
   * Set a property in penging state
   * @public
   * @param {Object} props Properties to set
   * @returns {undefined}
   */
  setProperties(props) {
    for (let path in props) {
      if (!this._hasReadOnlyEffect(path)) {
        let value = props[path];
        if ((path = this._setPathOrUnmanagedProperty(path, value))) {
          this._setPendingProperty(path, value);
        }
      }
    }
    this._invalidateProperties();
  }

}

module.exports = BatchedEffects;
