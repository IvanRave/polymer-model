var chai = require('chai');

var expect = chai.expect;

var Store = require('../index');

var props = {
  firstName: {
    type: String
  },
  lastName: {
    type: String
  },
  tourists: {
    type: Array
  },
  insurer: {
    type: Object
  },
  group: {
    type: Object
  },
  'group.members': {
    type: Array
  },
  'insurer.name': {
    type: String
  },
  fullName: {
    type: String,
    computed: '_computeFullName(firstName, lastName)'
  },
  isNameValid: {
    type: Boolean,
    computed: '_computeIsNameValid(fullName)'
  },
  isFormValid: {
    type: Boolean,
    computed: '_computeIsFormValid(isNameValid)'
  }
};

Object.keys(props).forEach(function(k) {
  props[k].observer = '_somePropChanged';
});

var NEX = undefined;

var changedKeys = [];

var methods = {
  _somePropChanged: function(newValue, oldValue, property) {
    changedKeys.push(property);
  },
  _computeFullName: function(firstName, lastName) {
    console.log('compute fullName by ', firstName, lastName);
    if (firstName && lastName) {
      return firstName + ' ' + lastName;
    }

    return NEX;
  },
  _computeIsNameValid: function(fullName) {
    console.log('compute isNameValid by ' + fullName);
    if (fullName) {
      return fullName.indexOf('qwe') >= 0;
    }
    return NEX;
  },
  _computeIsFormValid: function(isNameValid) {
    console.log('compute isFormValid by ' + isNameValid)
    return isNameValid;
  }
};

describe('Array', function() {  
  var store;

  beforeEach(function() {
    store = new Store(props, methods);
    // all events fired after ready
    // I'm ready to receive events
    store.ready();
  });

  afterEach(function() {
    store = null;
  });

  var check = function(msg, resultState, resultKeys) {
    if (msg) {
      var f = store[msg.cmd];
      changedKeys = [];
      f.call(store, msg.key, msg.val);
      expect(changedKeys).to.deep.equal(resultKeys);
    }

    // console.log(JSON.stringify(store.__data));
    // console.log(JSON.stringify(resultState));
    expect(store.__data).to.deep.equal(resultState);
  };

  it('should send and check primitives', function() {
    check(null, {}, []);

    check(
      { cmd: 'set', key: 'firstName', val: 'Ivan' },
      { firstName: 'Ivan' }, 
      ['firstName']
    );

    check({
      cmd: 'set',
      key: 'lastName',
      field: null,
      val: 'Rave'
    }, {
      firstName: 'Ivan',
      lastName: 'Rave',
      fullName: 'Ivan Rave',
      isNameValid: false,
      isFormValid: false
    }, [
      'lastName', 'fullName', 'isNameValid', 'isFormValid'
    ]);

    check({ cmd: 'set', key: 'firstName', val: null}, {
      firstName: null,
      lastName: 'Rave',
      fullName: NEX,
      isNameValid: NEX,
      isFormValid: NEX
    }, [
      'firstName', 'fullName', 'isNameValid', 'isFormValid'
    ]);

    check({ cmd: 'set', key: 'lastName', val: null}, {
      firstName: null,
      lastName: null,
      fullName: NEX,
      isNameValid: NEX,
      isFormValid: NEX
    }, [
      'lastName'
    ]);
  });

  it('should send and check arrays', function() {
    check({
      cmd: 'set', key: 'tourists', val: []
    }, {
      tourists: []
    }, [
      'tourists'
    ]);

    check({
      cmd: 'push', key: 'tourists', val: 123
    }, {
      tourists: [123],
      "tourists.length": 1,
      "tourists.splices": {
        "indexSplices": null
      }
    }, [
      'tourists.splices',
      'tourists.length'
    ]);

    check({
      cmd: 'set', key: 'tourists.0', val: 234
    }, {
      tourists: [234],
      "tourists.0": 234,
      "tourists.length": 1,
      "tourists.splices": {
        "indexSplices": null
      }
    }, [
      'tourists.0'
    ]);

    check({
      cmd: 'set', key: 'tourists.2', val: 345
    }, {
      tourists: [234, , 345],
      "tourists.0": 234,
      "tourists.2": 345,
      "tourists.length": 1,
      "tourists.splices": {
        "indexSplices": null
      }
    }, [
      'tourists.2'
    ]);

    check({
      cmd: 'pop', key: 'tourists'
    }, {
      tourists: [234],
      "tourists.0": 234,
      // TODO
      "tourists.2": 345,
      "tourists.length": 2,
      "tourists.splices": {
        "indexSplices": null
      }
    }, [
      'tourists.splices', 'tourists.length'
    ]);    
    
  });
});
