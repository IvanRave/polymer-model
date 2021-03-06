/** @module */

'use strict';

// Save map of native properties; this forms a blacklist or properties
// that won't have their values "saved" by `saveAccessorValue`, since
// reading from an HTMLElement accessor from the context of a prototype throws
// TODO: all native
const nativeProperties = {"title":true,"lang":true,"translate":true,"dir":true,"dataset":true,"hidden":true,"tabIndex":true,"accessKey":true,"draggable":true,"spellcheck":true,"contentEditable":true,"isContentEditable":true,"offsetParent":true,"offsetTop":true,"offsetLeft":true,"offsetWidth":true,"offsetHeight":true,"style":true,"innerText":true,"outerText":true,"webkitdropzone":true,"onabort":true,"onblur":true,"oncancel":true,"oncanplay":true,"oncanplaythrough":true,"onchange":true,"onclick":true,"onclose":true,"oncontextmenu":true,"oncuechange":true,"ondblclick":true,"ondrag":true,"ondragend":true,"ondragenter":true,"ondragleave":true,"ondragover":true,"ondragstart":true,"ondrop":true,"ondurationchange":true,"onemptied":true,"onended":true,"onerror":true,"onfocus":true,"oninput":true,"oninvalid":true,"onkeydown":true,"onkeypress":true,"onkeyup":true,"onload":true,"onloadeddata":true,"onloadedmetadata":true,"onloadstart":true,"onmousedown":true,"onmouseenter":true,"onmouseleave":true,"onmousemove":true,"onmouseout":true,"onmouseover":true,"onmouseup":true,"onmousewheel":true,"onpause":true,"onplay":true,"onplaying":true};

/**
 * Used to save the value of a property that will be overridden with
 * an accessor. If the `model` is a prototype, the values will be saved
 * in `__dataProto`, and it's up to the user (or downstream mixin) to
 * decide how/when to set these values back into the accessors.
 * If `model` is already an instance (it has a `__data` property), then
 * the value will be set as a pending property, meaning the user should
 * call `_invalidateProperties` or `_flushProperties` to take effect
 *
 * @param {Object} model Prototype or instance
 * @param {string} property Name of property
 * @private
 */
function saveAccessorValue(model, property) {
  // Don't read/store value for any native properties since they could throw
  if (!nativeProperties[property]) {
    let value = model[property];
    if (value !== undefined) {
      if (model.__data) {
        // Adding accessor to instance; update the property
        // It is the user's responsibility to call _flushProperties
        model._setPendingProperty(property, value);
      } else {
        // Adding accessor to proto; save proto's value for instance-time use
        if (!model.__dataProto) {
          model.__dataProto = {};
        } else if (!model.hasOwnProperty('__dataProto')) {
          model.__dataProto = Object.create(model.__dataProto);
        }
        model.__dataProto[property] = value;          
      }
    }      
  }
}

/**
 * Property accessors
 */
class PropertyAccessors {

  constructor() {
    this._initializeProperties();
  }

  /**
   * Initializes the local storage for property accessors.
   *
   * Override to initialize with e.g. default values by setting values into
   * accessors.
   *
   * @protected
   */
  _initializeProperties() {
    this.__data = {};
    this.__dataPending = null;
    this.__dataOld = null;
    this.__dataInvalid = false;
  }

  /**
   * Creates a setter/getter pair for the named property with its own
   * local storage.  The getter returns the value in the local storage,
   * and the setter calls `_setProperty`, which updates the local storage
   * for the property and enqueues a `_propertiesChanged` callback.
   *
   * This method may be called on a prototype or an instance.  Calling
   * this method may overwrite a property value that already exists on
   * the prototype/instance by creating the accessor.  When calling on
   * a prototype, any overwritten values are saved in `__dataProto`,
   * and it is up to the subclasser to decide how/when to set those
   * properties back into the accessor.  When calling on an instance,
   * the overwritten value is set via `_setPendingProperty`, and the
   * user should call `_invalidateProperties` or `_flushProperties`
   * for the values to take effect.
   *
   * @param {string} property Name of the property
   * @param {boolean=} readOnly When true, no setter is created; the
   *   protected `_setProperty` function must be used to set the property
   * @protected
   */
  _createPropertyAccessor(property, readOnly) {
    saveAccessorValue(this, property);
    Object.defineProperty(this, property, {
      get: function() {
        return this.__data && this.__data[property];
      },
      set: readOnly ? function() { 
        console.log('_setProp readonly', property);
      } : function(value) {
        console.log('_setProp', property);
        this._setProperty(property, value);
      }
    });
  }

  /**
   * Updates the local storage for a property (via `_setPendingProperty`)
   * and enqueues a `_proeprtiesChanged` callback.
   *
   * @param {string} property Name of the property
   * @param {*} value Value to set
   * @protected
   */
  _setProperty(property, value) {
    if (this._setPendingProperty(property, value)) {
      this._invalidateProperties();
    }
  }

  /**
   * Updates the local storage for a property, records the previous value,
   * and adds it to the set of "pending changes" that will be passed to the
   * `_propertiesChanged` callback.  This method does not enqueue the
   * `_propertiesChanged` callback.
   *
   * @param {string} property Name of the property
   * @param {*} value Value to set
   * @protected
   */
  _setPendingProperty(property, value) {
    console.log('_setPendingProperty', property);
    let old = this.__data[property];
    if (this._shouldPropChange(property, value, old)) {
      if (!this.__dataPending) {
        this.__dataPending = {};
        this.__dataOld = {};
      }
      // Ensure old is captured from the last turn
      if (!(property in this.__dataOld)) {
        this.__dataOld[property] = old;
      }
      this.__data[property] = value;
      this.__dataPending[property] = value;
      return true;
    }
  }

  /**
   * Returns true if the specified property has a pending change.
   *
   * @param {string} prop Property name
   * @return {boolean} True if property has a pending change
   * @protected
   */
  _isPropertyPending(prop) {
    return this.__dataPending && (prop in this.__dataPending);
  }

  /**
   * Marks the properties as invalid, and enqueues an async
   * `_propertiesChanged` callback.
   *
   * @protected
   */
  _invalidateProperties() {
    //console.log('===invalidateProps');
    if (!this.__dataInvalid) {
      this.__dataInvalid = true;
      Promise.resolve().then(() => {
        if (this.__dataInvalid) {
          this.__dataInvalid = false;
          this._flushProperties();
        }
      });
    }
  }

  /**
   * Calls the `_propertiesChanged` callback with the current set of
   * pending changes (and old values recorded when pending changes were
   * set), and resets the pending set of changes.
   *
   * @protected
   */
  _flushProperties() {
    //console.log('===flushProps');
    let oldProps = this.__dataOld;
    let changedProps = this.__dataPending;
    this.__dataPending = null;
    this._propertiesChanged(this.__data, changedProps, oldProps);
  }

  /**
   * Callback called when any properties with accessors created via 
   * `_createPropertyAccessor` have been set.
   *
   * @param {Object} currentProps Bag of all current accessor values
   * @param {Object} changedProps Bag of properties changed since the last
   *   call to `_propertiesChanged`
   * @param {Object} oldProps Bag of previous values for each property
   *   in `changedProps`
   * @protected
   */
  _propertiesChanged(currentProps, changedProps, oldProps) { // eslint-disable-line no-unused-vars
    //console.log('callback: propsChanged', changedProps);
  }

  /**
   * Method called to determine whether a property value should be
   * considered as a change and cause the `_propertiesChanged` callback
   * to be enqueued.
   *
   * The default implementation returns `true` for primitive types if a
   * strict equality check fails, and returns `true` for all Object/Arrays.
   * The method always returns false for `NaN`.
   *
   * Override this method to e.g. provide stricter checking for
   * Objects/Arrays when using immutable patterns.
   *
   * @param {type} name Description
   * @return {boolean} Whether the property should be considered a change
   *   and enqueue a `_proeprtiesChanged` callback
   * @protected
   */
  _shouldPropChange(property, value, old) {
    var result = (
      // Strict equality check for primitives
      (old !== value && 
       // This ensures old:NaN, value:NaN always returns false
       (old === old || value === value)) ||
        // Objects/Arrays always pass
        (typeof value == 'object')
    );
    //console.log('shouldPropertyChange: ' + property, result);
    return result;
  }

}

module.exports = PropertyAccessors;
