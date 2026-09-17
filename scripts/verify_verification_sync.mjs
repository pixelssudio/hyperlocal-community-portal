import assert from 'assert';

console.log('--- Starting Driver Verification Sync Verification Suite ---');

// Test 1: Verification Flag Logic Matching
function checkDriverVerification(user, driverRecord) {
  return Boolean(
    user?.isDriverVerified === true ||
    user?.isVerified === true ||
    user?.status === 'approved' ||
    user?.verified === true ||
    driverRecord?.isVerified === true ||
    driverRecord?.isDriverVerified === true ||
    driverRecord?.status === 'approved' ||
    driverRecord?.verified === true
  );
}

// Case 1A: Newly applied driver (unverified)
const unverifiedUser = {
  uid: 'usr_new_1',
  role: 'driver',
  isDriverVerified: false,
  isVerified: false,
  status: 'pending',
  verified: false
};
const unverifiedRecord = {
  id: 'usr_new_1',
  isVerified: false,
  isDriverVerified: false,
  status: 'pending',
  verified: false
};
assert.strictEqual(checkDriverVerification(unverifiedUser, unverifiedRecord), false, 'New driver should be unverified');
console.log('✓ Case 1A Passed: Unverified driver is strictly locked.');

// Case 1B: Admin verifies in drivers collection
const adminVerifiedRecord = {
  id: 'usr_new_1',
  isVerified: true,
  isDriverVerified: true,
  status: 'approved',
  verified: true
};
assert.strictEqual(checkDriverVerification(unverifiedUser, adminVerifiedRecord), true, 'Driver record verification unlocks instantly');
console.log('✓ Case 1B Passed: Real-time driver collection change unlocks user immediately.');

// Case 1C: User doc updated in users collection
const adminVerifiedUser = {
  uid: 'usr_new_1',
  role: 'driver',
  isDriverVerified: true,
  isVerified: true,
  status: 'approved',
  verified: true
};
assert.strictEqual(checkDriverVerification(adminVerifiedUser, unverifiedRecord), true, 'User doc verification unlocks instantly');
console.log('✓ Case 1C Passed: Real-time users collection change unlocks user immediately.');

// Case 1D: Legacy status: "approved"
const legacyStatusUser = {
  uid: 'usr_new_1',
  role: 'driver',
  status: 'approved'
};
assert.strictEqual(checkDriverVerification(legacyStatusUser, null), true, 'Status approved matches verification');
console.log('✓ Case 1D Passed: Legacy status approved accurately recognized.');

// Test 2: Button Text and State Check
function getButtonState(isVerified) {
  if (isVerified) {
    return { text: 'Accept Run', disabled: false, icon: 'CheckCircle2' };
  } else {
    return { text: 'Verification Required', disabled: true, icon: 'Lock' };
  }
}

const verifiedBtn = getButtonState(true);
assert.strictEqual(verifiedBtn.text, 'Accept Run');
assert.strictEqual(verifiedBtn.disabled, false);

const unverifiedBtn = getButtonState(false);
assert.strictEqual(unverifiedBtn.text, 'Verification Required');
assert.strictEqual(unverifiedBtn.disabled, true);
console.log('✓ Test 2 Passed: Button state & label toggle correctly between verified and unverified.');

// Test 3: Instant Unlock Fallback on Role Switch
function simulateRoleSwitch(currentUser, targetRole, driverPartners) {
  const matched = driverPartners.find(d => d.id === currentUser.uid);
  const isAlreadyVerified = Boolean(
    currentUser.isDriverVerified === true ||
    currentUser.isVerified === true ||
    currentUser.status === 'approved' ||
    currentUser.verified === true ||
    matched?.isVerified === true ||
    matched?.status === 'approved'
  );

  return {
    ...currentUser,
    role: targetRole,
    isDriverVerified: isAlreadyVerified || (currentUser.isDriverVerified ?? false),
    isVerified: isAlreadyVerified || (currentUser.isVerified ?? false),
    status: isAlreadyVerified ? 'approved' : (currentUser.status || 'pending'),
    verified: isAlreadyVerified || (currentUser.verified ?? false),
  };
}

const clientWithVerifiedDriverRecord = {
  uid: 'drv_rajesh_99',
  role: 'client',
  name: 'Rajesh Meena'
};
const driversList = [
  { id: 'drv_rajesh_99', isVerified: true, status: 'approved' }
];

const switchedUser = simulateRoleSwitch(clientWithVerifiedDriverRecord, 'driver', driversList);
assert.strictEqual(switchedUser.role, 'driver');
assert.strictEqual(switchedUser.isDriverVerified, true);
assert.strictEqual(switchedUser.isVerified, true);
console.log('✓ Test 3 Passed: Instant unlock fallback automatically restores verified state on role switch.');

console.log('\nAll Driver Verification Sync tests PASSED 100% successfully!');
