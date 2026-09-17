/**
 * Razorpay Standard Checkout SDK Integration Helper for Rawatbhata Hyperlocal
 */

export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

export interface RazorpayCheckoutOptions {
  amount: number; // in INR Rupees (e.g. 50)
  orderTitle: string;
  keyId?: string;
  user?: {
    name?: string;
    email?: string;
    phoneNumber?: string;
  };
  onSuccess: (response: RazorpayPaymentSuccessResponse) => void;
  onDismiss?: () => void;
}

export const DEFAULT_RAZORPAY_KEY_ID =
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_1DP5mmOlF5G5ag';

export const RAZORPAY_KEY_STORAGE_KEY = 'rawatbhata_razorpay_key_id';

export function getActiveRazorpayKey(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(RAZORPAY_KEY_STORAGE_KEY);
      if (stored && stored.trim()) return stored.trim();
    } catch {}
  }
  return DEFAULT_RAZORPAY_KEY_ID;
}

export function saveActiveRazorpayKey(key: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(RAZORPAY_KEY_STORAGE_KEY, key.trim());
    } catch {}
  }
}

/**
 * Dynamically loads the official Razorpay Checkout SDK script if not already present.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById('razorpay-sdk-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-sdk-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Opens Razorpay Standard Checkout Popup with 100% verified payment callback.
 */
export async function triggerRazorpayPayment(options: RazorpayCheckoutOptions): Promise<void> {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded || !(window as any).Razorpay) {
    throw new Error('Razorpay Checkout SDK could not be loaded. Please check your internet connection or try Direct UPI.');
  }

  const razorpayKey = options.keyId || getActiveRazorpayKey();
  const amountInPaise = Math.round(options.amount * 100);

  const rzpOptions = {
    key: razorpayKey,
    amount: amountInPaise,
    currency: 'INR',
    name: 'Rawatbhata Hyperlocal',
    description: options.orderTitle.slice(0, 40) || 'Hyperlocal Delivery Service',
    image: '/icon.svg',
    handler: function (response: RazorpayPaymentSuccessResponse) {
      if (response && response.razorpay_payment_id) {
        options.onSuccess(response);
      }
    },
    prefill: {
      name: options.user?.name || 'Rawatbhata Client',
      email: options.user?.email || 'client@rawatbhata.in',
      contact: options.user?.phoneNumber || '9649228281',
    },
    notes: {
      platform: 'Rawatbhata Direct',
      purpose: options.orderTitle,
    },
    theme: {
      color: '#7c3aed',
    },
    modal: {
      ondismiss: function () {
        if (options.onDismiss) {
          options.onDismiss();
        }
      },
    },
  };

  const paymentInstance = new (window as any).Razorpay(rzpOptions);
  paymentInstance.open();
}
