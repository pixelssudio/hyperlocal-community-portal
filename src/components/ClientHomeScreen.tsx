'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order, OrderCategory, ServiceCategoryOption, TargetAudience, PaymentMethod, PaymentStatus, RAWATBHATA_SPOTS, GeoPoint, SystemNotification } from '@/lib/types';
import { getCurrentDeviceLocation, findNearestSpotName, resolveLocationCoordinates, formatDistance, calculateDistanceKm } from '@/lib/geo';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import LiveChatModal from '@/components/LiveChatModal';
import PaymentModal from '@/components/PaymentModal';
import { triggerRazorpayPayment } from '@/lib/razorpay';
import { playNotificationSound, sendBrowserPushNotification, requestBrowserNotificationPermission, unlockAudioContext } from '@/lib/audio';
import { generateWhatsAppLink, formatClientOrderWhatsApp, formatCompanionBookingWhatsApp } from '@/lib/whatsapp';
import {
  Sparkles,
  Zap,
  ShoppingBag,
  Package,
  Car,
  HeartHandshake,
  ShieldCheck,
  MapPin,
  Clock,
  PlusCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  FileText,
  BadgeCheck,
  ChevronRight,
  Info,
  Phone,
  MessageSquare,
  Camera,
  ThumbsUp,
  Bike,
  QrCode,
  Banknote,
  CreditCard,
  Smartphone,
  Navigation,
  Crosshair,
  KeyRound,
  Bell,
  X
} from 'lucide-react';

const SERVICE_CATEGORIES: ServiceCategoryOption[] = [
  {
    id: 'errand',
    name: 'Instant Errands & Medicines',
    shortDesc: 'Medical store runs, urgent document drop, household chore pickups',
    iconName: 'Zap',
    color: 'from-amber-500 to-yellow-600',
    targetAudience: 'driver_pool',
    startingPrice: 40,
  },
  {
    id: 'food',
    name: 'Local Food & Dhaba',
    shortDesc: 'Order from any Rawatbhata tea stall, sweets shop, or restaurant',
    iconName: 'ShoppingBag',
    color: 'from-orange-500 to-red-600',
    targetAudience: 'driver_pool',
    startingPrice: 50,
  },
  {
    id: 'delivery',
    name: 'Market Parcel & Kirana',
    shortDesc: 'Heavy grocery, bazaar shopping, parcels, and local logistics',
    iconName: 'Package',
    color: 'from-blue-500 to-indigo-600',
    targetAudience: 'driver_pool',
    startingPrice: 40,
  },
  {
    id: 'ride',
    name: 'Local Cab & Bike Taxi',
    shortDesc: 'Fast point-to-point commute between Rawatbhata colonies & plant gates',
    iconName: 'Car',
    color: 'from-emerald-500 to-teal-600',
    targetAudience: 'driver_pool',
    startingPrice: 60,
  },
  {
    id: 'companion_listening_ghumna',
    name: 'Companion / Listening / Ghumna',
    shortDesc: 'Friendly walking partner, empathetic listener, senior escort in town',
    iconName: 'HeartHandshake',
    color: 'from-purple-600 to-pink-600',
    targetAudience: 'admin_only',
    badge: 'Admin Only Isolation',
    startingPrice: 150,
  },
];

export default function ClientHomeScreen() {
  const { user, orders, createOrder, cancelOrder, approveDelivery, confirmOrderPayment, servicePrices, applyAsDriver, supportWhatsAppNumber } = useAuth();

  const [activeCategory, setActiveCategory] = useState<OrderCategory>('errand');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedChatOrder, setSelectedChatOrder] = useState<Order | null>(null);

  // Payment Drawer State
  const [activePaymentOrder, setActivePaymentOrder] = useState<{ id?: string; title: string; amount: number } | null>(null);

  // Real-time Pricing State Synced from Firestore Config
  const [realtimePrices, setRealtimePrices] = useState<{ [key in OrderCategory]: number }>(servicePrices);

  useEffect(() => {
    if (servicePrices) {
      setRealtimePrices(servicePrices);
    }
  }, [servicePrices]);

  // Direct Firestore onSnapshot Listener for Live Pricing Config
  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const pricingDocRef = doc(db, 'config', 'pricing');
    const unsubPricing = onSnapshot(
      pricingDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<{ [key in OrderCategory]: number }>;
          setRealtimePrices((prev) => ({
            ...prev,
            errand: Number(data.errand) || prev.errand || 40,
            food: Number(data.food) || prev.food || 50,
            delivery: Number(data.delivery) || prev.delivery || 40,
            ride: Number(data.ride) || prev.ride || 60,
            companion_listening_ghumna: Number(data.companion_listening_ghumna) || prev.companion_listening_ghumna || 150,
          }));
        }
      },
      (err) => {
        console.warn('Client pricing real-time listener notice:', err);
      }
    );

    return () => unsubPricing();
  }, []);

  // Form State - Always start completely blank
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropAddress, setDropAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState<GeoPoint | undefined>(undefined);
  const [dropCoords, setDropCoords] = useState<GeoPoint | undefined>(undefined);
  const [isDetectingGps, setIsDetectingGps] = useState<boolean>(false);
  const [price, setPrice] = useState<number>(servicePrices.errand || 40);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cod');
  const [upiTransactionRef, setUpiTransactionRef] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Real-time Broadcast Notifications Listener for Clients (Strict 1-Time Display)
  const [activeBroadcastModal, setActiveBroadcastModal] = useState<SystemNotification | null>(null);
  const [latestActiveNotice, setLatestActiveNotice] = useState<SystemNotification | null>(null);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rawatbhata_dismissed_client_notifs');
      if (saved) setDismissedBroadcastIds(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !db) return;

    const notifsRef = collection(db, 'system_notifications');
    const q = query(notifsRef);
    const unsub = onSnapshot(q, (snapshot) => {
      const notifs: SystemNotification[] = [];
      const now = Date.now();
      const MAX_NOTIFICATION_AGE_MS = 48 * 60 * 60 * 1000; // 48 Hours TTL

      snapshot.forEach((d) => {
        const data = d.data() as Omit<SystemNotification, 'id'>;
        if (data.target === 'clients' || data.target === 'all') {
          const createdTime = new Date(data.createdAt).getTime();
          if (!isNaN(createdTime) && (now - createdTime) < MAX_NOTIFICATION_AGE_MS) {
            notifs.push({ id: d.id, ...data });
          }
        }
      });

      if (notifs.length > 0) {
        notifs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const latest = notifs[0];
        setLatestActiveNotice(latest);
        let currentDismissed: string[] = [];

        try {
          const saved = localStorage.getItem('rawatbhata_dismissed_client_notifs');
          if (saved) currentDismissed = JSON.parse(saved);
        } catch {}

        if (latest && !currentDismissed.includes(latest.id)) {
          setActiveBroadcastModal(latest);
          playNotificationSound('companion_alert');
          sendBrowserPushNotification('📢 Notice from Admin Desk', latest.text);
        } else {
          setActiveBroadcastModal(null);
        }
      } else {
        setLatestActiveNotice(null);
        setActiveBroadcastModal(null);
      }
    });

    return () => unsub();
  }, []);

  const handleDismissBroadcast = (id: string) => {
    let updated = [...dismissedBroadcastIds];
    if (!updated.includes(id)) {
      updated.push(id);
    }
    setDismissedBroadcastIds(updated);
    try {
      localStorage.setItem('rawatbhata_dismissed_client_notifs', JSON.stringify(updated));
    } catch {}
    setActiveBroadcastModal(null);
  };

  const [showPushBanner, setShowPushBanner] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      setShowPushBanner(true);
    }
  }, []);

  const handleAllowPush = async () => {
    const granted = await requestBrowserNotificationPermission();
    if (granted) {
      playNotificationSound('order_accepted');
      sendBrowserPushNotification(
        '🎉 Lock-Screen Alerts Active!',
        'You will now receive instant order updates and delivery partner alerts on your phone.'
      );
      setShowPushBanner(false);
    }
  };

  // Dynamic Service Categories with Real-Time Live Prices from Firestore
  const dynamicServices: ServiceCategoryOption[] = SERVICE_CATEGORIES.map((s) => ({
    ...s,
    startingPrice: Number(realtimePrices[s.id]) || Number(servicePrices[s.id]) || s.startingPrice,
  }));

  const selectedService = dynamicServices.find((s) => s.id === activeCategory) || dynamicServices[0];
  const isCompanionIsolated = activeCategory === 'companion_listening_ghumna';

  // Live Distance & Dynamic Fare Computation
  const activePickupCoords = pickupCoords || (pickupAddress ? resolveLocationCoordinates(pickupAddress) : undefined);
  const activeDropCoords = dropCoords || (dropAddress ? resolveLocationCoordinates(dropAddress) : undefined);
  const tripDistanceKm = (activePickupCoords && activeDropCoords) ? calculateDistanceKm(activePickupCoords, activeDropCoords) : 0;
  const currentCategoryBaseFare = Number(realtimePrices[activeCategory]) || Number(servicePrices[activeCategory]) || selectedService.startingPrice;

  // Strict User Isolation: Filter orders created strictly by this logged-in client
  const clientOrders = orders.filter((o) => o.clientId === user?.uid);

  // Reactive Order Status Watcher: Sound Chimes & Browser Notifications on Driver Acceptance & Delivery
  const prevClientOrdersRef = useRef<Map<string, string>>(new Map());
  const isInitialClientOrdersLoad = useRef(true);

  useEffect(() => {
    if (isInitialClientOrdersLoad.current) {
      const initMap = new Map<string, string>();
      clientOrders.forEach((o) => initMap.set(o.id, o.status));
      prevClientOrdersRef.current = initMap;
      isInitialClientOrdersLoad.current = false;
      return;
    }

    const prevMap = prevClientOrdersRef.current;
    clientOrders.forEach((ord) => {
      const prevStatus = prevMap.get(ord.id);
      if (prevStatus && prevStatus !== ord.status) {
        if (ord.status === 'assigned' || ord.status === 'in_progress') {
          playNotificationSound('order_accepted');
          const driverInfo = ord.driverName ? `${ord.driverName}${ord.driverPhone ? ` (${ord.driverPhone})` : ''}` : 'A Driver Partner';
          setSuccessToast(`🎉 ${driverInfo} has ACCEPTED your run "${ord.title}"! Partner is on the way.`);
          sendBrowserPushNotification('🎉 Driver Accepted Your Order!', `${driverInfo} is on the way for "${ord.title}".`);
        } else if (ord.status === 'photo_uploaded') {
          playNotificationSound('photo_uploaded');
          setSuccessToast(`📸 Driver uploaded verification photo for "${ord.title}". Review & approve.`);
          sendBrowserPushNotification('📸 Review Bill Photo', `Verification photo uploaded for "${ord.title}".`);
        } else if (ord.status === 'completed') {
          playNotificationSound('order_completed');
          setSuccessToast(`✅ Order "${ord.title}" has been completed & delivered!`);
          sendBrowserPushNotification('✅ Delivery Completed', `Your order "${ord.title}" was marked delivered.`);
        }
      }
    });

    const nextMap = new Map<string, string>();
    clientOrders.forEach((o) => nextMap.set(o.id, o.status));
    prevClientOrdersRef.current = nextMap;
  }, [clientOrders]);

  // Reactive Chat Messages Watcher for Client
  const prevMsgCountsRef = useRef<Map<string, number>>(new Map());
  const isInitialMsgCountLoad = useRef(true);

  useEffect(() => {
    if (isInitialMsgCountLoad.current) {
      const initMap = new Map<string, number>();
      clientOrders.forEach((o) => initMap.set(o.id, o.messages?.length || 0));
      prevMsgCountsRef.current = initMap;
      isInitialMsgCountLoad.current = false;
      return;
    }

    const prevMap = prevMsgCountsRef.current;
    clientOrders.forEach((ord) => {
      const prevCount = prevMap.get(ord.id) || 0;
      const currentCount = ord.messages?.length || 0;
      if (currentCount > prevCount && ord.messages) {
        const latestMsg = ord.messages[currentCount - 1];
        if (latestMsg && latestMsg.senderId !== user?.uid && latestMsg.senderRole !== 'client') {
          playNotificationSound('bell');
          const senderTitle = latestMsg.senderRole === 'admin' ? 'Admin Desk' : (ord.driverName || 'Driver Partner');
          setSuccessToast(`💬 ${senderTitle}: "${latestMsg.text}"`);
          sendBrowserPushNotification(`💬 Message from ${senderTitle}`, latestMsg.text);
        }
      }
    });

    const nextMap = new Map<string, number>();
    clientOrders.forEach((o) => nextMap.set(o.id, o.messages?.length || 0));
    prevMsgCountsRef.current = nextMap;
  }, [clientOrders, user?.uid]);

  // Dynamic Fare Recalculation Effect based on Live Base Rate and Route Distance
  useEffect(() => {
    if (activeCategory === 'companion_listening_ghumna') {
      setPrice(currentCategoryBaseFare);
    } else if (activeCategory === 'errand' || activeCategory === 'delivery') {
      const calculated = Math.max(currentCategoryBaseFare, Math.round(currentCategoryBaseFare + Math.max(0, tripDistanceKm - 2) * 10));
      setPrice(calculated);
    } else if (activeCategory === 'food') {
      const calculated = Math.max(currentCategoryBaseFare, Math.round(currentCategoryBaseFare + Math.max(0, tripDistanceKm - 2) * 12));
      setPrice(calculated);
    } else if (activeCategory === 'ride') {
      const calculated = Math.max(currentCategoryBaseFare, Math.round(currentCategoryBaseFare + Math.max(0, tripDistanceKm - 1) * 10));
      setPrice(calculated);
    } else {
      setPrice(currentCategoryBaseFare);
    }
  }, [activeCategory, tripDistanceKm, currentCategoryBaseFare]);

  const handleDetectGpsLocation = async () => {
    setIsDetectingGps(true);
    try {
      const pos = await getCurrentDeviceLocation();
      const spotName = findNearestSpotName(pos);
      setPickupAddress(spotName);
      setPickupCoords(pos);
      setSuccessToast(`📍 Live GPS Detected: ${spotName} (${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)})`);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err) {
      console.warn('GPS detection note:', err);
    } finally {
      setIsDetectingGps(false);
    }
  };

  const handleOpenTaskModal = (catId: OrderCategory) => {
    setActiveCategory(catId);
    const service = dynamicServices.find((s) => s.id === catId) || dynamicServices[0];
    const liveBase = Number(realtimePrices[catId]) || Number(servicePrices[catId]) || service.startingPrice;
    setPrice(liveBase);
    // Clear all fields completely
    setTaskTitle('');
    setTaskDescription('');
    setPickupAddress('');
    setDropAddress('');
    setPickupCoords(undefined);
    setDropCoords(undefined);
    setSelectedPaymentMethod('cod');
    setUpiTransactionRef('');
    setIsTaskModalOpen(true);
  };

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isCompanion = activeCategory === 'companion_listening_ghumna';
    const effectivePickup = pickupAddress.trim();

    if (!effectivePickup) {
      alert('Please enter or select a pickup / meeting location.');
      return;
    }

    const effectiveTitle = taskTitle.trim() || (isCompanion ? 'Private Companion Session' : `${selectedService.name} Booking`);
    const effectiveDrop = isCompanion ? effectivePickup : (dropAddress.trim() || effectivePickup);

    if (selectedPaymentMethod === 'upi_instant') {
      const cleanUtr = upiTransactionRef.trim();
      if (!cleanUtr || cleanUtr.length < 8) {
        alert('Please enter your 12-digit UPI UTR / Transaction ID (minimum 8 digits) from your GPay / PhonePe / Paytm receipt.');
        return;
      }
    }

    // ⚡ Razorpay 100% Automated Verified Checkout Flow
    if (selectedPaymentMethod === 'razorpay') {
      setIsSubmitting(true);
      try {
        await triggerRazorpayPayment({
          amount: Number(price) || selectedService.startingPrice,
          orderTitle: effectiveTitle,
          user: user ? { name: user.name, email: user.email, phoneNumber: user.phoneNumber } : undefined,
          onSuccess: async (rzpRes) => {
            const created = await createOrder({
              category: activeCategory,
              categoryLabel: selectedService.name,
              title: effectiveTitle,
              description: taskDescription.trim() || (isCompanion ? 'Companion & Listening Session.' : 'No additional instructions.'),
              pickupAddress: effectivePickup,
              dropAddress: effectiveDrop,
              pickupCoords: pickupCoords || resolveLocationCoordinates(effectivePickup),
              dropCoords: isCompanion ? (pickupCoords || resolveLocationCoordinates(effectivePickup)) : (dropCoords || resolveLocationCoordinates(effectiveDrop)),
              price: Number(price) || selectedService.startingPrice,
              targetAudience: isCompanion ? 'admin_only' : 'driver_pool',
              paymentMethod: 'razorpay',
              paymentStatus: 'paid_online',
              transactionRef: rzpRes.razorpay_payment_id,
              utrNumber: rzpRes.razorpay_payment_id,
            });

            setIsTaskModalOpen(false);
            setTaskTitle('');
            setTaskDescription('');
            setPickupAddress('');
            setDropAddress('');
            setUpiTransactionRef('');

            setSuccessToast(
              isCompanion
                ? `⚡ Razorpay Payment Verified (${rzpRes.razorpay_payment_id})! Routed directly to Admin Desk.`
                : created.currentOfferDriverName
                ? `⚡ Razorpay Payment Verified! Dispatched to closest partner ${created.currentOfferDriverName} (${formatDistance(created.currentOfferDriverDistance || 0)})!`
                : `⚡ Razorpay Payment Verified (${rzpRes.razorpay_payment_id})! Task broadcasted to drivers.`
            );
            setTimeout(() => setSuccessToast(null), 6000);
            setIsSubmitting(false);
          },
          onDismiss: () => {
            setIsSubmitting(false);
          },
        });
      } catch (err: any) {
        setIsSubmitting(false);
        alert(err.message || 'Razorpay payment could not be opened. You can select Direct UPI or Cash on Delivery.');
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const isUpi = selectedPaymentMethod === 'upi_instant' || selectedPaymentMethod === 'UPI';
      const cleanUtr = upiTransactionRef.trim();

      const created = await createOrder({
        category: activeCategory,
        categoryLabel: selectedService.name,
        title: effectiveTitle,
        description: taskDescription.trim() || (isCompanion ? 'Companion & Listening Session.' : 'No additional instructions.'),
        pickupAddress: effectivePickup,
        dropAddress: effectiveDrop,
        pickupCoords: pickupCoords || resolveLocationCoordinates(effectivePickup),
        dropCoords: isCompanion ? (pickupCoords || resolveLocationCoordinates(effectivePickup)) : (dropCoords || resolveLocationCoordinates(effectiveDrop)),
        price: Number(price) || selectedService.startingPrice,
        targetAudience: isCompanion ? 'admin_only' : 'driver_pool',
        paymentMethod: isUpi ? 'UPI' : 'cod',
        paymentStatus: isUpi ? 'pending_verification' : 'pending',
        transactionRef: isUpi ? cleanUtr : undefined,
        utrNumber: isUpi ? cleanUtr : undefined,
      });

      setIsTaskModalOpen(false);
      setTaskTitle('');
      setTaskDescription('');
      setPickupAddress('');
      setDropAddress('');
      setUpiTransactionRef('');

      setSuccessToast(
        isCompanion
          ? '🔒 Companion Request Submitted! Routed directly to Admin Desk.'
          : isUpi
          ? `✅ Task "${created.title}" placed! (UTR: ${cleanUtr} submitted for verification)`
          : created.currentOfferDriverName
          ? `✅ Task "${created.title}" placed! Dispatched to closest partner ${created.currentOfferDriverName} (${formatDistance(created.currentOfferDriverDistance || 0)})!`
          : `✅ Task "${created.title}" placed successfully with Cash on Delivery!`
      );
      setTimeout(() => setSuccessToast(null), 6000);
    } catch (err: any) {
      console.error('Task creation failed:', err);
      alert(`❌ Order could not be created: ${err.message || 'Unknown error occurred'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    try {
      await approveDelivery(orderId);
      setSuccessToast('🎉 Delivery approved & completed! Thank you for using Rawatbhata Direct.');
      setTimeout(() => setSuccessToast(null), 6000);
    } catch (err) {
      console.error('Approval failed:', err);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200">
          <div className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 mt-0.5">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold">{successToast}</p>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-slate-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pinned Admin Broadcast Announcement Banner */}
      {latestActiveNotice && !dismissedBroadcastIds.includes(latestActiveNotice.id) && (
        <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500 via-amber-400 to-orange-400 text-slate-950 shadow-xl border-2 border-amber-300 flex items-start justify-between gap-3 animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-950 text-amber-400 shadow mt-0.5">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-slate-950 text-amber-300">
                  📢 Notice from Admin Desk
                </span>
                <span className="text-[11px] font-bold text-amber-950">
                  {new Date(latestActiveNotice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs font-black text-slate-950 mt-1.5 leading-relaxed whitespace-pre-line">
                {latestActiveNotice.text}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleDismissBroadcast(latestActiveNotice.id)}
            className="p-1.5 rounded-full bg-amber-600/30 hover:bg-amber-600/60 text-slate-950 transition flex-shrink-0"
            title="Dismiss Banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Phone Notification Activation Banner (For Lock Screen / Background Alerts) */}
      {showPushBanner && (
        <div className="p-4 rounded-3xl bg-slate-900 border border-amber-500/40 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-black text-white">
                📲 Mobile Lock-Screen & Status Bar Notifications
              </p>
              <p className="text-[11px] text-slate-400">
                Allow notifications so your phone vibrates and alerts you when your order is accepted or driver arrives, even when app is closed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={handleAllowPush}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-black transition shadow-md shadow-amber-500/20 flex items-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Allow Phone Alerts</span>
            </button>
            <button
              type="button"
              onClick={() => setShowPushBanner(false)}
              className="p-2 text-slate-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Hero Welcome Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 text-white p-6 sm:p-10 shadow-2xl overflow-hidden border border-amber-900/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Rawatbhata Hyperlocal Hub • 100% Verified Community</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
            Namaste, <span className="text-amber-400">{user?.name || 'Rawatbhata Citizen'}</span>!
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-2 leading-relaxed">
            What task or errand would you like arranged in town today? Pick an on-demand service below to dispatch a partner or connect with the admin desk.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleOpenTaskModal('errand')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-black transition shadow-lg shadow-amber-500/20"
            >
              <Zap className="w-4 h-4" />
              <span>Instant Errand (₹{realtimePrices.errand || servicePrices.errand || 40})</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenTaskModal('companion_listening_ghumna')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-bold transition shadow-lg shadow-purple-600/20 border border-purple-400/30"
            >
              <HeartHandshake className="w-4 h-4" />
              <span>Companion / Listening (₹{realtimePrices.companion_listening_ghumna || servicePrices.companion_listening_ghumna || 150} - Admin Only)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Services Selection Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Hyperlocal Service Desks</h2>
            <p className="text-xs text-slate-500">Select any category to trigger a real booking or task dispatch</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            5 Active Services
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dynamicServices.map((cat) => {
            const isIsolated = cat.id === 'companion_listening_ghumna';
            return (
              <div
                key={cat.id}
                className={`group relative rounded-3xl p-5 border transition duration-200 bg-white hover:shadow-xl flex flex-col justify-between ${
                  isIsolated
                    ? 'border-purple-200 hover:border-purple-400 bg-gradient-to-b from-purple-50/30 to-white'
                    : 'border-slate-200 hover:border-amber-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${cat.color} flex items-center justify-center text-white shadow-md`}
                    >
                      {cat.id === 'errand' && <Zap className="w-6 h-6" />}
                      {cat.id === 'food' && <ShoppingBag className="w-6 h-6" />}
                      {cat.id === 'delivery' && <Package className="w-6 h-6" />}
                      {cat.id === 'ride' && <Car className="w-6 h-6" />}
                      {cat.id === 'companion_listening_ghumna' && <HeartHandshake className="w-6 h-6" />}
                    </div>

                    {cat.badge && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-purple-600" />
                        {cat.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-amber-600 transition">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {cat.shortDesc}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Est. Fair</span>
                    <span className="text-sm font-black text-slate-900">₹{cat.startingPrice}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenTaskModal(cat.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition ${
                      isIsolated
                        ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20'
                        : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20'
                    }`}
                  >
                    <span>Book Run</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Strict Task Isolation Guard Notice */}
      <div className="rounded-2xl p-4 bg-purple-50/80 border border-purple-200 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-purple-100 text-purple-700 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-xs font-black text-purple-900 uppercase tracking-wide">
            Strict Task Isolation Protocol Active
          </h4>
          <p className="text-xs text-purple-700 mt-0.5 leading-relaxed">
            Requests made under <strong>Companion / Listening / Ghumna</strong> are cryptographically and logically isolated from the general driver feed. Only authorized Admin Personnel can view and coordinate companion assistance.
          </p>
        </div>
      </div>

      {/* Active Orders & History Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Your Active Orders & Runs</h2>
            <p className="text-xs text-slate-500">Real-time status, driver tracking & photo verification approval</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
            {clientOrders.length} Total Runs
          </span>
        </div>

        {clientOrders.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-3xl border-2 border-dashed border-slate-200 bg-white">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">No active bookings yet</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Choose any service above to create your first hyperlocal errand or companion run in Rawatbhata.
            </p>
            <button
              type="button"
              onClick={() => handleOpenTaskModal('errand')}
              className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold shadow hover:bg-amber-400 transition"
            >
              + Create First Task
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {clientOrders.map((ord) => {
              const isAdminOnly = ord.targetAudience === 'admin_only';
              const isAssigned = ['assigned', 'in_progress', 'photo_uploaded'].includes(ord.status);
              const isPhotoReady = ord.status === 'photo_uploaded';
              const isCompleted = ord.status === 'completed';
              const isPaidOnline = ord.paymentStatus === 'paid_online';
              const isCod = ord.paymentMethod === 'cod';

              return (
                <div
                  key={ord.id}
                  className={`p-5 sm:p-6 rounded-3xl border transition bg-white shadow-md space-y-4 ${
                    isPhotoReady
                      ? 'border-amber-400 ring-2 ring-amber-400/20'
                      : isAdminOnly
                      ? 'border-purple-200 bg-purple-50/10'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900">{ord.title}</h3>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            ord.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : ord.status === 'assigned'
                              ? 'bg-blue-100 text-blue-800'
                              : ord.status === 'photo_uploaded'
                              ? 'bg-purple-100 text-purple-800 animate-pulse'
                              : ord.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {ord.status === 'photo_uploaded' ? '📸 Photo Ready for Approval' : (ord.status ? ord.status.toUpperCase() : 'PENDING')}
                        </span>

                        {/* Payment Status Badge */}
                        {isPaidOnline ? (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Paid via UPI (Ref: {ord.transactionRef || 'Online'})
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Banknote className="w-3 h-3 text-amber-600" />
                            Cash on Delivery (Pay ₹{ord.price})
                          </span>
                        )}

                        {isAdminOnly ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-purple-600" />
                            Admin Isolated
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            🚗 Driver Pool
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{ord.description}</p>
                    </div>

                    <div className="text-right flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      <span className="text-sm font-black text-slate-900">₹{ord.price}</span>
                      <a
                        href={generateWhatsAppLink(
                          supportWhatsAppNumber,
                          isAdminOnly ? formatCompanionBookingWhatsApp(ord) : formatClientOrderWhatsApp(ord)
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition flex items-center gap-1 shadow-sm"
                        title="Open WhatsApp with structured order dispatch details"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-200" />
                        <span>{isAdminOnly ? 'WhatsApp Admin' : 'WhatsApp'}</span>
                      </a>
                      {!isPaidOnline && !isCompleted && (
                        <button
                          type="button"
                          onClick={() => setActivePaymentOrder({ id: ord.id, title: ord.title, amount: ord.price })}
                          className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Pay UPI</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Proximity / Nearest Driver Radar Banner */}
                  {ord.status === 'pending' && !isAdminOnly && (
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-900 animate-pulse">
                      <div className="flex items-center gap-2">
                        <Navigation className="w-4 h-4 text-amber-600 animate-spin" />
                        <span>
                          {ord.currentOfferDriverName
                            ? `Priority Offer sent to closest partner ${ord.currentOfferDriverName} (${formatDistance(ord.currentOfferDriverDistance || 0.4)}) • Waiting for acceptance...`
                            : `Searching nearest verified driver partner in Rawatbhata...`}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 whitespace-nowrap">
                        📡 Live Dispatch Radar
                      </span>
                    </div>
                  )}

                  {/* Secure Delivery PIN (OTP) Display */}
                  {ord.status !== 'completed' && ord.status !== 'cancelled' && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-2 border-amber-400/70 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-amber-400/20 text-amber-400">
                            <KeyRound className="w-4 h-4" />
                          </span>
                          <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                            Secure Delivery PIN (OTP)
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Anti-Mismatch Verification
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">
                          Give PIN <strong className="text-amber-300 font-mono text-sm">{ord.deliveryPin || '4892'}</strong> to your driver upon handover to complete delivery.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <div className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-mono text-2xl font-black tracking-widest shadow-md">
                          {ord.deliveryPin || '4892'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Route Information */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-600" />
                      Pickup: <strong>{ord.pickupAddress}</strong>
                    </span>
                    <span>➔</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      Drop: <strong>{ord.dropAddress}</strong>
                    </span>
                  </div>

                  {/* Driver Card & Contact if Assigned */}
                  {isAssigned && ord.assignedTo && (
                    <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                          <Bike className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-slate-900">{ord.driverName || 'Driver Partner'}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-800 font-bold">Assigned</span>
                          </div>
                          <p className="text-[11px] text-slate-500">{ord.driverPhone || '+91 9876543210'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${ord.driverPhone || '9876543210'}`}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center gap-1"
                        >
                          <Phone className="w-3.5 h-3.5 text-amber-400" />
                          <span>Call Driver</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => setSelectedChatOrder(ord)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Live Chat ({ord.messages?.length || 0})</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Photo Verification & Approval Card */}
                  {isPhotoReady && ord.billPhotoURL && (
                    <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-2 border-amber-400 shadow-md space-y-4 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Camera className="w-5 h-5 text-amber-600" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                            Driver Uploaded Verification Photo
                          </h4>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900">
                          Action Required
                        </span>
                      </div>

                      <p className="text-xs text-slate-700">
                        Please review the purchase receipt / parcel snapshot below. If accurate, click approve to complete the run ({isPaidOnline ? 'Prepaid via UPI' : 'Pay ₹' + ord.price + ' cash to driver'}).
                      </p>

                      <div className="rounded-2xl overflow-hidden border-2 border-amber-300 bg-slate-900 max-h-64 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ord.billPhotoURL}
                          alt="Bill verification"
                          className="max-h-64 w-auto object-contain"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApproveOrder(ord.id)}
                        className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-xs shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span>Approve & Mark Delivered (Complete Order)</span>
                      </button>
                    </div>
                  )}

                  {/* Completed Confirmation */}
                  {isCompleted && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span><strong>Delivered & Verified:</strong> Order completed successfully ({ord.paymentStatus === 'collected_cash' ? 'Cash Collected' : 'UPI Settled'}).</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600">Settled</span>
                    </div>
                  )}

                  {/* Cancellation if still pending */}
                  {ord.status === 'pending' && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => cancelOrder(ord.id)}
                        className="text-xs font-bold text-red-600 hover:underline"
                      >
                        Cancel Request
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Partner Registration Callout */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-xl border border-emerald-700/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 mt-0.5">
            <Bike className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500 text-slate-950">
                Earn in Rawatbhata
              </span>
              <span className="text-xs text-emerald-300 font-semibold">Verified Local Partners</span>
            </div>
            <h3 className="text-base font-black mt-1">Have a Bike or Auto in Town? Earn Daily</h3>
            <p className="text-xs text-emerald-100/80 mt-0.5 max-w-xl">
              Fulfill local market errands, food parcels, and quick transport runs. Fast payouts directly to your UPI.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={applyAsDriver}
          className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 text-xs font-black transition shadow-lg shadow-emerald-500/25 whitespace-nowrap flex items-center gap-1.5"
        >
          <span>Apply as Driver Partner</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Task Creation Modal / Drawer */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div
              className={`p-6 text-white relative ${
                isCompanionIsolated ? 'bg-gradient-to-r from-purple-700 to-pink-600' : 'bg-gradient-to-r from-amber-500 to-orange-600'
              }`}
            >
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded">
                  {selectedService.name}
                </span>
                {isCompanionIsolated && (
                  <span className="text-[10px] font-black uppercase bg-purple-900/60 px-2 py-0.5 rounded text-purple-200">
                    🔒 Admin Only
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black">
                {isCompanionIsolated ? 'Book Companion / Listening Session' : 'Book Hyperlocal Task'}
              </h3>
              <p className="text-xs text-white/80 mt-0.5">
                {isCompanionIsolated
                  ? 'Private companion and listening session coordinated strictly with Admin.'
                  : 'Fast dispatch to nearest verified driver in Rawatbhata.'}
              </p>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateOrderSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* Category Switcher Tabs */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Service Type
                </label>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {dynamicServices.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleOpenTaskModal(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap font-bold transition flex items-center gap-1 ${
                        activeCategory === cat.id
                          ? 'bg-slate-900 text-white shadow'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>{cat.name.split(' ')[0]} (₹{cat.startingPrice})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Isolation Alert if Companion */}
              {isCompanionIsolated && (
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 flex items-start gap-2.5 text-xs text-purple-800">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 text-purple-600 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Privacy & Security Isolation</strong>
                    <span>
                      This request is masked from all delivery drivers. Only the Admin Desk can see this task to guarantee dignity, safety, and strict privacy.
                    </span>
                  </div>
                </div>
              )}

              {/* Task Title (Delivery / Errand categories only) */}
              {!isCompanionIsolated && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Task Title / Item Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder={`e.g., ${selectedService.name} request or item details`}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Special Instructions / Item Details */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {isCompanionIsolated ? 'Special Instructions (Optional)' : 'Special Instructions / Details (Optional)'}
                </label>
                <textarea
                  rows={isCompanionIsolated ? 3 : 2}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder={
                    isCompanionIsolated
                      ? 'e.g., Please arrive 5 minutes early, or specific conversation preferences.'
                      : 'Add any specific instructions, shop names, or item notes...'
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Meeting Location / Pickup Location */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {isCompanionIsolated ? 'Meeting Location' : 'Pickup / Location'} <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleDetectGpsLocation}
                    disabled={isDetectingGps}
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 transition"
                  >
                    <Crosshair className={`w-3.5 h-3.5 ${isDetectingGps ? 'animate-spin' : ''}`} />
                    <span>{isDetectingGps ? 'Detecting GPS...' : 'Auto-Detect Live GPS'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={pickupAddress}
                  onChange={(e) => {
                    setPickupAddress(e.target.value);
                    if (isCompanionIsolated) setDropAddress(e.target.value);
                  }}
                  placeholder={isCompanionIsolated ? 'Enter meeting spot in Rawatbhata' : 'Enter pickup / starting spot in Rawatbhata'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              {/* Delivery / Destination (Hidden for companion service) */}
              {!isCompanionIsolated && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Delivery / Destination (Optional)
                  </label>
                  <input
                    type="text"
                    value={dropAddress}
                    onChange={(e) => setDropAddress(e.target.value)}
                    placeholder="Drop address in Rawatbhata (defaults to pickup area)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Dynamic Price / Budget */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {isCompanionIsolated ? 'Session Fee / Budget (₹ INR)' : 'Calculated Fair / Budget (₹ INR)'} <span className="text-red-500">*</span>
                  </label>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                    isCompanionIsolated
                      ? 'text-purple-700 bg-purple-50 border-purple-200'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  }`}>
                    {isCompanionIsolated
                      ? `Live Base: ₹${currentCategoryBaseFare} (Admin Session)`
                      : `Live Base: ₹${currentCategoryBaseFare} • ${tripDistanceKm.toFixed(1)} km`}
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-bold text-sm">
                    ₹
                  </div>
                  <input
                    type="number"
                    min={currentCategoryBaseFare}
                    value={price}
                    onChange={(e) => setPrice(Math.max(currentCategoryBaseFare, Number(e.target.value)))}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black focus:border-amber-500 focus:outline-none bg-slate-50"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {isCompanionIsolated
                    ? `Direct Admin Baseline rate (₹${currentCategoryBaseFare}) for dedicated 1-on-1 private companion session.`
                    : `Estimated dynamically from Admin Baseline (₹${currentCategoryBaseFare}) ${tripDistanceKm > 1 ? `+ route distance (${tripDistanceKm.toFixed(1)} km)` : ''}.`}
                </p>
              </div>

              {/* Payment Mode Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Payment Mode <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('upi_instant')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                      selectedPaymentMethod === 'upi_instant'
                        ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-sm ring-2 ring-purple-400/40'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <QrCode className="w-4 h-4 text-purple-700" />
                      <span className="text-[10px] font-black uppercase text-purple-700">UPI Instant</span>
                    </div>
                    <div>
                      <p className="text-xs font-black leading-tight">Direct UPI</p>
                      <p className="text-[9px] text-slate-500 font-normal mt-0.5">GPay/PhonePe/QR</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('cod')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                      selectedPaymentMethod === 'cod'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-sm ring-2 ring-emerald-400/40'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span className="text-[10px] font-black uppercase text-emerald-700">Cash</span>
                    </div>
                    <div>
                      <p className="text-xs font-black leading-tight">Cash (COD)</p>
                      <p className="text-[9px] text-slate-500 font-normal mt-0.5">Pay on delivery</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('razorpay')}
                    className={`p-2.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                      selectedPaymentMethod === 'razorpay'
                        ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold shadow-sm ring-2 ring-purple-400/40'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className="w-4 h-4 text-purple-700" />
                      <span className="text-[10px] font-black uppercase text-purple-700">Cards/Net</span>
                    </div>
                    <div>
                      <p className="text-xs font-black leading-tight">Razorpay</p>
                      <p className="text-[9px] text-slate-500 font-normal mt-0.5">Gateway Desk</p>
                    </div>
                  </button>
                </div>

                {selectedPaymentMethod === 'upi_instant' && (
                  <div className="mt-3 space-y-2.5 p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-purple-700 block">Platform UPI VPA</span>
                        <span className="font-mono font-bold text-slate-800">9649228281@yescred</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setActivePaymentOrder({
                            title: taskTitle || `${selectedService.name} Order`,
                            amount: Number(price) || 40,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-purple-700 text-white text-[11px] font-bold hover:bg-purple-800 shadow flex items-center gap-1"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Scan QR Code (₹{price})</span>
                      </button>
                    </div>

                    {/* 1-Tap UPI App Opener */}
                    <a
                      href={`upi://pay?pa=9649228281@yescred&pn=Rawatbhata%20Hyperlocal&am=${price}&cu=INR&tn=${encodeURIComponent(taskTitle.slice(0, 30) || 'Rawatbhata Run')}`}
                      className="w-full py-2.5 px-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>⚡ Open in GPay / PhonePe / Paytm</span>
                    </a>

                    {/* UTR Input Field */}
                    <div>
                      <label className="block text-[11px] font-bold text-purple-950 uppercase tracking-wider mb-1">
                        12-Digit Transaction UTR / Ref No. <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={upiTransactionRef}
                        onChange={(e) => setUpiTransactionRef(e.target.value)}
                        placeholder="e.g. 428198273612 (from UPI receipt)"
                        className="w-full px-3 py-2 rounded-xl border border-purple-300 text-xs font-mono focus:border-purple-600 focus:outline-none bg-white"
                        required
                      />
                      <p className="text-[10px] text-purple-700 mt-1 font-medium">
                        ⚠️ Enter the 12-digit UTR from GPay/PhonePe/Paytm before placing the task.
                      </p>
                    </div>
                  </div>
                )}

                {selectedPaymentMethod === 'razorpay' && (
                  <div className="mt-3 p-3 rounded-2xl bg-purple-50 border border-purple-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-purple-700 flex-shrink-0" />
                        <div>
                          <p className="font-bold text-purple-950 text-[11px]">Razorpay Payment Gateway</p>
                          <p className="text-[10px] text-purple-700">Online Cards, NetBanking & Auto UPI (Requires live merchant key)</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-purple-200 text-purple-900 rounded-lg">
                        Gateway
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                {(() => {
                  const isUpiValid = selectedPaymentMethod !== 'upi_instant' || upiTransactionRef.trim().length >= 8;
                  const isFormValid = Boolean(pickupAddress.trim() && isUpiValid);

                  return (
                    <button
                      type="submit"
                      disabled={isSubmitting || !isFormValid}
                      className={`w-full py-3.5 px-4 rounded-2xl font-bold text-sm shadow-xl transition flex items-center justify-center gap-2 ${
                        isSubmitting || !isFormValid
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border border-slate-300'
                          : selectedPaymentMethod === 'razorpay'
                          ? 'bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 hover:from-purple-800 hover:to-indigo-800 text-white shadow-purple-600/25 active:scale-98 cursor-pointer'
                          : isCompanionIsolated
                          ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/25 active:scale-98 cursor-pointer'
                          : 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/25 active:scale-98 cursor-pointer'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          <span>{selectedPaymentMethod === 'razorpay' ? 'Opening Razorpay Gateway...' : isCompanionIsolated ? 'Submitting Companion Request...' : 'Broadcasting Task...'}</span>
                        </>
                      ) : (
                        <>
                          {selectedPaymentMethod === 'razorpay' ? (
                            <Zap className="w-4 h-4 text-amber-300" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          <span>
                            {selectedPaymentMethod === 'razorpay'
                              ? `⚡ Pay ₹${price} & Book Task (Razorpay)`
                              : isCompanionIsolated
                              ? `Confirm & Book Companion Session (₹${price})`
                              : selectedPaymentMethod === 'upi_instant'
                              ? `Submit Task with UTR (₹${price})`
                              : `Confirm & Place Task (₹${price})`}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Chat Modal Trigger */}
      {selectedChatOrder && (
        <LiveChatModal
          order={selectedChatOrder}
          onClose={() => setSelectedChatOrder(null)}
        />
      )}

      {/* Payment Modal Trigger */}
      {activePaymentOrder && (
        <PaymentModal
          amount={activePaymentOrder.amount}
          orderTitle={activePaymentOrder.title}
          orderId={activePaymentOrder.id}
          onClose={() => setActivePaymentOrder(null)}
          onSuccess={async (paymentInfo) => {
            if (activePaymentOrder.id) {
              await confirmOrderPayment(activePaymentOrder.id, paymentInfo.transactionRef);
              setSuccessToast(`💳 UPI Payment of ₹${activePaymentOrder.amount} confirmed! (Ref: ${paymentInfo.transactionRef})`);
            } else {
              setSelectedPaymentMethod(paymentInfo.method);
              if (paymentInfo.transactionRef) {
                setUpiTransactionRef(paymentInfo.transactionRef);
              }
              setSuccessToast(`💳 Selected ${paymentInfo.method === 'upi_instant' ? 'UPI Pay' : 'COD'} for new order.`);
            }
            setActivePaymentOrder(null);
            setTimeout(() => setSuccessToast(null), 6000);
          }}
        />
      )}

      {/* Admin Broadcast Alert Modal for Clients */}
      {activeBroadcastModal && (
        <div
          onClick={() => handleDismissBroadcast(activeBroadcastModal.id)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border-2 border-amber-500 space-y-4 relative cursor-default"
          >
            <button
              type="button"
              onClick={() => handleDismissBroadcast(activeBroadcastModal.id)}
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
              {activeBroadcastModal.text}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Issued by: {activeBroadcastModal.senderName || 'Admin Desk'}</span>
              <span>{new Date(activeBroadcastModal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <button
              type="button"
              onClick={() => handleDismissBroadcast(activeBroadcastModal.id)}
              className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-black text-xs shadow-lg shadow-amber-500/30 transition"
            >
              ✓ Got It / Dismiss Notice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
