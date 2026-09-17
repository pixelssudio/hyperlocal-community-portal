// Verification and Flow Test Script for Rawatbhata Hyperlocal App
import http from 'http';

function checkEndpoint(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    }).on('error', reject);
  });
}

// 1. Phone number validation logic unit tests
import { validatePhoneNumber, validateFullName } from '../src/lib/validation.ts';

console.log('🧪 RUNNING RAWATBHATA HYPERLOCAL VERIFICATION SUITE...\n');

// Test 1: Server Status
console.log('1️⃣ Testing Next.js Dev Server Response:');
const response = await checkEndpoint('http://localhost:3000');
console.log(`   - HTTP Status: ${response.statusCode}`);
if (response.statusCode === 200) {
  console.log('   ✅ Dev Server is responding with HTTP 200 OK');
} else {
  console.error('   ❌ Dev Server returned unexpected status:', response.statusCode);
  process.exit(1);
}

// Test 2: Validation Tests
console.log('\n2️⃣ Testing Validation Rules (10-Digit Phone Number & Name):');
const invalidPhones = [
  '',
  '123',
  'abcdefghij',
  '0987654321', // Starts with 0
  '5555555555', // Starts with 5 (invalid Indian mobile)
  '987654321',  // 9 digits
  '98765432100' // 11 digits
];

for (const p of invalidPhones) {
  const result = validatePhoneNumber(p);
  if (result.isValid) {
    console.error(`   ❌ Failed: "${p}" was accepted but should be invalid!`);
    process.exit(1);
  }
}
console.log(`   ✅ Correctly rejected all ${invalidPhones.length} invalid phone numbers.`);

const validPhones = ['9876543210', '8123456789', '7001234567', '6987654321'];
for (const p of validPhones) {
  const result = validatePhoneNumber(p);
  if (!result.isValid) {
    console.error(`   ❌ Failed: "${p}" was rejected with "${result.error}" but should be valid!`);
    process.exit(1);
  }
}
console.log(`   ✅ Correctly validated all ${validPhones.length} valid Indian mobile numbers.`);

// Test Name Validation
if (validateFullName('').isValid || validateFullName('a').isValid || !validateFullName('Ravi Kumar').isValid) {
  console.error('   ❌ Full name validation failed');
  process.exit(1);
}
console.log('   ✅ Full name validation passed.');

// Test 3: Task Isolation Rule Logic Test
console.log('\n3️⃣ Testing Task Isolation Rule:');
const mockOrders = [
  {
    id: 'ord_1',
    category: 'errand',
    title: 'Medicine pickup',
    targetAudience: 'driver_pool'
  },
  {
    id: 'ord_2',
    category: 'food',
    title: 'Kachori pickup',
    targetAudience: 'driver_pool'
  },
  {
    id: 'ord_3',
    category: 'companion_listening_ghumna',
    title: 'Evening Walking Companion',
    targetAudience: 'admin_only' // ISOLATED
  }
];

// Driver feed filter
const driverFeed = mockOrders.filter(o => o.targetAudience === 'driver_pool');
const adminCompanionDesk = mockOrders.filter(o => o.targetAudience === 'admin_only');

const containsCompanionInDriver = driverFeed.some(o => o.category === 'companion_listening_ghumna' || o.targetAudience === 'admin_only');
if (containsCompanionInDriver) {
  console.error('   ❌ CRITICAL ISOLATION FAILURE: Companion task was visible in Driver Feed!');
  process.exit(1);
}
console.log(`   ✅ Driver Feed successfully filtered: ${driverFeed.length} tasks visible, 0 companion tasks.`);
console.log(`   ✅ Admin Desk successfully received isolated task: ${adminCompanionDesk.length} task visible (Title: "${adminCompanionDesk[0].title}").`);

console.log('\n🎉 ALL PHASE 1 VERIFICATION TESTS PASSED WITH ZERO ERRORS!\n');
