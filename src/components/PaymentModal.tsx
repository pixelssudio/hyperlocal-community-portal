'use client';

import React, { useState } from 'react';
import { PaymentMethod, PaymentStatus } from '@/lib/types';
import { triggerRazorpayPayment } from '@/lib/razorpay';
import {
  QrCode,
  Banknote,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  X,
  Sparkles,
  ArrowRight,
  CreditCard,
  Zap
} from 'lucide-react';

interface PaymentModalProps {
  amount: number;
  orderTitle: string;
  orderId?: string;
  user?: {
    name?: string;
    email?: string;
    phoneNumber?: string;
  };
  onSuccess: (paymentInfo: {
    method: PaymentMethod;
    status: PaymentStatus;
    transactionRef?: string;
  }) => void;
  onClose: () => void;
}

export default function PaymentModal({
  amount,
  orderTitle,
  orderId = 'RUN_' + Math.random().toString(36).substring(2, 6).toUpperCase(),
  user,
  onSuccess,
  onClose,
}: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('upi_instant');
  const [utrNumber, setUtrNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingRazorpay, setIsProcessingRazorpay] = useState(false);
  const [copiedVpa, setCopiedVpa] = useState(false);

  const rawatbhataVpa = '9649228281@yescred';
  const upiIntentUri = `upi://pay?pa=${rawatbhataVpa}&pn=Rawatbhata%20Hyperlocal&am=${amount}&cu=INR&tn=${encodeURIComponent(orderTitle.slice(0, 30) || 'Rawatbhata Run')}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiIntentUri)}`;

  const handleCopyVpa = () => {
    navigator.clipboard.writeText(rawatbhataVpa);
    setCopiedVpa(true);
    setTimeout(() => setCopiedVpa(false), 3000);
  };

  const handleLaunchRazorpay = async () => {
    setIsProcessingRazorpay(true);
    try {
      await triggerRazorpayPayment({
        amount,
        orderTitle,
        user,
        onSuccess: (res) => {
          setIsProcessingRazorpay(false);
          onSuccess({
            method: 'razorpay',
            status: 'paid_online',
            transactionRef: res.razorpay_payment_id,
          });
        },
        onDismiss: () => {
          setIsProcessingRazorpay(false);
        },
      });
    } catch (err: any) {
      setIsProcessingRazorpay(false);
      alert(err.message || 'Razorpay payment could not be opened. Falling back to Direct UPI.');
      setSelectedMethod('upi_instant');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMethod === 'razorpay') {
      handleLaunchRazorpay();
      return;
    }

    if (selectedMethod === 'upi_instant') {
      const cleanUtr = utrNumber.trim();
      if (!cleanUtr || cleanUtr.length < 8) {
        alert('Please enter a valid 12-digit UPI UTR / Transaction ID (minimum 8 digits) from your GPay / PhonePe / Paytm receipt.');
        return;
      }
    }

    setIsSubmitting(true);

    setTimeout(() => {
      if (selectedMethod === 'upi_instant') {
        const cleanUtr = utrNumber.trim();
        onSuccess({
          method: 'UPI',
          status: 'pending_verification',
          transactionRef: cleanUtr,
        });
      } else {
        onSuccess({
          method: 'cod',
          status: 'pending',
        });
      }
      setIsSubmitting(false);
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 mb-1 text-amber-300 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Rawatbhata Secure Verified Checkout</span>
          </div>

          <div className="flex items-center justify-between mt-1">
            <div>
              <h3 className="text-xl font-black">{orderTitle}</h3>
              <p className="text-xs text-purple-200 mt-0.5">Automated Gateway & Instant UPI</p>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-purple-200 block font-semibold">Total Fair</span>
              <span className="text-2xl font-black text-amber-400">₹{amount}</span>
            </div>
          </div>
        </div>

        {/* Method Selector Tabs (3 Options) */}
        <div className="grid grid-cols-3 p-2 bg-slate-100 gap-1.5 border-b border-slate-200 text-center">
          <button
            type="button"
            onClick={() => setSelectedMethod('upi_instant')}
            className={`py-2 px-2 rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'upi_instant'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 bg-white/60'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-purple-300" />
            <span>Direct UPI</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMethod('cod')}
            className={`py-2 px-2 rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'cod'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 bg-white/60'
            }`}
          >
            <Banknote className="w-3.5 h-3.5 text-emerald-300" />
            <span>Cash (COD)</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMethod('razorpay')}
            className={`py-2 px-2 rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1.5 ${
              selectedMethod === 'razorpay'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 bg-white/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Razorpay</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {selectedMethod === 'razorpay' ? (
            <div className="space-y-4 text-center">
              <div className="p-5 rounded-3xl bg-gradient-to-br from-purple-50 via-indigo-50 to-purple-100 border-2 border-purple-300 text-center space-y-3 shadow-inner">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-700 text-white flex items-center justify-center shadow-lg shadow-purple-700/30">
                  <CreditCard className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-200 text-purple-900 border border-purple-300">
                    ⚡ 100% Automated & Auto-Verified
                  </span>
                  <h4 className="text-base font-black text-purple-950 mt-1.5">
                    Razorpay Smart Gateway
                  </h4>
                  <p className="text-xs text-purple-800 mt-1 leading-relaxed max-w-xs mx-auto">
                    Pay securely using <strong>GPay, PhonePe, Paytm, Cards, or NetBanking</strong>. Instant automated receipt confirmation with 0 manual UTR typing.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isProcessingRazorpay}
                    onClick={handleLaunchRazorpay}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 hover:from-purple-800 hover:to-indigo-800 active:scale-[0.99] disabled:opacity-50 text-white font-black text-xs shadow-xl shadow-purple-600/30 transition flex items-center justify-center gap-2"
                  >
                    {isProcessingRazorpay ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Opening Razorpay Gateway...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>⚡ Pay ₹{amount} with Razorpay</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-center gap-2 text-slate-500">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span>256-Bit Bank Grade SSL Encryption</span>
              </div>
            </div>
          ) : selectedMethod === 'upi_instant' ? (
            <div className="space-y-4 text-center">
              {/* Dynamic QR Code */}
              <div className="inline-block p-4 rounded-3xl bg-slate-50 border-2 border-purple-200 shadow-inner">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeUrl}
                  alt="UPI Payment QR Code"
                  className="w-44 h-44 mx-auto rounded-xl object-contain shadow"
                />
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-bold text-purple-900">
                  <QrCode className="w-3.5 h-3.5 text-purple-600" />
                  <span>Scan with GPay, PhonePe, Paytm, or BHIM</span>
                </div>
              </div>

              {/* UPI ID Copy Card */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div className="text-left">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">UPI ID / VPA</span>
                  <span className="font-mono font-bold text-slate-800">{rawatbhataVpa}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyVpa}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1 transition"
                >
                  {copiedVpa ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* 1-Click Mobile App Opener */}
              <a
                href={upiIntentUri}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition"
              >
                <Smartphone className="w-4 h-4" />
                <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>

              {/* UTR Input */}
              <div className="text-left pt-1">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  12-Digit Transaction UTR / Ref No. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  placeholder="e.g. 428198273612 (12-digit UTR)"
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-purple-200 text-xs focus:border-purple-600 focus:outline-none font-mono"
                  required
                />
                <p className="text-[10px] text-purple-700 mt-1 font-medium">
                  ⚠️ Type the 12-digit UTR Number from your UPI App receipt for manual verification.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-5 rounded-3xl bg-emerald-50 border-2 border-emerald-200 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Banknote className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-emerald-950">Cash on Delivery (COD) Selected</h4>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    Pay <strong>₹{amount}</strong> in physical cash directly to the driver partner or admin escort when your order is delivered.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1 text-slate-600">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>No Prepayment Needed</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Driver partner will verify item bills and hand over the invoice before collecting cash.
                </p>
              </div>
            </div>
          )}

          {/* Submit Action Button for Non-Razorpay tabs */}
          {selectedMethod !== 'razorpay' && (
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || (selectedMethod === 'upi_instant' && utrNumber.trim().length < 8)}
                className={`w-full py-3.5 px-4 rounded-2xl text-white font-black text-xs shadow-xl transition flex items-center justify-center gap-2 ${
                  selectedMethod === 'upi_instant' && utrNumber.trim().length < 8
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : selectedMethod === 'upi_instant'
                    ? 'bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 shadow-purple-600/25'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Submitting for Verification...</span>
                  </>
                ) : selectedMethod === 'upi_instant' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Submit UTR for Verification (₹{amount})</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Proceed with Cash on Delivery (₹{amount})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
