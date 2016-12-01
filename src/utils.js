/** @module */
'use strict';

module.exports = {
  /**
   * Copies props from a source object to a target object.
   *
   * Note, this method uses a simple `for...in` strategy for enumerating
   * properties.  To ensure only `ownProperties` are copied from source
   * to target and that accessor implementations are copied, use `extend`.
   *
   * @method mixin
   * @param {Object} target Target object to copy properties to.
   * @param {Object} source Source object to copy properties from.
   * @return {Object} Target object that was passed as first argument.
   */
  mixin(target, source) {
    for (var i in source) {
      target[i] = source[i];
    }
    return target;
  }
};
