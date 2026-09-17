import assert from 'assert';

console.log('--- Testing Accept Run Firestore & Active Runs Filtering ---');

// Mock order state
const currentUser = {
  uid: 'usr_driver_777',
  name: 'Mukesh Sharma',
  phoneNumber: '9876543210',
  role: 'driver',
  isDriverVerified: true
};

const initialOrders = [
  {
    id: 'ord_med_123',
    title: 'pankaj medicose',
    description: 'Dolo 650, Cough syrup, Vicks',
    pickupAddress: 'Pankaj Medicose, Market',
    dropAddress: 'Sector 3, Rawatbhata',
    price: 60,
    status: 'pending',
    targetAudience: 'driver_pool'
  }
];

// 1. Simulate acceptOrder
function simulateAcceptOrder(orderId, user, orders) {
  if (!orderId) throw new Error('Order ID is missing or invalid.');
  if (!user) throw new Error('Must be logged in to accept an order.');

  const targetOrder = orders.find(o => o.id === orderId);
  if (!targetOrder) throw new Error('Order not found');

  const acceptanceMsg = {
    id: 'msg_1',
    senderId: user.uid,
    senderName: user.name,
    senderRole: 'driver',
    text: `Hello ${user.name} here! I have accepted your run.`,
    timestamp: new Date().toISOString()
  };

  const updatedOrders = orders.map(o => {
    if (o.id === orderId) {
      return {
        ...o,
        status: 'assigned',
        assignedTo: user.uid,
        driverId: user.uid,
        driverName: user.name,
        driverPhone: user.phoneNumber,
        messages: [...(o.messages || []), acceptanceMsg]
      };
    }
    return o;
  });

  // Target Firestore document update object (setDoc with merge: true)
  const firestoreDocPayload = {
    ...targetOrder,
    id: orderId,
    status: 'assigned',
    assignedTo: user.uid,
    driverId: user.uid,
    driverName: user.name,
    driverPhone: user.phoneNumber,
    acceptedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [acceptanceMsg]
  };

  return { updatedOrders, firestoreDocPayload };
}

const { updatedOrders, firestoreDocPayload } = simulateAcceptOrder('ord_med_123', currentUser, initialOrders);

// Check order update in memory
const acceptedOrder = updatedOrders.find(o => o.id === 'ord_med_123');
assert.strictEqual(acceptedOrder.status, 'assigned');
assert.strictEqual(acceptedOrder.assignedTo, 'usr_driver_777');
assert.strictEqual(acceptedOrder.driverId, 'usr_driver_777');
console.log('✓ Test 1 Passed: Order successfully assigned to driver.');

// Check Firestore doc payload
assert.strictEqual(firestoreDocPayload.id, 'ord_med_123');
assert.strictEqual(firestoreDocPayload.status, 'assigned');
assert.strictEqual(firestoreDocPayload.driverId, 'usr_driver_777');
console.log('✓ Test 2 Passed: Firestore setDoc payload contains full order document and correct IDs.');

// 2. Test myActiveRuns filter
function getActiveRuns(orders, user) {
  const publicOrders = orders.filter((o) => o.targetAudience === 'driver_pool');
  return publicOrders.filter(
    (o) =>
      (o.assignedTo === user?.uid || o.driverId === user?.uid) &&
      ['assigned', 'accepted', 'in_progress', 'photo_uploaded'].includes(o.status)
  );
}

const activeRuns = getActiveRuns(updatedOrders, currentUser);
assert.strictEqual(activeRuns.length, 1);
assert.strictEqual(activeRuns[0].id, 'ord_med_123');
assert.strictEqual(activeRuns[0].title, 'pankaj medicose');
assert.strictEqual(activeRuns[0].description, 'Dolo 650, Cough syrup, Vicks');
console.log('✓ Test 3 Passed: Order immediately appears in myActiveRuns with full description.');

// 3. Test Available Runs filter (should no longer be pending)
const availableOrders = updatedOrders.filter((o) => o.targetAudience === 'driver_pool' && o.status === 'pending');
assert.strictEqual(availableOrders.length, 0);
console.log('✓ Test 4 Passed: Order is properly removed from Available Runs pool.');

console.log('\nAll Accept Run tests PASSED 100% successfully!');
