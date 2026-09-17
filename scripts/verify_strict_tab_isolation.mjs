import assert from 'assert';

console.log('--- Testing Strict Tab Isolation & Zero Duplication ---');

const currentDriver = {
  uid: 'drv_test_1',
  name: 'Ramesh Driver',
  role: 'driver',
  isDriverVerified: true
};

const orders = [
  {
    id: 'ord_sweet_dreams_1',
    title: 'Sweet dreams',
    description: '1kg Rasgulla & Gulab Jamun',
    pickupAddress: 'Sweet Dreams Bakery, Main Market',
    dropAddress: 'Bhabha Nagar, Rawatbhata',
    price: 80,
    status: 'pending',
    targetAudience: 'driver_pool'
  },
  {
    id: 'ord_general_store_2',
    title: 'Sharma Kirana',
    description: 'Milk & Bread',
    pickupAddress: 'Sharma Kirana Store',
    dropAddress: 'Sector 2, Rawatbhata',
    price: 40,
    status: 'pending',
    targetAudience: 'driver_pool'
  }
];

// Helper functions matching DriverPortal.tsx
function getAvailableRuns(ordersList, acceptedSet) {
  const publicOrders = ordersList.filter((o) => o.targetAudience === 'driver_pool');
  return publicOrders.filter((o) => {
    const isAssigned = Boolean(
      o.assignedTo ||
      o.driverId ||
      acceptedSet.has(o.id) ||
      o.status !== 'pending'
    );
    return o.status === 'pending' && !isAssigned;
  });
}

function getActiveRuns(ordersList, user, acceptedSet) {
  const publicOrders = ordersList.filter((o) => o.targetAudience === 'driver_pool');
  return publicOrders.filter((o) => {
    const isAssignedToMe = Boolean(
      o.assignedTo === user?.uid ||
      o.driverId === user?.uid ||
      acceptedSet.has(o.id)
    );
    const isActiveStatus = ['assigned', 'accepted', 'in_progress', 'photo_uploaded'].includes(o.status) || acceptedSet.has(o.id);
    const isNotDone = o.status !== 'completed' && o.status !== 'cancelled';
    return isAssignedToMe && isActiveStatus && isNotDone;
  });
}

// Initial State Test
let acceptedOrderIds = new Set();
let available = getAvailableRuns(orders, acceptedOrderIds);
let active = getActiveRuns(orders, currentDriver, acceptedOrderIds);

assert.strictEqual(available.length, 2, 'Both orders should be available initially');
assert.strictEqual(active.length, 0, 'No active runs initially');
console.log('✓ Test 1 Passed: Initial state correctly places 2 orders in available runs and 0 in active runs.');

// Step 2: Driver clicks "Accept Run" on "Sweet dreams" (ord_sweet_dreams_1)
acceptedOrderIds.add('ord_sweet_dreams_1');

available = getAvailableRuns(orders, acceptedOrderIds);
active = getActiveRuns(orders, currentDriver, acceptedOrderIds);

assert.strictEqual(available.length, 1, 'Only 1 order should remain in available runs');
assert.strictEqual(available[0].id, 'ord_general_store_2', 'Sharma Kirana should remain in available runs');
assert.strictEqual(active.length, 1, 'Sweet dreams should immediately appear in active runs');
assert.strictEqual(active[0].id, 'ord_sweet_dreams_1', 'Active run is Sweet dreams');

// Check ZERO overlap
const intersection = available.filter(av => active.some(ac => ac.id === av.id));
assert.strictEqual(intersection.length, 0, 'There must be ZERO overlap between available and active runs');
console.log('✓ Test 2 Passed: Sweet dreams is instantly removed from Available Runs and moved to Active Runs with 0 duplication.');

// Step 3: Firestore state update returns status: 'assigned' and assignedTo: 'drv_test_1'
const updatedOrders = orders.map(o => o.id === 'ord_sweet_dreams_1' ? {
  ...o,
  status: 'assigned',
  assignedTo: 'drv_test_1',
  driverId: 'drv_test_1'
} : o);

available = getAvailableRuns(updatedOrders, acceptedOrderIds);
active = getActiveRuns(updatedOrders, currentDriver, acceptedOrderIds);

assert.strictEqual(available.length, 1);
assert.strictEqual(active.length, 1);
assert.strictEqual(available.some(o => o.id === 'ord_sweet_dreams_1'), false, 'Assigned order can never be in available runs');
console.log('✓ Test 3 Passed: After Firestore state update, strict separation is permanently maintained.');

console.log('\nAll Strict Tab Isolation tests PASSED 100% successfully!');
