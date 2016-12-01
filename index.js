var Store = require('./src/store');

module.exports = Store;


// define changed keys
// var changedKeys = [msg.key];
// publish message to message bus
// console.log(store.__data); // TODO: copy

// pe.push - to array
// pe.pop
// pe.splice
// shift
// unshift

//store.set('firstName', 'Johny');
//store.firstName = 'qwer';

//pe.get(null, 'insurer');

// var pa = new PA();

// pa._createPropertyAccessor('insurer', false);
// pa._createPropertyAccessor('dateVisa', false);

// pa.dateVisa = 123;
// pa.insurer = { bar: 'foo' };

// pa.insurer.bar = 'foo2';
// pa.dateVisa = 234;

// console.log(pa);

// console.log(pa.insurer);


// https://www.polymer-project.org/1.0/docs/devguide/properties
// Property type.
// Default value.
// Property change observer. Calls a method whenever the property value changes.
// Read-only status. Prevents accidental changes to the property value.
// Two-way data binding support. Fires an event whenever the property value changes.
// Computed property. Dynamically calculates a value based on other properties.
// Property reflection to attribute. Updates the corresponding attribute value when the property value changes.




// observers: [
//  'userListChanged(users.*, filter)'
//]
// var observers = [];


      // check({firstName: null});

      // store.set('group', {members: []});

      // store.push('group.members', 123);
      // store.push(['group', 'members'], 234);

      // store.set('tourists', [{t: 1}]);

      // store.set('lastName', 'last');

      // store.set('insurer.name', 234);

      // store.set(['firstName'], 'first');

      // store.set('firstName', null);

      // check({firstName: null});
