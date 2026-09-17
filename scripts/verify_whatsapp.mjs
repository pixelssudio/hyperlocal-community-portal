import http from 'http';
import {
  cleanIndianPhoneNumber,
  generateWhatsAppLink,
  formatClientOrderWhatsApp,
  formatCompanionBookingWhatsApp,
  formatDriverUpdateWhatsApp
} from '../src/lib/whatsapp.ts';

function checkEndpoint(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    }).on('error', reject);
  });
}

console.log('🧪 RUNNING STEP 3: WHATSAPP ALERT & INSTANT DISPATCH TEST SUITE...\n');

// 1. Dev Server Check
console.log('1️⃣ Dev Server Connectivity Check:');
const devRes = await checkEndpoint('/');
console.log(`   - Dev Server Status: ${devRes.statusCode} OK`);
if (devRes.statusCode !== 200) {
  console.error('   ❌ Dev Server returned unexpected status:', devRes.statusCode);
  process.exit(1);
}

// 2. Testing Phone Normalization
console.log('\n2️⃣ Testing Indian Phone Number Normalization:');
const testNumbers = [
  { raw: '9829012345', expected: '919829012345' },
  { raw: '+91 98290 12345', expected: '919829012345' },
  { raw: '919414088765', expected: '919414088765' }
];

for (const item of testNumbers) {
  const normalized = cleanIndianPhoneNumber(item.raw);
  console.log(`   - Normalized "${item.raw}" ➔ "${normalized}"`);
  if (normalized !== item.expected) {
    console.error(`   ❌ Failed phone normalization for ${item.raw}: expected ${item.expected}, got ${normalized}`);
    process.exit(1);
  }
}
console.log('   ✅ Indian phone numbers normalized cleanly to 91XXXXXXXXXX format.');

// 3. Testing Client Order Dispatch Template
console.log('\n3️⃣ Testing Client Order Dispatch WhatsApp Message:');
const sampleOrder = {
  id: 'ord_wa_101',
  clientName: 'Priya Sharma',
  clientPhone: '9876543210',
  category: 'food',
  categoryLabel: 'Local Food & Dhaba Orders',
  title: '2 Plates Pyaz Kachori',
  description: 'Hot spicy kachori with sweet tamarind chutney',
  pickupAddress: 'Main Bazar Sweets, Rawatbhata',
  dropAddress: 'Sector-2 Colony, Rawatbhata',
  price: 65,
  status: 'pending',
  targetAudience: 'driver_pool',
  paymentMethod: 'upi_instant',
  paymentStatus: 'paid_online',
  transactionRef: 'UTR_7788990011',
  createdAt: new Date().toISOString()
};

const clientMsg = formatClientOrderWhatsApp(sampleOrder);
const clientLink = generateWhatsAppLink('9829012345', clientMsg);

console.log('   - Formatted Order Message Preview:');
console.log(clientMsg.split('\n').map(l => '     ' + l).join('\n'));
console.log(`\n   - Generated WhatsApp Link:\n     "${clientLink.slice(0, 80)}..."`);

if (
  !clientLink.startsWith('https://wa.me/919829012345?text=') ||
  !clientMsg.includes('Pyaz Kachori') ||
  !clientMsg.includes('₹65') ||
  !clientMsg.includes('UTR_7788990011')
) {
  console.error('   ❌ Client order WhatsApp message assertion failed!');
  process.exit(1);
}
console.log('   ✅ Client order dispatch template verified.');

// 4. Testing Private Companion Booking Template
console.log('\n4️⃣ Testing Private Companion Booking WhatsApp Message (Admin Isolated):');
const companionOrder = {
  id: 'ord_comp_wa_202',
  clientName: 'Smt. Shanti Devi',
  clientPhone: '9414001122',
  category: 'companion_listening_ghumna',
  categoryLabel: 'Companion / Listening / Ghumna',
  title: 'Evening Lake Walk Companion',
  description: 'Walking partner near Rana Pratap Sagar Lake',
  pickupAddress: 'RPS Lake Viewpoint',
  dropAddress: 'RPS Lake Viewpoint',
  price: 150,
  status: 'pending',
  targetAudience: 'admin_only',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  createdAt: new Date().toISOString()
};

const companionMsg = formatCompanionBookingWhatsApp(companionOrder);
const companionLink = generateWhatsAppLink('919829012345', companionMsg);

console.log('   - Formatted Companion Message Preview:');
console.log(companionMsg.split('\n').map(l => '     ' + l).join('\n'));
console.log(`\n   - Generated Companion WhatsApp Link:\n     "${companionLink.slice(0, 80)}..."`);

if (
  !companionMsg.includes('PRIVATE COMPANION BOOKING') ||
  !companionMsg.includes('Smt. Shanti Devi') ||
  !companionMsg.includes('Admin Isolation')
) {
  console.error('   ❌ Companion booking WhatsApp message assertion failed!');
  process.exit(1);
}
console.log('   ✅ Private companion booking template verified.');

// 5. Testing Driver Status Update Template
console.log('\n5️⃣ Testing Driver Update WhatsApp Message:');
const driverUpdateMsg = formatDriverUpdateWhatsApp(sampleOrder, 'Rajesh Meena', '9829012345');
const driverLink = generateWhatsAppLink(sampleOrder.clientPhone, driverUpdateMsg);

console.log('   - Formatted Driver Update Preview:');
console.log(driverUpdateMsg.split('\n').map(l => '     ' + l).join('\n'));
console.log(`\n   - Generated Driver Update WhatsApp Link:\n     "${driverLink.slice(0, 80)}..."`);

if (
  !driverUpdateMsg.includes('PILOT UPDATE') ||
  !driverUpdateMsg.includes('Rajesh Meena') ||
  !driverLink.startsWith('https://wa.me/919876543210?text=')
) {
  console.error('   ❌ Driver update WhatsApp message assertion failed!');
  process.exit(1);
}
console.log('   ✅ Driver delivery update template verified.');

console.log('\n🎉 ALL WHATSAPP ALERT & INSTANT DISPATCH TESTS PASSED WITH ZERO ERRORS!\n');
