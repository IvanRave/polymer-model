/** @module */
'use strict';

var BatchedEffects = require('./batched-effects');
//var PropertyEffects = require('./property-effects');

/**
 * Store
 * @extends BatchedEffects
 */
class Store extends BatchedEffects {

  constructor(properties, methods) {
    super();

    // save properties and methods from config to the instance
    for (var item in methods){
      this[item] = methods[item];
    }

    this._finalizeConfig(properties);
  }

  /**
   * Creates effects for a property.
   *
   * Example:
   *
   *     this._createPropertyFromConfig('foo', {
   *       type: String, value: 'foo'
   *     });
   *
   * Note, once a property has been set to
   * `readOnly`, `computed`, or `notify`
   * these values may not be changed. For example, a subclass cannot
   * alter these settings. However, additional `observers` may be added
   * by subclasses.
   *
   * @param {string} name Name of the property.
   * @param {*=} info Info object from which to create property effects.
   * Supported keys:
   *
   * * type: {function} type to which an attribute matching the property
   * is deserialized. Note the property is camel-cased from a dash-cased
   * attribute. For example, 'foo-bar' attribute is dersialized to a
   * property named 'fooBar'.
   *
   * * readOnly: {boolean} creates a readOnly property and
   * makes a private setter for the private of the form '_setFoo' for a
   * property 'foo',
   *
   * * computed: {string} creates a computed property. A computed property
   * also automatically is set to `readOnly: true`. The value is calculated
   * by running a method and arguments parsed from the given string. For
   * example 'compute(foo)' will compute a given property when the
   * 'foo' property changes by executing the 'compute' method. This method
   * must return the computed value.
   *
   * * notify: {boolean} sends a non-bubbling notification event when
   * the property changes. For example, a property named 'foo' sends an
   * event named 'foo-changed' with `event.detail` set to the value of
   * the property.
   *
   * * observer: {string} name of a method that runs when the property
   * changes. The arguments of the method are (value, previousValue).
   * @private
   */
  /* TODO(sorvell): Users may want control over modifying property
   effects via subclassing. We've chosen to
   disable this because it leads to additional complication.
   For example, a readOnly effect generates a special setter. If a subclass
   disables the effect, the setter would fail unexpectedly.
   Based on feedback, we may want to try to make effects more malleable
   and/or provide an advanced api for manipulating them.
   Also consider adding warnings when an effect cannot be changed.
   */
  _createPropertyFromConfig(name, info) {
    // computed forces readOnly...
    if (info.computed) {
      info.readOnly = true;
    }
    // Note, since all computed properties are readOnly, this prevents
    // adding additional computed property effects (which leads to a confusing
    // setup where multiple triggers for setting a property)
    // While we do have `hasComputedEffect` this is set on the property's
    // dependencies rather than itself.
    if (info.computed  && !this._hasReadOnlyEffect(name)) {
      this._createComputedProperty(name, info.computed);
    }
    if (info.readOnly && !this._hasReadOnlyEffect(name)) {
      this._createReadOnlyProperty(name, !info.computed);
    }
    // always add observer
    if (info.observer) {
      this._createObservedProperty(name, info.observer);
    }
  }

  _finalizeConfig(properties) {
    if (properties) {
      // process properties
      for (let p in properties) {
        // console.log('createProp', p);
        this._createPropertyFromConfig(p, properties[p]);
      }
    }
    // if (observers) {
    //   for (let i=0; i < observers.length; i++) {
    //     this._createMethodObserver(observers[i]);
    //   }
    // }
  }

  /**
   * @public
   * @see {@link module:property-effects}
   */
  ready() {
    super.ready();
    // additional logic
  }
}

module.exports = Store;
