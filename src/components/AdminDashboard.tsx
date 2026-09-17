'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order, OrderCategory, PLATFORM_COMMISSION_FEE, SystemNotification, DriverPayoutSummary } from '@/lib/types';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import LiveChatModal from '@/components/LiveChatModal';
import { parseVehicleInfo, formatVehiclePlate } from '@/lib/validation';
import { getActiveRazorpayKey, saveActiveRazorpayKey } from '@/lib/razorpay';
import { playNotificationSound, sendBrowserPushNotification, requestBrowserNotificationPermission, unlockAudioContext } from '@/lib/audio';
import { generateWhatsAppLink, formatCompanionBookingWhatsApp, formatClientOrderWhatsApp } from '@/lib/whatsapp';
import {
  Crown,
  ShieldCheck,
  HeartHandshake,
  Bike,
  DollarSign,
  Phone,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Settings,
  TrendingUp,
  Layers,
  Sparkles,
  UserCheck,
  UserX,
  MapPin,
  Clock,
  Radio,
  QrCode,
  Banknote,
  Trash2,
  Megaphone,
  Send,
  Users,
  Bell,
  Ban,
  ShieldAlert,
  Wallet,
  CreditCard,
  ExternalLink,
  Receipt,
  Copy,
  Check,
  Calendar,
  X
} from 'lucide-react';

const CATEGORY_META: { [key in OrderCategory]: { name: string; description: string; icon: string } } = {
  errand: {
    name: 'Instant Errands & Medicines',
    description: 'Medical store runs, urgent document drop, household chore pickups',
    icon: '⚡',
  },
  food: {
    name: 'Local Food & Dhaba Orders',
    description: 'Tea stalls, sweets shops, snacks, and restaurant takeaways',
    icon: '🍲',
  },
  delivery: {
    name: 'Market Parcel & Kirana',
    description: 'Heavy grocery, bazaar shopping, parcels, and local logistics',
    icon: '📦',
  },
  ride: {
    name: 'Local Cab & Bike Taxi',
    description: 'Point-to-point commute between Rawatbhata colonies & plant gates',
    icon: '🚖',
  },
  companion_listening_ghumna: {
    name: 'Companion / Listening / Ghumna',
    description: 'Strictly isolated private walking partner, listener, or senior escort',
    icon: '🤝',
  },
};

export default function AdminDashboard() {
  const {
    user,
    orders,
    servicePrices,
    updateServicePrice,
    driverPartners,
    approveDriver,
    blockDriver,
    deleteDriver,
    sendBroadcastNotification,
    deleteBroadcastNotification,
    clearAllBroadcastNotifications,
    toggleDriverVerification,
    adminAcceptCompanionOrder,
    settleDriverPayout,
    supportWhatsAppNumber,
    updateSupportWhatsAppNumber,
    deleteOrder,
    clearAllOrders,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'companion' | 'fleet' | 'payouts' | 'broadcast' | 'pricing' | 'orders'>('companion');
  const [selectedChatOrder, setSelectedChatOrder] = useState<Order | null>(null);
  const [settlingDriverId, setSettlingDriverId] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState<string | null>(null);

  // Broadcast Messaging State
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'drivers' | 'clients'>('all');
  const [broadcastText, setBroadcastText] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [previewBroadcastModal, setPreviewBroadcastModal] = useState<SystemNotification | null>(null);
  const [broadcastHistory, setBroadcastHistory] = useState<SystemNotification[]>([]);

  // Local Editable State
  const [editPrices, setEditPrices] = useState<{ [key in OrderCategory]: number }>(servicePrices);
  const [editWhatsAppNumber, setEditWhatsAppNumber] = useState<string>(supportWhatsAppNumber);
  const [editRazorpayKey, setEditRazorpayKey] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    setEditRazorpayKey(getActiveRazorpayKey());
  }, []);

  useEffect(() => {
    if (servicePrices) {
      setEditPrices(servicePrices);
    }
  }, [servicePrices]);

  useEffect(() => {
    if (supportWhatsAppNumber) {
      setEditWhatsAppNumber(supportWhatsAppNumber);
    }
  }, [supportWhatsAppNumber]);

  // Real-time Firestore Listener for Broadcast History
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const notifsRef = collection(db, 'system_notifications');
    const q = query(notifsRef);
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: SystemNotification[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as Omit<SystemNotification, 'id'>) });
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setBroadcastHistory(list);
      },
      (err) => {
        console.warn('Notification history listener notice:', err);
      }
    );

    return () => unsub();
  }, []);

  // Admin Reactive Orders Watcher: Alerts for New Orders, Companion Bookings & Deliveries
  const prevAdminOrdersRef = useRef<Map<string, string>>(new Map());
  const isInitialAdminLoad = useRef(true);

  useEffect(() => {
    if (isInitialAdminLoad.current) {
      const initMap = new Map<string, string>();
      orders.forEach((o) => initMap.set(o.id, o.status));
      prevAdminOrdersRef.current = initMap;
      isInitialAdminLoad.current = false;
      return;
    }

    const prevMap = prevAdminOrdersRef.current;
    const newOrders = orders.filter((o) => !prevMap.has(o.id));

    // 1. New Orders Created
    newOrders.forEach((o) => {
      if (o.targetAudience === 'admin_only') {
        playNotificationSound('companion_alert');
        showToast(`🚨 New Private Companion Request: ₹${o.price} from ${o.clientName || 'Client'}!`);
        sendBrowserPushNotification('🚨 New Companion Request', `Private Companion session requested for ₹${o.price}`);
      } else {
        playNotificationSound('order_created');
        showToast(`📦 New Order Dispatched: ₹${o.price} • ${o.title} (${o.pickupAddress})`);
        sendBrowserPushNotification('📦 New Order Dispatched', `₹${o.price} • ${o.title}`);
      }
    });

    // 2. Status Updates on Existing Orders
    orders.forEach((ord) => {
      const prevStatus = prevMap.get(ord.id);
      if (prevStatus && prevStatus !== ord.status) {
        if (ord.status === 'assigned' || ord.status === 'in_progress') {
          showToast(`🛵 Order ${ord.title} assigned to driver ${ord.driverName || 'Partner'}`);
        } else if (ord.status === 'completed') {
          playNotificationSound('order_completed');
          showToast(`✅ Order ${ord.title} completed & delivered (₹5 platform commission logged)`);
        }
      }
    });

    const nextMap = new Map<string, string>();
    orders.forEach((o) => nextMap.set(o.id, o.status));
    prevAdminOrdersRef.current = nextMap;
  }, [orders]);

  // Admin Reactive Chat Messages Watcher across all orders
  const prevAdminMsgCountsRef = useRef<Map<string, number>>(new Map());
  const isInitialAdminMsgLoad = useRef(true);

  useEffect(() => {
    if (isInitialAdminMsgLoad.current) {
      const initMap = new Map<string, number>();
      orders.forEach((o) => initMap.set(o.id, o.messages?.length || 0));
      prevAdminMsgCountsRef.current = initMap;
      isInitialAdminMsgLoad.current = false;
      return;
    }

    const prevMap = prevAdminMsgCountsRef.current;
    orders.forEach((ord) => {
      const prevCount = prevMap.get(ord.id) || 0;
      const currentCount = ord.messages?.length || 0;
      if (currentCount > prevCount && ord.messages) {
        const latestMsg = ord.messages[currentCount - 1];
        if (latestMsg && latestMsg.senderId !== user?.uid && latestMsg.senderRole !== 'admin') {
          playNotificationSound('bell');
          const senderLabel = latestMsg.senderRole === 'driver' ? `Driver (${ord.driverName || 'Partner'})` : `Client (${ord.clientName || 'User'})`;
          showToast(`💬 ${senderLabel} on "${ord.title}": "${latestMsg.text}"`);
          sendBrowserPushNotification(`💬 Message on ${ord.title}`, `${senderLabel}: ${latestMsg.text}`);
        }
      }
    });

    const nextMap = new Map<string, number>();
    orders.forEach((o) => nextMap.set(o.id, o.messages?.length || 0));
    prevAdminMsgCountsRef.current = nextMap;
  }, [orders, user?.uid]);

  // Filter Isolated Companion Requests
  const companionOrders = orders.filter((o) => o.targetAudience === 'admin_only');
  const standardOrders = orders.filter((o) => o.targetAudience === 'driver_pool');
  const totalVolume = orders.reduce((sum, o) => sum + (o.price || 0), 0);
  const totalCompletedRuns = orders.filter((o) => o.status === 'completed').length;
  const platformRevenue = totalCompletedRuns * PLATFORM_COMMISSION_FEE;
  const onlineDriversCount = driverPartners.filter((d) => d.isOnline).length;

  // Driver Weekly Payout Ledger Calculations
  const driverPayoutSummaries: DriverPayoutSummary[] = useMemo(() => {
    return driverPartners.map((drv) => {
      const driverCompletedOrders = orders.filter(
        (o) => o.status === 'completed' && (o.assignedTo === drv.id || o.driverId === drv.id)
      );

      let grossOrderValue = 0;
      let platformFeeTotal = 0;
      let driverGrossEarnings = 0;
      let cashOrdersCount = 0;
      let cashCollectedByDriver = 0;
      let cashPlatformFeeOwed = 0;
      let onlineOrdersCount = 0;
      let onlinePaidToAdmin = 0;
      let onlineEarningsOwedToDriver = 0;

      driverCompletedOrders.forEach((o) => {
        const orderPrice = Number(o.price) || 50;
        const fee = PLATFORM_COMMISSION_FEE; // Flat ₹5
        const netDriver = Math.max(0, orderPrice - fee);

        grossOrderValue += orderPrice;
        platformFeeTotal += fee;
        driverGrossEarnings += netDriver;

        const isOnline =
          o.paymentMethod === 'upi_instant' ||
          o.paymentMethod === 'UPI' ||
          o.paymentStatus === 'paid_online';

        if (isOnline) {
          onlineOrdersCount += 1;
          onlinePaidToAdmin += orderPrice;
          onlineEarningsOwedToDriver += netDriver;
        } else {
          // Cash on Delivery
          cashOrdersCount += 1;
          cashCollectedByDriver += orderPrice;
          cashPlatformFeeOwed += fee;
        }
      });

      const netWeeklyPayoutDue = onlineEarningsOwedToDriver - cashPlatformFeeOwed;

      return {
        driverId: drv.id,
        driverName: drv.name,
        driverPhone: drv.phone,
        driverPhoto: drv.photoURL,
        vehicleType: drv.vehicleType,
        vehicleNumber: drv.vehicleNumber,
        payoutUpiId: drv.payoutUpiId,
        totalCompletedRuns: driverCompletedOrders.length,
        grossOrderValue,
        platformFeeTotal,
        driverGrossEarnings,
        cashOrdersCount,
        cashCollectedByDriver,
        cashPlatformFeeOwed,
        onlineOrdersCount,
        onlinePaidToAdmin,
        onlineEarningsOwedToDriver,
        netWeeklyPayoutDue,
        lastSettledAt: (drv as any).lastSettledAt,
      };
    });
  }, [driverPartners, orders]);

  const totalNetPayoutsDue = driverPayoutSummaries.reduce((sum, d) => sum + Math.max(0, d.netWeeklyPayoutDue), 0);
  const totalCashPlatformFeesDue = driverPayoutSummaries.reduce(
    (sum, d) => sum + (d.netWeeklyPayoutDue < 0 ? Math.abs(d.netWeeklyPayoutDue) : 0),
    0
  );

  const handleSettlePayout = async (summary: DriverPayoutSummary) => {
    if (!summary.payoutUpiId) {
      showToast(`⚠️ Driver ${summary.driverName} has not registered their Payout UPI ID yet!`);
      alert(`Payout UPI ID Missing: ${summary.driverName} needs to enter their UPI ID in Driver Portal.`);
      return;
    }

    const confirmMsg = `Confirm Weekly Settlement for ${summary.driverName}:\n\n• Net Amount: ₹${summary.netWeeklyPayoutDue}\n• Target UPI: ${summary.payoutUpiId}\n• Completed Runs: ${summary.totalCompletedRuns}\n\nHave you transferred the amount via UPI? Click OK to record settlement in Rawatbhata database.`;
    if (!confirm(confirmMsg)) return;

    setSettlingDriverId(summary.driverId);
    try {
      await settleDriverPayout({
        driverId: summary.driverId,
        driverName: summary.driverName,
        payoutUpiId: summary.payoutUpiId,
        amount: Math.max(0, summary.netWeeklyPayoutDue),
        completedRunsCount: summary.totalCompletedRuns,
        paymentRef: `SETTLE_UPI_${Date.now().toString(36).toUpperCase()}`,
      });
      showToast(`✅ Weekly payout of ₹${summary.netWeeklyPayoutDue} settled for ${summary.driverName}!`);
    } catch (err: any) {
      showToast(`❌ Settlement failed: ${err.message || 'Error'}`);
    } finally {
      setSettlingDriverId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUpi(id);
    showToast(`📋 Copied UPI ID "${text}" to clipboard!`);
    setTimeout(() => setCopiedUpi(null), 2500);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handlePriceSave = async (category: OrderCategory) => {
    const newRate = editPrices[category];
    await updateServicePrice(category, newRate);
    showToast(`✅ Baseline rate for ${CATEGORY_META[category].name} updated to ₹${newRate}!`);
  };

  const handleWhatsAppSave = async () => {
    await updateSupportWhatsAppNumber(editWhatsAppNumber);
    showToast(`✅ Support WhatsApp Number updated to +${editWhatsAppNumber}!`);
  };

  const handleSendUnifiedBroadcast = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!broadcastText.trim()) return;

    setIsSendingBroadcast(true);
    try {
      await sendBroadcastNotification(broadcastTarget, broadcastText.trim());
      playNotificationSound('companion_alert');
      showToast(`📢 Announcement successfully dispatched to ${broadcastTarget === 'all' ? 'ALL Clients & Drivers' : broadcastTarget === 'drivers' ? 'All Drivers' : 'All Clients'} in Rawatbhata!`);
      setBroadcastText('');
    } catch (err: any) {
      showToast('❌ Failed to send broadcast: ' + (err.message || 'Error'));
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const handleTestAlertOnScreen = () => {
    playNotificationSound('companion_alert');
    setPreviewBroadcastModal({
      id: 'test_preview_' + Date.now(),
      target: broadcastTarget,
      text: broadcastText.trim() || '⚡ TEST ALERT: Rawatbhata Hyperlocal Direct Notification Test! Audio chime and alert box are working perfectly.',
      senderName: user?.name || 'Pankaj Kalosiya (Admin Desk)',
      createdAt: new Date().toISOString(),
    });
    sendBrowserPushNotification('📢 Rawatbhata Admin Notice (Test)', broadcastText.trim() || 'Live notification test successful.');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200">
          <div className="p-1 rounded-lg bg-purple-500/20 text-purple-300 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold">{toastMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin Hero Console */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-purple-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500 text-[10px] font-black uppercase tracking-wider text-slate-950">
                Master Control Console
              </span>
              <span className="flex items-center gap-1 text-xs text-purple-300">
                <Crown className="w-3.5 h-3.5 text-amber-400" /> Super Admin Authorization
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Rawatbhata Direct Admin Hub</h1>
            <p className="text-xs text-purple-200 mt-1 max-w-xl">
              Oversee isolated companion requests, fleet approvals & blocking, live broadcasts to drivers & clients, pricing calibration, and database orders.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="px-4 py-2 rounded-xl bg-purple-800 hover:bg-purple-700 text-white text-xs font-bold transition shadow flex items-center gap-1.5 border border-purple-600/40"
            >
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Orders Database ({orders.length})</span>
            </button>
          </div>
        </div>

        {/* Global Statistics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-5 border-t border-purple-800/50">
          <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-purple-300 block">Isolated Tasks</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400">{companionOrders.length}</span>
          </div>
          <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-300 block">Active Drivers</span>
            <span className="text-xl sm:text-2xl font-black text-white">
              {onlineDriversCount} / {driverPartners.length}
            </span>
          </div>
          <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-blue-300 block">Total Orders</span>
            <span className="text-xl sm:text-2xl font-black text-white">{orders.length}</span>
          </div>
          <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-300 block">Gross GMV</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400">₹{totalVolume}</span>
          </div>
          <div className="bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/30 text-center col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-emerald-300 block">Platform Revenue</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-300">₹{platformRevenue}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('companion')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'companion'
              ? 'bg-purple-900 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <HeartHandshake className="w-4 h-4 text-purple-400" />
          <span>🔒 Companion Desk ({companionOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('fleet')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'fleet'
              ? 'bg-purple-900 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Bike className="w-4 h-4 text-emerald-400" />
          <span>🛵 Fleet Management ({driverPartners.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'payouts'
              ? 'bg-purple-900 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Wallet className="w-4 h-4 text-amber-400" />
          <span>💰 Driver Weekly Payouts ({driverPartners.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('broadcast')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'broadcast'
              ? 'bg-purple-900 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Megaphone className="w-4 h-4 text-amber-400" />
          <span>📢 Broadcast Messages</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pricing')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'pricing'
              ? 'bg-purple-900 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <DollarSign className="w-4 h-4 text-amber-400" />
          <span>Pricing & Rates Control</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-purple-900 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Layers className="w-4 h-4 text-sky-400" />
          <span>📋 Database & Orders ({orders.length})</span>
        </button>
      </div>

      {/* 1. COMPANION & LISTENING ISOLATED DESK */}
      {activeTab === 'companion' && (
        <section className="space-y-4">
          <div className="p-4 rounded-2xl bg-purple-50 border-2 border-purple-200 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-purple-700 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-purple-900 leading-relaxed">
              <strong>Strict Isolation Guarantee Active:</strong> These requests are hidden from all delivery drivers and mobile partner feeds. As Admin, you can directly coordinate with the client, call them, or personally assign verified accompaniment.
            </div>
          </div>

          {companionOrders.length === 0 ? (
            <div className="p-12 rounded-3xl bg-white border-2 border-dashed border-purple-200 text-center space-y-2">
              <HeartHandshake className="w-12 h-12 mx-auto text-purple-300" />
              <h3 className="text-sm font-bold text-slate-800">No companion requests pending</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                When clients request walking companions, empathetic listening, or town escort services, they route directly to this desk.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companionOrders.map((ord) => {
                const isAssigned = ord.status === 'assigned';
                const isPaidOnline = ord.paymentStatus === 'paid_online';
                return (
                  <div
                    key={ord.id}
                    className="p-6 rounded-3xl bg-white border-2 border-purple-300 shadow-md space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                            {ord.categoryLabel}
                          </span>
                          {isPaidOnline ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                              <QrCode className="w-3 h-3 text-emerald-600" /> Paid UPI
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                              <Banknote className="w-3 h-3 text-amber-600" /> COD ₹{ord.price}
                            </span>
                          )}
                        </div>
                        <span className="text-base font-black text-purple-900">₹{ord.price}</span>
                      </div>

                      <h3 className="text-sm font-extrabold text-slate-900">{ord.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                        {ord.description}
                      </p>

                      <div className="text-xs space-y-1 text-slate-600">
                        <p>📍 <strong>Meeting Point:</strong> {ord.pickupAddress}</p>
                        <p>👤 <strong>Client Name:</strong> {ord.clientName}</p>
                        <p>📞 <strong>Phone:</strong> {ord.clientPhone || 'Verified in profile'}</p>
                        {ord.transactionRef && (
                          <p className="text-[11px] text-purple-800 font-mono">
                            💳 <strong>UPI Ref:</strong> {ord.transactionRef}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400">
                          🕒 Requested: {new Date(ord.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Admin Actions */}
                    <div className="pt-3 border-t border-purple-100 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={`tel:${ord.clientPhone || '9876543210'}`}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Phone className="w-3.5 h-3.5 text-amber-400" />
                          <span>Call</span>
                        </a>

                        <a
                          href={generateWhatsAppLink(ord.clientPhone || '9876543210', formatCompanionBookingWhatsApp(ord))}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                          title="Open WhatsApp coordination with client"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-200" />
                          <span>WhatsApp</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => setSelectedChatOrder(ord)}
                          className="flex-1 px-3 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold transition flex items-center justify-center gap-1.5"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Chat ({ord.messages?.length || 0})</span>
                        </button>
                      </div>

                      {!isAssigned ? (
                        <button
                          type="button"
                          onClick={() => {
                            adminAcceptCompanionOrder(ord.id);
                            showToast(`🔒 Companion task locked and assigned to Admin Desk!`);
                          }}
                          className="w-full py-2.5 px-3 rounded-xl bg-purple-700 hover:bg-purple-800 active:scale-[0.99] text-white text-xs font-bold transition shadow-md shadow-purple-700/20 flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Accept & Manage Directly as Admin</span>
                        </button>
                      ) : (
                        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-xs text-emerald-800 font-bold">
                          ✓ Managed Directly by Admin Desk ({ord.driverName})
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 2. FLEET MANAGEMENT (APPROVE / BLOCK / DELETE DRIVER) */}
      {activeTab === 'fleet' && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-slate-900">Fleet Management & Driver Approval</h2>
              <p className="text-xs text-slate-500">Approve new partner registrations, block suspended drivers, and manage active vehicles</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">
                {onlineDriversCount} Online Now
              </span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-800">
                {driverPartners.length} Total Fleet
              </span>
            </div>
          </div>

          {driverPartners.length === 0 ? (
            <div className="p-12 rounded-3xl bg-white border-2 border-dashed border-slate-200 text-center space-y-2">
              <Bike className="w-12 h-12 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-800">No driver partners registered yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                When riders register as Driver Partners, their profiles and vehicle details will appear here for Admin verification and approval.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {driverPartners.map((drv) => {
                const isApprovedDriver = Boolean(
                  drv.isApproved === true ||
                  drv.isVerified === true ||
                  drv.isDriverVerified === true ||
                  drv.status === 'approved' ||
                  drv.verified === true
                );
                const isBlockedDriver = drv.status === 'blocked';

                return (
                  <div
                    key={drv.id}
                    className={`p-5 rounded-3xl bg-white border shadow-sm space-y-4 flex flex-col justify-between transition ${
                      isBlockedDriver
                        ? 'border-red-300 bg-red-50/20'
                        : isApprovedDriver
                        ? 'border-emerald-200'
                        : 'border-amber-300 bg-amber-50/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={drv.photoURL || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80'}
                          alt={drv.name}
                          className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-200"
                        />

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${
                              drv.isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <Radio className={`w-3 h-3 ${drv.isOnline ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
                            {drv.isOnline ? 'Online' : 'Offline'}
                          </span>

                          {drv.isSuspended ? (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-600 text-white shadow-sm flex items-center gap-1 animate-pulse">
                              <ShieldAlert className="w-3 h-3" />
                              PIN Lockout
                            </span>
                          ) : isBlockedDriver ? (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                              <Ban className="w-3 h-3 text-red-600" />
                              Blocked
                            </span>
                          ) : isApprovedDriver ? (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Approved
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Pending Approval
                            </span>
                          )}
                        </div>
                      </div>

                      {drv.suspensionReason && (
                        <div className="mt-2 text-[10px] bg-red-50 text-red-700 p-2 rounded-xl border border-red-200 font-medium">
                          ⚠️ {drv.suspensionReason}
                        </div>
                      )}

                      <div className="mt-3">
                        <h3 className="text-sm font-extrabold text-slate-900">{drv.name}</h3>
                        <p className="text-xs text-slate-500">{drv.phone}</p>
                        {drv.vehicleNumber ? (
                          <div className="mt-2 text-xs bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 capitalize flex items-center gap-1">
                                <Bike className="w-3.5 h-3.5 text-emerald-600" />
                                {drv.vehicleType || 'Bike'} • {formatVehiclePlate(drv.vehicleNumber)}
                              </span>
                              <span className="text-[10px] font-mono text-purple-700 font-bold bg-purple-100 px-1.5 py-0.5 rounded">
                                {drv.payoutUpiId || 'UPI Set'}
                              </span>
                            </div>
                            <div className="text-[10px] text-emerald-800 font-semibold">
                              {parseVehicleInfo(drv.vehicleNumber, drv.vehicleType).rtoZoneName}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-[11px] bg-amber-50 p-2 rounded-xl border border-amber-200 text-amber-800 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Vehicle registration pending</span>
                          </div>
                        )}
                        {drv.location ? (
                          <div className="mt-2 text-xs bg-emerald-50 p-2 rounded-xl border border-emerald-100 flex items-center justify-between text-emerald-900">
                            <span className="font-bold flex items-center gap-1 text-[11px]">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                              GPS: {drv.location.spotName || 'Rawatbhata'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {drv.location.lat.toFixed(4)}, {drv.location.lng.toFixed(4)}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-2 text-xs bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center gap-1 text-slate-400">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="text-[11px]">GPS: Awaiting active on-duty signal</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                        <div className="bg-slate-50 p-2 rounded-xl">
                          <span className="text-[10px] text-slate-400 block font-semibold">Completed</span>
                          <span className="text-xs font-bold text-slate-800">{drv.completedRuns} runs</span>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-xl">
                          <span className="text-[10px] text-slate-400 block font-semibold">Total Payout</span>
                          <span className="text-xs font-bold text-emerald-600">₹{drv.totalEarnings}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons (Approve / Block / Delete) */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isApprovedDriver && !isBlockedDriver}
                          onClick={async () => {
                            await approveDriver(drv.id);
                            showToast(`✅ Driver "${drv.name}" Approved! Duty toggle unlocked.`);
                          }}
                          className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            isApprovedDriver && !isBlockedDriver
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 opacity-60 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95'
                          }`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{isApprovedDriver && !isBlockedDriver ? 'Approved' : 'Approve'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBlockedDriver}
                          onClick={async () => {
                            await blockDriver(drv.id);
                            showToast(`🚫 Driver "${drv.name}" Blocked! Forced offline.`);
                          }}
                          className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                            isBlockedDriver
                              ? 'bg-red-100 text-red-700 border border-red-200 opacity-60 cursor-not-allowed'
                              : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md active:scale-95'
                          }`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{isBlockedDriver ? 'Blocked' : 'Block'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm(`Are you sure you want to permanently delete driver "${drv.name}" from the fleet database?`)) {
                            await deleteDriver(drv.id);
                            showToast(`🗑️ Driver "${drv.name}" removed from database.`);
                          }
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        <span>Delete Driver</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 2.5 DRIVER WEEKLY PAYOUTS & SETTLEMENT DESK */}
      {activeTab === 'payouts' && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <Wallet className="w-4 h-4" />
                </span>
                <h2 className="text-base font-black text-slate-900">Driver Weekly Payouts & Settlement Hub</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculate driver earnings, subtract flat ₹5 platform commission, and remit weekly payouts via UPI.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-purple-700" />
                Weekly Cycle: Sunday / Monday
              </span>
            </div>
          </div>

          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Drivers</span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
                {driverPartners.length}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Fleet Partners</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-emerald-700 block">Pending Driver Payouts</span>
              <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block">
                ₹{totalNetPayoutsDue}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">Online order net earnings</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-amber-700 block">Cash Platform Fees</span>
              <span className="text-xl sm:text-2xl font-black text-amber-800 mt-1 block">
                ₹{totalCashPlatformFeesDue}
              </span>
              <span className="text-[10px] text-amber-600 font-medium">To collect from COD drivers</span>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-purple-700 block">Platform Commission</span>
              <span className="text-xl sm:text-2xl font-black text-purple-900 mt-1 block">
                ₹{platformRevenue}
              </span>
              <span className="text-[10px] text-purple-700 font-medium">Flat ₹5 per run</span>
            </div>
          </div>

          {/* Weekly Payout Policy Guideline Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white border border-slate-800 shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-[10px] uppercase">
                  Payout Protocol
                </span>
                <span className="font-bold text-slate-200">How Driver Weekly Payment Works:</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                1. <strong>Online Orders (UPI):</strong> Admin received total price. Driver gets <code>Price - ₹5</code>.<br />
                2. <strong>Cash Orders (COD):</strong> Driver collected full cash in hand. Driver owes Admin flat <code>₹5</code> fee.<br />
                3. <strong>Net Weekly Payout:</strong> Click <strong>⚡ Pay via UPI</strong> to open pre-filled GPay/PhonePe/Paytm with Driver's UPI ID.
              </p>
            </div>
          </div>

          {/* Driver Payout List */}
          {driverPayoutSummaries.length === 0 ? (
            <div className="p-12 rounded-3xl bg-white border-2 border-dashed border-slate-200 text-center space-y-2">
              <Wallet className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-black text-slate-700">No Driver Partners Registered</h3>
              <p className="text-xs text-slate-400">
                When drivers register and complete delivery runs, their weekly earnings ledger will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {driverPayoutSummaries.map((summary) => {
                const isOnlineOwed = summary.netWeeklyPayoutDue > 0;
                const isCashOwed = summary.netWeeklyPayoutDue < 0;
                const isZeroBalance = summary.netWeeklyPayoutDue === 0;

                const upiDeepLink = summary.payoutUpiId
                  ? `upi://pay?pa=${summary.payoutUpiId}&pn=${encodeURIComponent(summary.driverName)}&am=${Math.max(0, summary.netWeeklyPayoutDue)}&cu=INR&tn=RawatbhataWeeklyPayout`
                  : '#';

                const waReceiptText = encodeURIComponent(
                  `📋 *RAWATBHATA HYPERLOCAL - WEEKLY SETTLEMENT RECEIPT*\n\n` +
                  `👤 *Driver Partner:* ${summary.driverName}\n` +
                  `🛵 *Vehicle:* ${summary.vehicleNumber || 'Registered'} (${summary.vehicleType || 'Bike'})\n` +
                  `🛵 *Completed Runs:* ${summary.totalCompletedRuns}\n` +
                  `💳 *Online Orders Earning:* ₹${summary.onlineEarningsOwedToDriver}\n` +
                  `💵 *Cash Platform Fee (₹5/run):* -₹${summary.cashPlatformFeeOwed}\n` +
                  `-------------------------------\n` +
                  `⚡ *Net Weekly Payout:* ₹${summary.netWeeklyPayoutDue}\n` +
                  `🏦 *Payout UPI ID:* ${summary.payoutUpiId || 'Not Set'}\n` +
                  `📅 *Date:* ${new Date().toLocaleDateString('en-IN')}\n\n` +
                  `_Rawatbhata Direct Dispatch Platform_`
                );

                return (
                  <div
                    key={summary.driverId}
                    className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4 hover:border-slate-300 transition"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Driver Identity */}
                      <div className="flex items-start gap-3.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={summary.driverPhoto || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80'}
                          alt={summary.driverName}
                          className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-200 flex-shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-slate-900">{summary.driverName}</h3>
                            {summary.vehicleNumber && (
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {summary.vehicleNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">📞 {summary.driverPhone}</p>

                          {/* Payout UPI ID Box */}
                          <div className="mt-1.5 flex items-center gap-2">
                            {summary.payoutUpiId ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-50 border border-purple-200 text-[11px] font-mono font-bold text-purple-900">
                                <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                                <span>{summary.payoutUpiId}</span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(summary.payoutUpiId!, summary.driverId)}
                                  className="ml-1 text-purple-600 hover:text-purple-900 p-0.5"
                                  title="Copy UPI ID"
                                >
                                  {copiedUpi === summary.driverId ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                                ⚠️ Payout UPI ID Not Set
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Financial Breakdown Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Runs</span>
                          <span className="font-extrabold text-slate-800">{summary.totalCompletedRuns} done</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Online Share</span>
                          <span className="font-extrabold text-emerald-600">₹{summary.onlineEarningsOwedToDriver}</span>
                          <span className="text-[9px] text-slate-400 block">({summary.onlineOrdersCount} online)</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Cash Fee Due</span>
                          <span className="font-extrabold text-amber-700">-₹{summary.cashPlatformFeeOwed}</span>
                          <span className="text-[9px] text-slate-400 block">({summary.cashOrdersCount} COD)</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block font-bold uppercase">Commission</span>
                          <span className="font-extrabold text-purple-700">₹{summary.platformFeeTotal}</span>
                          <span className="text-[9px] text-slate-400 block">(₹5 × {summary.totalCompletedRuns})</span>
                        </div>
                      </div>

                      {/* Net Weekly Payout & Quick Action Buttons */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-[280px] justify-end">
                        <div className="p-3 rounded-2xl bg-slate-900 text-white text-center sm:text-right min-w-[120px]">
                          <span className="text-[9px] text-slate-400 uppercase font-black block">Net Weekly Due</span>
                          <span
                            className={`text-lg font-black ${
                              isOnlineOwed
                                ? 'text-emerald-400'
                                : isCashOwed
                                ? 'text-amber-400'
                                : 'text-slate-300'
                            }`}
                          >
                            ₹{summary.netWeeklyPayoutDue}
                          </span>
                          <span className="text-[9px] text-slate-400 block font-medium">
                            {isOnlineOwed ? 'Pay to Driver' : isCashOwed ? 'Collect from Driver' : 'Settled'}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5 flex-1">
                          {isOnlineOwed && summary.payoutUpiId ? (
                            <a
                              href={upiDeepLink}
                              className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>⚡ Pay ₹{summary.netWeeklyPayoutDue} UPI</span>
                            </a>
                          ) : null}

                          <button
                            type="button"
                            disabled={settlingDriverId === summary.driverId}
                            onClick={() => handleSettlePayout(summary)}
                            className="py-1.5 px-3 rounded-xl bg-purple-900 hover:bg-purple-800 active:scale-95 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{settlingDriverId === summary.driverId ? 'Recording...' : '✓ Mark Settled'}</span>
                          </button>

                          <a
                            href={`https://wa.me/91${summary.driverPhone?.replace(/\D/g, '')}?text=${waReceiptText}`}
                            target="_blank"
                            rel="noreferrer"
                            className="py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
                          >
                            <Receipt className="w-3.5 h-3.5 text-slate-500" />
                            <span>WhatsApp Statement</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. DUAL BROADCAST MESSAGES (DRIVERS & CLIENTS) */}
      {activeTab === 'broadcast' && (
        <section className="space-y-6">
          <div>
            <h2 className="text-base font-black text-slate-900">Dual Admin Broadcast Messaging</h2>
            <p className="text-xs text-slate-500">Dispatch instant bulletins and urgent alerts directly to drivers or clients across Rawatbhata</p>
          </div>

          {/* Unified High-Power Broadcast Composer */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white border-2 border-indigo-500/40 shadow-2xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-400 text-slate-950 shadow-md">
                  <Bell className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Rawatbhata Town Bulletin Dispatcher
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sends real-time audio chimes, screen bulletin popups & push notifications instantly
                  </p>
                </div>
              </div>

              {/* Test on this device button */}
              <button
                type="button"
                onClick={handleTestAlertOnScreen}
                className="px-4 py-2 rounded-xl bg-purple-600/50 hover:bg-purple-600 text-white text-xs font-bold transition border border-purple-400/40 flex items-center gap-2 shadow"
              >
                <span>🔔 Test Alert Sound & Popup on This Screen</span>
              </button>
            </div>

            <form onSubmit={handleSendUnifiedBroadcast} className="space-y-5">
              {/* Target Audience Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  Select Recipient Audience:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setBroadcastTarget('all')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition flex items-center justify-between ${
                      broadcastTarget === 'all'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-black">📢 All Users (Everyone)</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Both Clients + All Drivers</p>
                    </div>
                    {broadcastTarget === 'all' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastTarget('drivers')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition flex items-center justify-between ${
                      broadcastTarget === 'drivers'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-black">🛵 Drivers Only</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{onlineDriversCount} Pilots online</p>
                    </div>
                    {broadcastTarget === 'drivers' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setBroadcastTarget('clients')}
                    className={`p-3.5 rounded-2xl border-2 text-left transition flex items-center justify-between ${
                      broadcastTarget === 'clients'
                        ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 shadow-md'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-black">👤 Clients Only</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Citizens & Customers</p>
                    </div>
                    {broadcastTarget === 'clients' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5">
                  ⚡ Quick Templates (Click to fill):
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    '🎉 Special Offer: First ride/errand delivery free in Rawatbhata today!',
                    '🌧️ Weather Notice: Heavy rain in Rawatbhata. Expect slight delivery delays.',
                    '⚡ Driver Surge: High demand in Sector-3 & Main Bazar. Extra incentives active!',
                    '📢 Service Notice: Hyperlocal delivery active 24x7 across all sectors.',
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setBroadcastText(preset)}
                      className="px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-[11px] text-slate-300 border border-slate-700 transition"
                    >
                      {preset.slice(0, 42)}...
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Announcement Message: <span className="text-amber-400">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="Type your notice or bulletin here (e.g. Aaj ride free hai, ya barish ka alert)..."
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-indigo-500/40 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 focus:outline-none transition resize-none"
                />
              </div>

              {/* Dispatch Action Button */}
              <button
                type="submit"
                disabled={isSendingBroadcast || !broadcastText.trim()}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-[0.99] disabled:opacity-50 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSendingBroadcast ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    <span>Broadcasting Bulletin Across Town...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>
                      📢 Dispatch Live Announcement to{' '}
                      {broadcastTarget === 'all'
                        ? 'EVERYONE (Clients + Drivers)'
                        : broadcastTarget === 'drivers'
                        ? 'All Drivers'
                        : 'All Clients'}
                    </span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Recent Broadcast History */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-black text-slate-900">Broadcast Dispatch History</h3>
                <span className="text-xs text-slate-400">({broadcastHistory.length} sent)</span>
              </div>
              {broadcastHistory.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm('Clear and delete ALL old broadcasts from the database? This will stop them from showing on any device.')) {
                      await clearAllBroadcastNotifications();
                      setBroadcastHistory([]);
                      showToast('🧹 All past broadcasts deleted from database!');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition flex items-center gap-1"
                  title="Delete all past broadcasts"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {broadcastHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No broadcasts sent yet. Use the boxes above to dispatch your first announcement.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {broadcastHistory.map((b) => (
                  <div key={b.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          b.target === 'drivers'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          {b.target === 'drivers' ? '🛵 To Drivers' : '👤 To Clients'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(b.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-700 font-medium whitespace-pre-line">{b.text}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono">{b.senderName || 'Admin'}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm('Delete this broadcast notification from the database?')) {
                            await deleteBroadcastNotification(b.id);
                            setBroadcastHistory((prev) => prev.filter((x) => x.id !== b.id));
                            showToast('🗑️ Broadcast deleted from database.');
                          }
                        }}
                        className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 transition"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. PRICING & RATES CONTROL */}
      {activeTab === 'pricing' && (
        <section className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <DollarSign className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong>Dynamic Baseline Pricing Engine:</strong> Changes made here immediately update the client order booking drawer, price estimators, and driver payout baselines across Rawatbhata.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(CATEGORY_META) as OrderCategory[]).map((catKey) => {
              const meta = CATEGORY_META[catKey];
              const currentRate = servicePrices[catKey];
              const isEdited = editPrices[catKey] !== currentRate;

              return (
                <div
                  key={catKey}
                  className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{meta.icon}</span>
                      <h3 className="text-sm font-black text-slate-900">{meta.name}</h3>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{meta.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">Base Fair (₹):</span>
                      <input
                        type="number"
                        min={10}
                        value={editPrices[catKey]}
                        onChange={(e) =>
                          setEditPrices({ ...editPrices, [catKey]: Number(e.target.value) })
                        }
                        className="w-24 px-3 py-1.5 rounded-xl border border-slate-300 text-sm font-black focus:border-amber-500 focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePriceSave(catKey)}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm"
                    >
                      Save Rate
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* WhatsApp Support Dispatch Configuration Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 text-white border border-emerald-700/40 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Support & Dispatch WhatsApp Configuration</h3>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Orders and client dispatches from the web app will auto-populate pre-formatted chats to this phone number.
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase border border-emerald-500/30">
                Live Broadcast
              </span>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs font-bold text-slate-400">Phone (with Country Code):</span>
                <input
                  type="text"
                  value={editWhatsAppNumber}
                  onChange={(e) => setEditWhatsAppNumber(e.target.value)}
                  placeholder="e.g. 919829012345"
                  className="w-48 px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleWhatsAppSave}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black transition shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5"
              >
                <span>Save WhatsApp Number</span>
              </button>
            </div>
          </div>

          {/* Razorpay Gateway & Direct UPI Configuration Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white border border-purple-700/40 shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Razorpay Verified Payment Gateway & UPI Desk</h3>
                  <p className="text-xs text-purple-200/80 mt-0.5">
                    Automated bank-grade payments (UPI, GPay, PhonePe, Cards, NetBanking) with instant confirmation callback.
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Gateway Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-purple-900/60 text-xs">
              <div className="p-3 rounded-2xl bg-purple-900/30 border border-purple-800/50">
                <span className="text-[10px] font-bold uppercase text-purple-300 block">Gateway Key Status</span>
                <span className="font-mono font-bold text-white text-xs">{editRazorpayKey.startsWith('rzp_live') ? '🟢 Live Production' : editRazorpayKey ? '🟡 Sandbox / Custom' : 'Default Sandbox'}</span>
              </div>
              <div className="p-3 rounded-2xl bg-purple-900/30 border border-purple-800/50">
                <span className="text-[10px] font-bold uppercase text-purple-300 block">UPI VPA Receiver</span>
                <span className="font-mono font-bold text-white text-xs">9649228281@yescred</span>
              </div>
              <div className="p-3 rounded-2xl bg-purple-900/30 border border-purple-800/50">
                <span className="text-[10px] font-bold uppercase text-purple-300 block">Admin Fee / Run</span>
                <span className="font-bold text-amber-400 text-xs">₹5 Flat Commission</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-purple-900/60">
              <div className="flex-1">
                <span className="text-xs font-bold text-purple-200 block mb-1">Custom Razorpay Key ID (rzp_live_... or rzp_test_...):</span>
                <input
                  type="text"
                  value={editRazorpayKey}
                  onChange={(e) => setEditRazorpayKey(e.target.value.trim())}
                  placeholder="e.g. rzp_live_xxxxxxxx or rzp_test_xxxxxxxx"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-purple-700/60 text-white text-xs font-mono font-bold focus:border-purple-400 focus:outline-none"
                />
                <p className="text-[10px] text-purple-300/70 mt-1">
                  Get your free Key ID from <strong>dashboard.razorpay.com &gt; Settings &gt; API Keys</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  saveActiveRazorpayKey(editRazorpayKey);
                  showToast('🔑 Razorpay API Key ID updated and saved!');
                }}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-black transition shadow-md shadow-purple-600/30 self-start sm:self-center flex items-center gap-1.5"
              >
                <span>Save Key ID</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 4. DATABASE & ALL ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <section className="space-y-6">
          <div className="p-6 rounded-3xl bg-slate-900 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-black">Live Firestore Orders Management ({orders.length} Total)</h2>
              </div>
              <p className="text-xs text-slate-400">
                View all orders across Rawatbhata. Delete individual test runs or wipe all test data to start fresh.
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                if (confirm('⚠️ WARNING: Are you sure you want to permanently CLEAR & DELETE ALL orders from Firestore? This will reset all active and available runs to 0.')) {
                  await clearAllOrders();
                  showToast('🧹 All orders permanently purged from Firestore database!');
                }
              }}
              className="px-4 py-2.5 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-black transition flex items-center gap-2 shadow-lg shadow-red-600/30 whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              <span>Purge All Test Orders (Reset DB)</span>
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="p-12 rounded-3xl bg-white border-2 border-dashed border-slate-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-800">Database is Clean (0 Orders)</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No orders currently in the system. Switch to Client mode to create a fresh test task.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {orders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                          {ord.categoryLabel}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            ord.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : ord.status === 'assigned' || ord.status === 'photo_uploaded'
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-sky-100 text-sky-800 border-sky-200'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </div>
                      <span className="text-base font-black text-slate-900">₹{ord.price}</span>
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-900">{ord.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{ord.description}</p>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1 text-slate-600">
                      <p>Pickup: <strong>{ord.pickupAddress}</strong></p>
                      <p>Drop: <strong>{ord.dropAddress}</strong></p>
                      <p>Client: <strong>{ord.clientName}</strong> ({ord.clientPhone || 'No Phone'})</p>
                      {ord.assignedTo && <p>Assigned Driver: <strong>{ord.driverName || ord.assignedTo}</strong></p>}
                      <p className="text-[11px] text-slate-400 pt-1">
                        Created: {new Date(ord.createdAt).toLocaleString()} • ID: {ord.id.slice(-6)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500">
                      Payment: <strong>{ord.paymentStatus}</strong> ({ord.paymentMethod})
                    </span>

                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(`Delete order "${ord.title}" (${ord.id})?`)) {
                          await deleteOrder(ord.id);
                          showToast(`🗑️ Order "${ord.title}" deleted!`);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition flex items-center gap-1.5 border border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Live Chat Modal Trigger */}
      {selectedChatOrder && (
        <LiveChatModal
          order={selectedChatOrder}
          onClose={() => setSelectedChatOrder(null)}
        />
      )}

      {/* Admin Test / Live Broadcast Modal Preview */}
      {previewBroadcastModal && (
        <div
          onClick={() => setPreviewBroadcastModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border-2 border-amber-500 space-y-4 relative cursor-default text-slate-900"
          >
            <button
              type="button"
              onClick={() => setPreviewBroadcastModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition"
              title="Dismiss Notice"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500 text-slate-950 shadow-md">
                <Bell className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  📢 Important Notice from Admin
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Rawatbhata DIRECT Bulletin
                </h3>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 leading-relaxed whitespace-pre-line">
              {previewBroadcastModal.text}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Target: <strong>{previewBroadcastModal.target ? previewBroadcastModal.target.toUpperCase() : 'ALL'}</strong></span>
              <span>{new Date(previewBroadcastModal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <button
              type="button"
              onClick={() => setPreviewBroadcastModal(null)}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-black text-xs shadow-lg shadow-amber-500/30 transition"
            >
              ✓ Close Test Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
