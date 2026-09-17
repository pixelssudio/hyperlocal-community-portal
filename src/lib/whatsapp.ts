import type { Order } from './types';

/**
 * Normalizes phone numbers to Indian international format: 91XXXXXXXXXX
 */
export function cleanIndianPhoneNumber(phone: string): string {
  if (!phone) return '919829012345';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits || '919829012345';
}

/**
 * Generates an Indian WhatsApp direct link: https://wa.me/91XXXXXXXXXX?text=...
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = cleanIndianPhoneNumber(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

/**
 * Formats a new order dispatch message (Client -> Admin / Support)
 */
export function formatClientOrderWhatsApp(order: Order): string {
  const paymentLabel =
    order.paymentMethod === 'upi_instant'
      ? `Paid Online via UPI ${order.transactionRef ? `(Ref: ${order.transactionRef})` : ''}`
      : 'Cash on Delivery (COD)';

  return `🚀 *RAWATBHATA DIRECT - NEW ORDER DISPATCH*
━━━━━━━━━━━━━━━━━━━━
📦 *Order ID:* #${(order.id || 'NEW').slice(-6).toUpperCase()}
⚡ *Category:* ${order.categoryLabel || order.category || 'General'}
📝 *Task:* ${order.title || 'Errand'}
💬 *Details:* ${order.description || 'Standard errand'}

📍 *Pickup:* ${order.pickupAddress || 'Rawatbhata'}
🎯 *Drop:* ${order.dropAddress || 'Rawatbhata'}

💰 *Amount:* ₹${order.price || 40}
💳 *Payment:* ${paymentLabel}

👤 *Client:* ${order.clientName || 'Client'}
📞 *Contact:* ${order.clientPhone || 'Provided in app'}
━━━━━━━━━━━━━━━━━━━━
🌐 _Dispatched via Rawatbhata Hyperlocal Platform (323303)_`;
}

/**
 * Formats a private companion / listening booking (Client -> Admin Desk strictly)
 */
export function formatCompanionBookingWhatsApp(order: Order): string {
  const paymentLabel =
    order.paymentMethod === 'upi_instant'
      ? `Prepaid via UPI ${order.transactionRef ? `(Ref: ${order.transactionRef})` : ''}`
      : 'Cash on Delivery (COD)';

  return `🔒 *RAWATBHATA DIRECT - PRIVATE COMPANION BOOKING*
━━━━━━━━━━━━━━━━━━━━
🛡️ *Booking Ref:* #${(order.id || 'NEW').slice(-6).toUpperCase()}
🤝 *Service:* Companion / Listening / Ghumna
👤 *Client Name:* ${order.clientName}
📞 *Client Phone:* ${order.clientPhone || 'Verified in App'}

📍 *Meeting Location:* ${order.pickupAddress}
📝 *Notes:* ${order.description}

💰 *Budget:* ₹${order.price}
💳 *Payment Status:* ${paymentLabel}
━━━━━━━━━━━━━━━━━━━━
🔒 _Strict Admin Isolation: Only authorized Admin Personnel coordinate this session._`;
}

/**
 * Formats a driver status update message (Driver -> Client)
 */
export function formatDriverUpdateWhatsApp(order: Order, driverName: string, driverPhone?: string): string {
  const paymentNotice =
    order.paymentMethod === 'cod'
      ? `Please keep ₹${order.price} cash ready upon delivery.`
      : `Prepaid via UPI. No physical cash required.`;

  return `🚴‍♂️ *RAWATBHATA DIRECT - PILOT UPDATE*
━━━━━━━━━━━━━━━━━━━━
Namaste *${order.clientName}*!
Your delivery pilot *${driverName}* is actively handling your order:

📦 *Task:* ${order.title}
📍 *Drop Location:* ${order.dropAddress}
💰 *Payment:* ${paymentNotice}

📞 *Pilot Contact:* ${driverPhone || 'Contact via app'}
━━━━━━━━━━━━━━━━━━━━
✨ _Thank you for supporting local Rawatbhata partners!_`;
}
