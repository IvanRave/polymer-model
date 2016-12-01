/** @module */

'use strict';

var PropertyAccessors = require('./property-accessors');
const Path = require('./path');
const Polymer = {
 Path: Path
};

// Property effect types; effects are stored on the prototype using these keys
const TYPES = {
  ANY: '__propertyEffects',
  COMPUTE: '__computeEffects',
  OBSERVE: '__observeEffects',
  READ_ONLY: '__readOnly'
};

/**
 * Ensures that the model has an own-property map of effects for the given type.
 * The model may be a prototype or an instance.
 * 
 * Property effects are stored as arrays of effects by property in a map,
 * by named type on the model. e.g.
 *
 *   __computeEffects: {
 *     foo: [ ... ],
 *     bar: [ ... ]
 *   }
 *
 * If the model does not yet have an effect map for the type, one is created
 * and returned.  If it does, but it is not an own property (i.e. the
 * prototype had effects), the the map is deeply cloned and the copy is
 * set on the model and returned, ready for new effects to be added. 
 *
 * @param {Object} model Prototype or instance
 * @param {string} type Property effect type
 * @return {Object} The own-property map of effects for the given type
 * @private
 */
function ensureOwnEffectMap(model, type) {
  let effects = model[type];
  if (!effects) {
    effects = model[type] = {};
  } else if (!model.hasOwnProperty(type)) {
    effects = model[type] = Object.create(model[type]);
    for (let p in effects) {
      // TODO(kschaaf): replace with fast array copy #!%&$!
      effects[p] = effects[p].slice();
    }
  }
  return effects;
}

// -- effects ----------------------------------------------

/**
 * Runs all effects for the given property on an instance.
 *
 * @param {Object} inst The instance with effects to run
 * @param {string} property Name of property
 * @param {*} value Current value of property
 * @param {*} old Previous value of property
 * @param {Object<string,Array>} effects List of effects
 * @private
 */
function runEffects(inst, property, value, old, effects) {
  for (let i=0, l=effects.length, fx; (i<l) && (fx=effects[i]); i++) {
    if (Path.matches(fx.path, property)) {
      fx.fn(inst, property, inst.__data[property], old, fx.info);
    }
  }
}

/**
 * Implements the "observer" effect.
 *
 * Calls the method with `info.methodName` on the instance, passing the
 * new and old values.
 *
 * @param {Object} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {*} value Current value of property
 * @param {*} old Previous value of property
 * @param {Object} info Effect metadata
 * @private
 */
function runObserverEffect(inst, property, value, old, info) {
  // console.log('runObserverEffect', info.methodName);
  let fn = inst[info.methodName];
  if (fn) {
    fn.call(inst, value, old, property);
  } else {
    console.warn('observer method `' + info.methodName + '` not defined');
  }
}

/**
 * Implements the "method observer" effect by running the method with the
 * values of the arguments specified in the `info` object.
 *
 * @param {Object} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {*} value Current value of property
 * @param {*} old Previous value of property
 * @param {Object} info Effect metadata
 * @private
 */
function runMethodObserverEffect(inst, property, value, old, info) {
  runMethodEffect(inst, property, value, old, info);
}

/**
 * Implements the "computed property" effect by running the method with the
 * values of the arguments specified in the `info` object and setting the
 * return value to the computed property specified.
 *
 * @param {Object} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {*} value Current value of property
 * @param {*} old Previous value of property
 * @param {Object} info Effect metadata
 * @private
 */
function runComputedEffect(inst, property, value, old, info) {
  var result = runMethodEffect(inst, property, value, old, info);
  var computedProp = info.methodInfo;
  inst._setPropertyFromComputation(computedProp, result);
}

// -- for method-based effects (complexObserver & computed) --------------

/**
 * Adds property effects for each argument in the method signature (and
 * optionally, for the method name if `dynamic` is true) that calls the
 * provided effect function.
 *
 * @param {Object} inst Prototype or instance
 * @param {Object} sig Method signature metadata
 * @param {Function} effectFn Function to run when arguments change
 * @param {boolean=} dynamic Whether the method name should be included as
 *   a dependency to the effect.
 * @private
 */
function createMethodEffect(model, sig, type, effectFn, methodInfo, dynamic) {
  let info = {
    methodName: sig.methodName,
    args: sig.args,
    methodInfo: methodInfo,
    dynamicFn: dynamic
  };
  // TODO(sorvell): why still here?
  if (sig.static) {
    model._addPropertyEffect('__static__', type, {
      fn: effectFn, info: info
    });
  } else {
    for (let i=0, arg; (i<sig.args.length) && (arg=sig.args[i]); i++) {
      if (!arg.literal) {
        model._addPropertyEffect(arg.name, type, {
          fn: effectFn, info: info
        });
      }
    }
  }
  if (dynamic) {
    model._addPropertyEffect(sig.methodName, type, {
      fn: effectFn, info: info
    });
  }
}

/**
 * Calls a method with arguments marshaled from properties on the instance
 * based on the method signature contained in the effect metadata.
 *
 * Multi-property observers, computed properties, and inline computing
 * functions call this function to invoke the method, then use the return
 * value accordingly.
 *
 * @param {Object} inst The instance the effect will be run on
 * @param {string} property Name of property
 * @param {*} value Current value of property
 * @param {*} old Previous value of property
 * @param {Object} info Effect metadata
 * @private
 */
function runMethodEffect(inst, property, value, old, info) {
  // TODO(kschaaf): ideally rootDataHost would be a detail of Templatizer only
  let context = inst._rootDataHost || inst;
  let fn = context[info.methodName];
  if (fn) {
    let args = marshalArgs(inst.__data, info.args, property, value);
    return fn.apply(context, args);
  } else if (!info.dynamicFn) {
    console.warn('method `' + info.methodName + '` not defined');
  }
}

const emptyArray = [];

/**
 * Parses an expression string for a method signature, and returns a metadata
 * describing the method in terms of `methodName`, `static` (whether all the
 * arguments are literals), and an array of `args`
 *
 * @param {string} expression The expression to parse
 * @return {?Object} The method metadata object if a method expression was
 *   found, otherwise `undefined`
 * @private
 */
function parseMethod(expression) {
  // tries to match valid javascript property names
  let m = expression.match(/([^\s]+?)\(([\s\S]*)\)/);
  if (m) {
    let sig = { methodName: m[1], static: true };
    if (m[2].trim()) {
      // replace escaped commas with comma entity, split on un-escaped commas
      let args = m[2].replace(/\\,/g, '&comma;').split(',');
      return parseArgs(args, sig);
    } else {
      sig.args = emptyArray;
      return sig;
    }
  }
}

/**
 * Parses an array of arguments and sets the `args` property of the supplied
 * signature metadata object. Sets the `static` property to false if any
 * argument is a non-literal.
 *
 * @param {Array<string>} argList Array of argument names
 * @param {Object} sig Method signature metadata object
 * @return {Object} The updated signature metadata object
 * @private
 */
function parseArgs(argList, sig) {
  sig.args = argList.map(function(rawArg) {
    let arg = parseArg(rawArg);
    if (!arg.literal) {
      sig.static = false;
    }
    return arg;
  }, this);
  return sig;
}

/**
 * Parses an individual argument, and returns an argument metadata object
 * with the following fields:
 *
 *   {
 *     value: 'prop',        // property/path or literal value
 *     literal: false,       // whether argument is a literal
 *     structured: false,    // whether the property is a path
 *     rootProperty: 'prop', // the root property of the path
 *     wildcard: false       // whether the argument was a wildcard '.*' path
 *   }
 *
 * @param {string} rawArg The string value of the argument
 * @return {Object} Argument metadata object
 * @private
 */
function parseArg(rawArg) {
  // clean up whitespace
  let arg = rawArg.trim()
  // replace comma entity with comma
        .replace(/&comma;/g, ',')
  // repair extra escape sequences; note only commas strictly need
  // escaping, but we allow any other char to be escaped since its
  // likely users will do this
        .replace(/\\(.)/g, '\$1')
  ;
  // basic argument descriptor
  let a = {
    name: arg
  };
  // detect literal value (must be String or Number)
  let fc = arg[0];
  if (fc === '-') {
    fc = arg[1];
  }
  if (fc >= '0' && fc <= '9') {
    fc = '#';
  }
  switch(fc) {
  case "'":
  case '"':
    a.value = arg.slice(1, -1);
    a.literal = true;
    break;
  case '#':
    a.value = Number(arg);
    a.literal = true;
    break;
  }
  // if not literal, look for structured path
  if (!a.literal) {
    a.rootProperty = Path.root(arg);
    // detect structured path (has dots)
    a.structured = Path.isDeep(arg);
    if (a.structured) {
      a.wildcard = (arg.slice(-2) == '.*');
      if (a.wildcard) {
        a.name = arg.slice(0, -2);
      }
    }
  }
  return a;
}

/**
 * Gather the argument values for a method specified in the provided array
 * of argument metadata.
 *
 * The `path` and `value` arguments are used to fill in wildcard descriptor
 * when the method is being called as a result of a path notification.
 * 
 * @param {Object} data Instance data storage object to read properties from
 * @param {Array<Object>} args Array of argument metadata
 * @return {Array<*>} Array of argument values
 * @private
 */
function marshalArgs(data, args, path, value) {
  let values = [];
  for (let i=0, l=args.length; i<l; i++) {
    let arg = args[i];
    let name = arg.name;
    let v;
    if (arg.literal) {
      v = arg.value;
    } else if (path == name) {
      v = value;
    } else {
      // TODO(kschaaf): confirm design of this
      v = data[name];
      if (v === undefined && arg.structured) {
        v = Path.get(data, name);
      }
    }
    if (arg.wildcard) {
      // Only send the actual path changed info if the change that
      // caused the observer to run matched the wildcard
      let baseChanged = (name.indexOf(path + '.') === 0);
      let matches = (path.indexOf(name) === 0 && !baseChanged);
      values[i] = {
        path: matches ? path : name,
        value: matches ? value : v,
        base: v
      };
    } else {
      values[i] = v;
    }
  }
  return values;
}

// data api

/**
 * Sends array splice notifications (`.splices` and `.length`) 
 *
 * Note: this implementation only accepts normalized paths
 *
 * @param {Object} inst Instance to send notifications to
 * @param {Array} array The array the mutations occurred on
 * @param {string} path The path to the array that was mutated
 * @param {Array} splices Array of splice records
 * @private
 */
function notifySplices(inst, array, path, splices) {
  // console.log('splices', splices);
  let splicesPath = path + '.splices';
  inst._setProperty(splicesPath, { indexSplices: splices });
  inst._setProperty(path + '.length', array.length);
  // All path notification values are cached on `this.__data__`.
  // Null here to allow potentially large splice records to be GC'ed.
  inst.__data[splicesPath] = {indexSplices: null};
}

/**
 * Creates a splice record and sends an array splice notification for
 * the described mutation
 *
 * Note: this implementation only accepts normalized paths
 *
 * @param {Object} inst Instance to send notifications to
 * @param {Array} array The array the mutations occurred on
 * @param {string} path The path to the array that was mutated
 * @param {number} index Index at which the array mutation occurred
 * @param {number} addedCount Number of added items
 * @param {Array} removed Array of removed items
 * @private
 */
function notifySplice(inst, array, path, index, addedCount, removed) {
  // console.log('removed items', removed);
  notifySplices(inst, array, path, [{
    index: index,
    addedCount: addedCount,
    removed: removed,
    object: array,
    type: 'splice'
  }]);
}

/**
 * Returns an upper-cased version of the string.
 *
 * @param {string} name String to uppercase
 * @return {string} Uppercased string
 */
function upper(name) {
  return name[0].toUpperCase() + name.substring(1);
}

/**
 * Property effects
 * @extends PropertyAccessors
 */
class PropertyEffects extends PropertyAccessors {

  get PROPERTY_EFFECT_TYPES() {
    return TYPES;
  }

  constructor() {
    super();
    this._asyncEffects = false;
    this.__dataInitialized = false;
    this.__dataPendingClients = null;
    this.__dataFromAbove = false;
    this.__dataLinkedPaths = null;
    this.__dataNodes = null;
    // May be set on instance prior to upgrade
    this.__dataCompoundStorage = this.__dataCompoundStorage || null;
    this.__dataHost = this.__dataHost || null;
  }

  /**
   * Adds to default initialization in `PropertyAccessors` by initializing
   * local property & pending data storage with any accessor values saved
   * in `__dataProto`.  If instance properties had been set before the
   * element upgraded and gained accessors on its prototype, these values
   * are set into the prototype's accessors after being deleted from the
   * instance.
   *
   * @override
   */
  _initializeProperties() {
    super._initializeProperties();
    // initialize data with prototype values saved when creating accessors
    if (this.__dataProto) {
      this.__data = Object.create(this.__dataProto);
      this.__dataPending = Object.create(this.__dataProto);
      this.__dataOld = {};
    } else {
      this.__dataPending = null;
    }
    // update instance properties
    for (let p in this.__propertyEffects) {
      if (this.hasOwnProperty(p)) {
        let value = this[p];
        delete this[p];
        this[p] = value;
      }
    }
  }

  /**
   * Adds to the default implementation in `PropertyAccessors` by clearing
   * any locally cached path values if a root object has been set, as that
   * invalidates any descendant paths of that object.
   *
   * @override
   */
  _setPendingProperty(prop, value) {
    // clear cached paths
    if (typeof value == 'object') {
      for (var p in this.__data) {
        if (Polymer.Path.isDescendant(prop, p)) {
          this.__data[p] = undefined;
        }
      }
    }
    return super._setPendingProperty(prop, value);
  }

  // Prototype setup ----------------------------------------

  /**
   * Ensures an accessor exists for the specified property, and adds
   * to a list of "property effects" that will run when the accessor for
   * the specified property is set.  Effects are grouped by "type", which
   * roughly corresponds to a phase in effect processing.  The effect
   * metadata should be in the following form:
   *
   *   {
   *     fn: effectFunction, // Reference to function to call to perform effect
   *     info: { ... }       // Effect metadata passed to function
   *     // path: '...'      // Will be set by this method based on path arg
   *   }
   *
   * Effect functions are called with the following signature:
   *
   *   effectFunction(inst, property, currentValue, oldValue, info)
   *
   * This method may be called either on the prototype of a class
   * using the PropertyEffects mixin (for best performance), or on
   * an instance to add dynamic effects.  When called on an instance or
   * subclass of a class that has already had property effects added to
   * its prototype, the property effect lists will be cloned and added as
   * own properties of the caller.
   *
   * @param {string} path Property (or path) that should trigger the effect
   * @param {string} type Effect type, from this.PROPERTY_EFFECT_TYPES
   * @param {Object} effect Effect metadata object
   * @protected
   */
  _addPropertyEffect(path, type, effect) {
    let property = Path.root(path);
    let effects = ensureOwnEffectMap(this, TYPES.ANY)[property];
    if (!effects) {
      effects = this.__propertyEffects[property] = [];
      this._createPropertyAccessor(property,
                                   type == TYPES.READ_ONLY);
    }
    // effects are accumulated into arrays per property based on type
    if (effect) {
      effect.path = path;
      effects.push(effect);
    }
    effects = ensureOwnEffectMap(this, type)[property];
    if (!effects) {
      effects = this[type][property] = [];
    }
    effects.push(effect);
  }

  /**
   * Returns whether the current prototype/instance has a property effect
   * of a certain type.
   *
   * @param {string} property Property name
   * @param {string} type Effect type, from this.PROPERTY_EFFECT_TYPES
   * @return {boolean} True if the prototype/instance has an effect of this type
   * @protected
   */
  _hasPropertyEffect(property, type) {
    let effects = this[type || TYPES.ANY];
    return Boolean(effects && effects[property]);
  }

  /**
   * Returns whether the current prototype/instance has a "read only"
   * accessor for the given property.
   *
   * @param {string} property Property name
   * @return {boolean} True if the prototype/instance has an effect of this type
   * @protected
   */
  _hasReadOnlyEffect(property) {
    return this._hasPropertyEffect(property, TYPES.READ_ONLY);
  }

  /**
   * Returns whether the current prototype/instance has a "computed"
   * property effect for the given property.
   *
   * @param {string} property Property name
   * @return {boolean} True if the prototype/instance has an effect of this type
   * @protected
   */
  _hasComputedEffect(property) {
    return this._hasPropertyEffect(property, TYPES.COMPUTE);
  }

  // Runtime ----------------------------------------

  /**
   * Sets an unmanaged property (property without accessor) or leaf property
   * of a path to the given value.  If the path in question was a simple
   * property with an accessor, no action is taken.
   *
   * This function isolates relatively expensive functionality necessary
   * for the public API, such that it is only done when paths enter the
   * system, and not in every step of the hot path.
   *
   * If `path` is an unmanaged property (property without an accessor)
   * or a path, sets the value at that path.
   * 
   * If the root of the path is a managed property, returns a normalized
   * string path suitable for setting into the system via `_setProperty`/
   * `_setPendingProperty`.
   *
   * `path` can be a path string or array of path parts as accepted by the
   * public API.
   *
   * @param {string} path Path to set
   * @param {*} value Value to set
   * @return {?string} If the root property was managed, the normalized
   *   string representation of the path, otherwise returns falsey.
   * @protected
   */
  _setPathOrUnmanagedProperty(path, value) {
    let rootProperty = Path.root(Array.isArray(path) ? path[0] : path);
    let hasEffect = this._hasPropertyEffect(rootProperty);
    let isPath = (rootProperty !== path);
    if (!hasEffect || isPath) {
      path = Path.set(this, path, value);
    }
    if (hasEffect) {
      return path;
    }
  }

  /**
   * Overrides PropertyAccessor's default async queuing of 
   * `_propertiesChanged`: if `__dataInitialized` is false (has not yet been
   * manually flushed), the function no-ops; otherwise flushes
   * `_propertiesChanged` synchronously.
   *
   * Subclasses may set `this._asyncEffects = true` to cause 
   * `_propertiesChanged` to be flushed asynchronously.
   *
   * @override
   */
  _invalidateProperties() {
    // console.log('===invalidateProps from Effects', this.__dataInitialized);
    if (this.__dataInitialized) {
      if (this._asyncEffects) {
        super._invalidateProperties();
      } else {
        this._flushProperties();
      }
    }
  }

  /**
   * Overrides PropertyAccessor's default async queuing of 
   * `_propertiesChanged`, to instead synchronously flush
   * `_propertiesChanged` unless the `this._asyncEffects` property is true.
   *
   * If this is the first time properties are being flushed, the `ready`
   * callback will be called.
   *
   * Also adds an optional `fromAbove` argument to indicate when properties
   * are being flushed by a host during data propagation. This information
   * is used to avoid sending upwards notification events in response to
   * downward data flow.  This is a performance optimization, but also
   * critical to avoid infinite looping when an object is notified, since
   * the default implementation of `_shouldPropertyChange` always returns
   * true for Objects, and without would result in a notify-propagate-notify
   * loop.
   *
   * @param {boolean=} fromAbove When true, sets `this.__dataFromAbove` to
   *   `true` for the duration of the call to `_propertiesChanged`.
   * @override
   */
  _flushProperties(fromAbove) {
    if (!this.__dataInitialized) {
      this.ready();
    }
    if (this.__dataPending || this.__dataPendingClients) {
      this.__dataFromAbove = fromAbove;
      super._flushProperties();
      this.__dataFromAbove = false;
    }
  }

  /**
   * Polymer-specific lifecycle callback called the first time properties
   * are being flushed.  Prior to `ready`, all property sets through
   * accessors are queued and their effects are flushed after this method
   * returns.
   *
   * Users may override this function to implement behavior that is
   * dependent on the element having its properties initialized, e.g.
   * from defaults (initialized from `constructor`, `_initializeProperties`),
   * `attributeChangedCallback`, or binding values propagated from host
   * "annotation effects".  `super.ready()` must be called to ensure the
   * data system becomes enabled.
   *
   * @public
   */
  ready() {
    this.__dataInitialized = true;
  }

  /**
   * Implements `PropertyAccessors`'s properties changed callback.
   *
   * Base implementation simply iterates the list of all property effects
   * and runs them in the order they were added.
   *
   * @override
   */
  _propertiesChanged(currentProps, changedProps, oldProps) {
    // console.log('propsChanged', changedProps);
    for (let p in changedProps) {
      let effects = this.__propertyEffects[p];
      runEffects(this, p, changedProps[p], oldProps[p], effects);
    }
  }

  /**
   * Aliases one data path as another, such that path notifications from one
   * are routed to the other.
   *
   * @method linkPaths
   * @param {string} to Target path to link.
   * @param {string} from Source path to link.
   * @public
   */
  linkPaths(to, from) {
    to = Path.normalize(to);
    from = Path.normalize(from);
    this.__dataLinkedPaths = this.__dataLinkedPaths || {};
    if (from) {
      this.__dataLinkedPaths[to] = from;
    } else {
      this.__dataLinkedPaths(to);
    }
  }

  /**
   * Removes a data path alias previously established with `_linkPaths`.
   *
   * Note, the path to unlink should be the target (`to`) used when
   * linking the paths.
   *
   * @method unlinkPaths
   * @param {string} path Target path to unlink.
   * @public
   */
  unlinkPaths(path) {
    path = Path.normalize(path);
    if (this.__dataLinkedPaths) {
      delete this.__dataLinkedPaths[path];
    }
  }

  /**
   * Notify that an array has changed.
   *
   * Example:
   *
   *     this.items = [ {name: 'Jim'}, {name: 'Todd'}, {name: 'Bill'} ];
   *     ...
   *     this.items.splice(1, 1, {name: 'Sam'});
   *     this.items.push({name: 'Bob'});
   *     this.notifySplices('items', [
   *       { index: 1, removed: [{name: 'Todd'}], addedCount: 1, obect: this.items, type: 'splice' },
   *       { index: 3, removed: [], addedCount: 1, object: this.items, type: 'splice'}
   *     ]);
   *
   * @param {string} path Path that should be notified.
   * @param {Array} splices Array of splice records indicating ordered
   *   changes that occurred to the array. Each record should have the
   *   following fields:
   *    * index: index at which the change occurred
   *    * removed: array of items that were removed from this index
   *    * addedCount: number of new items added at this index
   *    * object: a reference to the array in question
   *    * type: the string literal 'splice'
   *
   *   Note that splice records _must_ be normalized such that they are
   *   reported in index order (raw results from `Object.observe` are not
   *   ordered and must be normalized/merged before notifying).
   * @public
   */
  notifySplices(path, splices) {
    let info = {};
    let array = Polymer.Path.get(this, path, info);
    notifySplices(this, array, info.path, splices);
  }

  /**
   * Convenience method for reading a value from a path.
   *
   * Note, if any part in the path is undefined, this method returns
   * `undefined` (this method does not throw when dereferencing undefined
   * paths).
   *
   * @method get
   * @param {(string|Array<(string|number)>)} path Path to the value
   *   to read.  The path may be specified as a string (e.g. `foo.bar.baz`)
   *   or an array of path parts (e.g. `['foo.bar', 'baz']`).  Note that
   *   bracketed expressions are not supported; string-based path parts
   *   *must* be separated by dots.  Note that when dereferencing array
   *   indices, the index may be used as a dotted part directly
   *   (e.g. `users.12.name` or `['users', 12, 'name']`).
   * @param {Object=} root Root object from which the path is evaluated.
   * @return {*} Value at the path, or `undefined` if any part of the path
   *   is undefined.
   * @public
   */
  get(path, root) {
    return Polymer.Path.get(root || this, path);
  }

  /**
   * Convenience method for setting a value to a path and notifying any
   * elements bound to the same path.
   *
   * Note, if any part in the path except for the last is undefined,
   * this method does nothing (this method does not throw when
   * dereferencing undefined paths).
   *
   * @method set
   * @param {(string|Array<(string|number)>)} path Path to the value
   *   to write.  The path may be specified as a string (e.g. `'foo.bar.baz'`)
   *   or an array of path parts (e.g. `['foo.bar', 'baz']`).  Note that
   *   bracketed expressions are not supported; string-based path parts
   *   *must* be separated by dots.  Note that when dereferencing array
   *   indices, the index may be used as a dotted part directly
   *   (e.g. `'users.12.name'` or `['users', 12, 'name']`).
   * @param {*} value Value to set at the specified path.
   * @param {Object=} root Root object from which the path is evaluated.
   *   When specified, no notification will occur.
   * @public
   */
  set(path, value, root) {
    if (root) {
      Polymer.Path.set(root, path, value);
    } else {
      if (!this._hasReadOnlyEffect(path)) {
        if ((path = this._setPathOrUnmanagedProperty(path, value))) {
          // console.log('setprop', path);
          this._setProperty(path, value);
        }
      }          
    }
  }

  /**
   * Called by 2-way binding notification event listeners to set a property
   * or path to the host based on a notification from a bound child.
   *
   * This method is provided as an override point.  The default
   * implementation causes a synchronous `set` of the given path.
   *
   * @param {string} path Path on this instance to set
   * @param {*} value Value to set to given path
   * @protected
   */
  _setPropertyFromNotification(path, value) {
    this.set(path, value);
  }

  /**
   * Called by "annotation effect" to set a property to a node.  Note,
   * the caller must ensure that the target node has a property effect for
   * the property in question, otherwise this method will error.
   *
   * This method is provided as an override point.  The default
   * implementation calls `_setProperty` to synchronously set & flush
   * the property to the node as long as the property is not read-only.
   *
   * @param {Node} node Node to set property on
   * @param {string} prop Property (or path) name to set
   * @param {*} value Value to set
   * @protected
   */
  _setPropertyToNodeFromAnnotation(node, prop, value) {
    if (!node._hasReadOnlyEffect(prop)) {
      node._setProperty(prop, value);
    }
  }

  /**
   * Called by "computed property effect" to set the result of a computing
   * function to the computing property.
   *
   * This method is provided as an override point.  The default
   * implementation simply sets the value in to the accessor for the
   * property.
   *
   * @param {string} prop Property name to set
   * @param {*} value Computed value to set
   * @protected
   */
  _setPropertyFromComputation(prop, value) {
    this[prop] = value;
  }

  /**
   * Adds items onto the end of the array at the path specified.
   *
   * The arguments after `path` and return value match that of
   * `Array.prototype.push`.
   *
   * This method notifies other paths to the same array that a
   * splice occurred to the array.
   *
   * @method push
   * @param {String} path Path to array.
   * @param {...any} var_args Items to push onto array
   * @return {number} New length of the array.
   * @public
   */
  push(path, ...items) {
    let info = {};
    let array = Polymer.Path.get(this, path, info);
    let len = array.length;
    let ret = array.push(...items);
    if (items.length) {
      notifySplice(this, array, info.path, len, items.length, []);
    }
    return ret;
  }

  /**
   * Removes an item from the end of array at the path specified.
   *
   * The arguments after `path` and return value match that of
   * `Array.prototype.pop`.
   *
   * This method notifies other paths to the same array that a
   * splice occurred to the array.
   *
   * @method pop
   * @param {String} path Path to array.
   * @return {any} Item that was removed.
   * @public
   */
  pop(path) {
    let info = {};
    let array = Polymer.Path.get(this, path, info);
    let hadLength = Boolean(array.length);
    let ret = array.pop();
    if (hadLength) {
      console.log('hadLenghtPop');
      notifySplice(this, array, info.path, array.length, 0, [ret]);
    }
    return ret;
  }

  /**
   * Removes value from the array
   * Call this.splice with element index
   *
   * @param {String} path Path to array.
   * @return {Array} Array of removed items.
   * @public
   */
  spliceByValue(path, value) {
    let info = {};
    let array = Polymer.Path.get(this, path, info);
    let hadLength = Boolean(array.length);

    let ret = [];

    if (hadLength) {
      let ind = array.indexOf(value);
      if (ind >= 0) {
        ret = this.splice(path, ind, 1);
      }
    }

    return ret;
  }

  /**
   * Starting from the start index specified, removes 0 or more items
   * from the array and inserts 0 or more new items in their place.
   *
   * The arguments after `path` and return value match that of
   * `Array.prototype.splice`.
   *
   * This method notifies other paths to the same array that a
   * splice occurred to the array.
   *
   * @method splice
   * @param {String} path Path to array.
   * @param {number} start Index from which to start removing/inserting.
   * @param {number} deleteCount Number of items to remove.
   * @param {...any} var_args Items to insert into array.
   * @return {Array} Array of removed items.
   * @public
   */
  splice(path, start, deleteCount, ...items) {
    let info = {};
    let array = Polymer.Path.get(this, path, info);
    // Normalize fancy native splice handling of crazy start values
    if (start < 0) {
      start = array.length - Math.floor(-start);
    } else {
      start = Math.floor(start);
    }
    if (!start) {
      start = 0;
    }
    let ret = array.splice(start, deleteCount, ...items);
    if (items.length || ret.length) {
      notifySplice(this, array, info.path, start, items.length, ret);
    }
    return ret;
  }

  /**
   * Removes an item from the beginning of array at the path specified.
   *
   * The arguments after `path` and return value match that of
   * `Array.prototype.pop`.
   *
   * This method notifies other paths to the same array that a
   * splice occurred to the array.
   *
   * @method shift
   * @param {String} path Path to array.
   * @return {any} Item that was removed.
   * @public
   */
  shift(path) {
    let info = {};
    let array = Polymer.Path.get(this, path, info);
    let hadLength = Boolean(array.length);
    let ret = array.shift();
    if (hadLength) {
      notifySplice(this, array, info.path, 0, 0, [ret]);
    }
    return ret;
  }

  /**
   * Adds items onto the beginning of the array at the path specified.
   *
   * The arguments after `path` and return value match that of
   * `Array.prototype.push`.
   *
   * This method notifies other paths to the same array that a
   * splice occurred to the array.
   *
   * @method unshift
   * @param {String} path Path to array.
   * @param {...any} var_args Items to insert info array
   * @return {number} New length of the array.
   * @public
   */
  unshift(path, ...items) {
    let info = {};
    let array = Polymer.Path.get(this, path, info);
    let ret = array.unshift(...items);
    if (items.length) {
      notifySplice(this, array, info.path, 0, items.length, []);
    }
    return ret;
  }

  /**
   * Notify that a path has changed.
   *
   * Example:
   *
   *     this.item.user.name = 'Bob';
   *     this.notifyPath('item.user.name');
   *
   * @param {string} path Path that should be notified.
   * @param {*=} value Value at the path (optional).
   * @public
   */
  notifyPath(path, value) {
    if (arguments.length == 1) {
      // Get value if not supplied
      let info = {};
      value = Polymer.Path.get(this, path, info);
      path = info.path;
    } else if (Array.isArray(path)) {
      // Normalize path if needed
      path = Polymer.Path.normalize(path);
    }
    this._setProperty(path, value);
  }

  /**
   * Creates a read-only accessor for the given property.
   *
   * To set the property, use the protected `_setProperty` API.
   * To create a custom protected setter (e.g. `_setMyProp()` for 
   * property `myProp`), pass `true` for `protectedSetter`.
   *
   * Note, if the property will have other property effects, this method
   * should be called first, before adding other effects.
   *
   * @param {string} property Property name
   * @param {boolean=} protectedSetter Creates a custom protected setter
   *   when `true`.
   * @protected
   */
  _createReadOnlyProperty(property, protectedSetter) {
    this._addPropertyEffect(property, TYPES.READ_ONLY);
    if (protectedSetter) {
      this['_set' + upper(property)] = function(value) {
        this._setProperty(property, value);
      };
    }
  }

  /**
   * Creates a single-property observer for the given property.
   *
   * @param {string} property Property name
   * @param {string} methodName Name of observer method to call
   * @protected
   */
  _createObservedProperty(property, methodName) {
    // console.log('createObserverProperty', property);
    this._addPropertyEffect(property, TYPES.OBSERVE, {
      fn: runObserverEffect,
      info: {
        methodName: methodName
      }
    });
  }

  /**
   * Creates a multi-property "method observer" based on the provided
   * expression, which should be a string in the form of a normal Javascript
   * function signature: `'methodName(arg1, [..., argn])'`.  Each argument
   * should correspond to a property or path in the context of this
   * prototype (or instance), or may be a literal string or number.
   *
   * @param {string} expression Method expression
   * @protected
   */
  _createMethodObserver(expression) {
    let sig = parseMethod(expression);
    if (!sig) {
      throw new Error("Malformed observer expression '" + expression + "'");
    }
    createMethodEffect(this, sig, TYPES.OBSERVE, runMethodObserverEffect);
  }

  /**
   * Creates a computed property whose value is set to the result of the
   * method described by the given `expression` each time one or more
   * arguments to the method changes.  The expression should be a string
   * in the form of a normal Javascript function signature:
   * `'methodName(arg1, [..., argn])'`
   *
   * @param {string} property Name of computed property to set
   * @param {string} expression Method expression
   * @protected
   */
  _createComputedProperty(property, expression) {
    let sig = parseMethod(expression);
    if (!sig) {
      throw new Error("Malformed computed expression '" + expression + "'");
    }
    createMethodEffect(this, sig, TYPES.COMPUTE,
                       runComputedEffect, property);
  }
}

module.exports = PropertyEffects;
