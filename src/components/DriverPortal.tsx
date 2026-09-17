'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, setDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { Order, OrderStatus, VehicleType, PLATFORM_COMMISSION_FEE, SystemNotification } from '@/lib/types';
import { formatDistance, estimateTravelTimeMinutes } from '@/lib/geo';
import LiveChatModal from '@/components/LiveChatModal';
import { generateWhatsAppLink, formatDriverUpdateWhatsApp } from '@/lib/whatsapp';
import { playNotificationSound, playOrderBellNotification, sendBrowserPushNotification, requestBrowserNotificationPermission, unlockAudioContext } from '@/lib/audio';
import { parseVehicleInfo, formatVehiclePlate, normalizeVehiclePlate } from '@/lib/validation';
import {
  Bike,
  Power,
  MapPin,
  Clock,
  Phone,
  MessageSquare,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Package,
  ShoppingBag,
  Zap,
  Car,
  ChevronRight,
  TrendingUp,
  Image as ImageIcon,
  DollarSign,
  Radio,
  Banknote,
  QrCode,
  Lock,
  Hourglass,
  Bell,
  Edit3,
  ShieldAlert,
  Trash2,
  Navigation,
  Sparkles,
  KeyRound,
  Wallet,
  CreditCard,
  Calendar,
  X
} from 'lucide-react';

const SAMPLE_BILL_PRESETS = [
  { label: 'Grocery Kirana Bill', url: 'https://images.unsplash.com/photo-1583258292688-d0213dc5a3a8?w=500&auto=format&fit=crop&q=80' },
  { label: 'Pharmacy Medicine Bill', url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80' },
  { label: 'Market Food Parcel', url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80' },
];

export default function DriverPortal() {
  const {
    user,
    orders,
    driverPartners,
    isDriverOnline,
    toggleDriverDuty,
    driverLocation,
    declineOrderOffer,
    acceptOrder,
    uploadBillPhoto,
    approveDelivery,
    completeOrderWithPin,
    markCashCollected,
    registerDriverVehicle,
    suspendDriverForBruteForce,
    deleteOrder,
    clearAllOrders,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'completed' | 'payouts'>('available');
  const [selectedChatOrder, setSelectedChatOrder] = useState<Order | null>(null);
  const [pinAttempts, setPinAttempts] = useState<{ [orderId: string]: number }>({});

  // Vehicle Registration Modal State
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState<{
    vehicleType: VehicleType;
    vehicleNumber: string;
    payoutUpiId: string;
    name: string;
    phone: string;
  }>({
    vehicleType: user?.vehicleType || 'bike',
    vehicleNumber: user?.vehicleNumber || '',
    payoutUpiId: user?.payoutUpiId || '',
    name: user?.name || '',
    phone: user?.phoneNumber || '',
  });

  // Photo Upload State per Order
  const [uploadPreview, setUploadPreview] = useState<{ [orderId: string]: string }>({});
  const [isUploading, setIsUploading] = useState<{ [orderId: string]: boolean }>({});
  const [toastNotice, setToastNotice] = useState<{ text: string; isError?: boolean } | null>(null);

  // Separate Dedicated React States for Database-Level Query Separation
  const [availableRuns, setAvailableRuns] = useState<Order[]>([]);
  const [activeRuns, setActiveRuns] = useState<Order[]>([]);
  const [completedRuns, setCompletedRuns] = useState<Order[]>([]);

  // Driver Approval & Verification State
  const currentDriverRecord = driverPartners.find((d) => d.id === user?.uid);
  const isApproved = Boolean(
    user?.isApproved === true ||
    user?.isVerified === true ||
    user?.isDriverVerified === true ||
    user?.status === 'approved' ||
    user?.verified === true ||
    currentDriverRecord?.isApproved === true ||
    currentDriverRecord?.isVerified === true ||
    currentDriverRecord?.isDriverVerified === true ||
    currentDriverRecord?.status === 'approved' ||
    currentDriverRecord?.verified === true
  );
  const isBlocked = user?.status === 'blocked' || currentDriverRecord?.status === 'blocked';

  // Real-time Broadcast Notifications Listener for Drivers (Strict 1-Time Display)
  const [activeBroadcastModal, setActiveBroadcastModal] = useState<SystemNotification | null>(null);
  const [latestActiveNotice, setLatestActiveNotice] = useState<SystemNotification | null>(null);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('rawatbhata_dismissed_driver_notifs');
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
        if (data.target === 'drivers' || data.target === 'all') {
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
          const saved = localStorage.getItem('rawatbhata_dismissed_driver_notifs');
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
      localStorage.setItem('rawatbhata_dismissed_driver_notifs', JSON.stringify(updated));
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
        '🎉 Driver Radar Alerts Active!',
        'You will now receive sound chimes & push alerts on your lock screen for every new ride & delivery in Rawatbhata!'
      );
      setShowPushBanner(false);
    }
  };



  // 2. Database-Level Query Separation: Dual Independent Firestore Streams with Strict Unsubscribe Cleanup
  useEffect(() => {
    let unsubAvailable: (() => void) | null = null;
    let unsubActive: (() => void) | null = null;

    if (isFirebaseConfigured && db) {
      // Query 1: STRICT Available Runs (where status == 'pending')
      const qAvailable = query(
        collection(db, 'orders'),
        where('status', '==', 'pending')
      );
      unsubAvailable = onSnapshot(
        qAvailable,
        (snapshot) => {
          const fetched: Order[] = [];
          const seen = new Set<string>();
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Omit<Order, 'id'>;
            const id = docSnap.id;
            if (
              !seen.has(id) &&
              data.status === 'pending' &&
              data.targetAudience === 'driver_pool' &&
              !data.assignedTo &&
              !data.driverId
            ) {
              seen.add(id);
              fetched.push({ id, ...data });
            }
          });
          setAvailableRuns(
            fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          );
        },
        (err) => {
          console.warn('Firestore available runs sync notice:', err);
        }
      );

      // Query 2: STRICT Active Runs for current authenticated driver
      if (user?.uid) {
        const qDriverOrders = query(
          collection(db, 'orders'),
          where('assignedTo', '==', user.uid)
        );
        unsubActive = onSnapshot(
          qDriverOrders,
          (snapshot) => {
            const activeList: Order[] = [];
            const completedList: Order[] = [];
            const seen = new Set<string>();

            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as Omit<Order, 'id'>;
              const id = docSnap.id;
              if (!seen.has(id)) {
                seen.add(id);
                const ordObj = { id, ...data };
                if (['assigned', 'accepted', 'in_progress', 'photo_uploaded'].includes(data.status)) {
                  activeList.push(ordObj);
                } else if (data.status === 'completed') {
                  completedList.push(ordObj);
                }
              }
            });
            setActiveRuns(
              activeList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
            setCompletedRuns(
              completedList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            );
          },
          (err) => {
            console.warn('Firestore driver active runs sync notice:', err);
          }
        );
      }
    } else {
      // Offline / Local fallback
      const publicList = orders.filter((o) => o.targetAudience === 'driver_pool');
      setAvailableRuns(
        publicList.filter((o) => o.status === 'pending' && !o.assignedTo && !o.driverId)
      );
      setActiveRuns(
        publicList.filter(
          (o) =>
            (o.assignedTo === user?.uid || o.driverId === user?.uid) &&
            ['assigned', 'accepted', 'in_progress', 'photo_uploaded'].includes(o.status)
        )
      );
      setCompletedRuns(
        publicList.filter(
          (o) => (o.assignedTo === user?.uid || o.driverId === user?.uid) && o.status === 'completed'
        )
      );
    }

    return () => {
      if (unsubAvailable) unsubAvailable();
      if (unsubActive) unsubActive();
    };
  }, [user?.uid]);

  // Driver Verification State - Real-time Reactive Sync
  const isVerified = isApproved;

  const isolatedCount = orders.filter((o) => o.targetAudience === 'admin_only').length;
  const totalEarnings = completedRuns.reduce((sum, o) => sum + (o.price || 0), 0);

  // Strict Exclusion Guarantee: An order in active or completed runs can NEVER appear in available runs
  const displayedAvailableRuns = availableRuns.filter(
    (av) =>
      !activeRuns.some((ac) => ac.id === av.id) &&
      !completedRuns.some((co) => co.id === av.id) &&
      !av.assignedTo &&
      !av.driverId &&
      av.status === 'pending'
  );

  // Detect Priority Proximity Offer targeted specifically to this driver
  const priorityOfferOrder = orders.find(
    (o) =>
      o.status === 'pending' &&
      o.targetAudience === 'driver_pool' &&
      o.dispatchMode === 'targeted' &&
      o.currentOfferDriverId === user?.uid &&
      (!o.rejectedDrivers || !o.rejectedDrivers.includes(user?.uid || ''))
  );

  const [offerRemainingSeconds, setOfferRemainingSeconds] = useState<number>(45);

  useEffect(() => {
    if (!priorityOfferOrder || !priorityOfferOrder.currentOfferExpiresAt) return;

    playOrderBellNotification();

    const updateTimer = () => {
      const remainingMs = new Date(priorityOfferOrder.currentOfferExpiresAt!).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(remainingMs / 1000));
      setOfferRemainingSeconds(secs);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [priorityOfferOrder?.id, priorityOfferOrder?.currentOfferExpiresAt]);

  const showToast = (text: string, isError = false) => {
    setToastNotice({ text, isError });
    setTimeout(() => setToastNotice(null), 6000);
  };

  // Audio Chime & Browser Push on New Incoming Orders
  const prevAvailableIdsRef = useRef<Set<string>>(new Set());
  const isInitialDriverRunsLoad = useRef(true);

  useEffect(() => {
    const currentIds = new Set(displayedAvailableRuns.map((r) => r.id));

    if (isInitialDriverRunsLoad.current) {
      prevAvailableIdsRef.current = currentIds;
      isInitialDriverRunsLoad.current = false;
      return;
    }

    const prevIds = prevAvailableIdsRef.current;
    const newRuns = displayedAvailableRuns.filter((r) => !prevIds.has(r.id));

    if (newRuns.length > 0 && isDriverOnline) {
      playNotificationSound('order_created');
      const latestRun = newRuns[0];
      showToast(`🔔 New Run Available: ₹${latestRun.price} • ${latestRun.title} (${latestRun.pickupAddress})`);
      sendBrowserPushNotification('🔔 New Delivery Run in Rawatbhata!', `₹${latestRun.price} • ${latestRun.title} at ${latestRun.pickupAddress}`);
    }

    prevAvailableIdsRef.current = currentIds;
  }, [displayedAvailableRuns, isDriverOnline]);

  // Reactive Chat Messages Watcher for Driver
  const prevDriverMsgCountsRef = useRef<Map<string, number>>(new Map());
  const isInitialDriverMsgCountLoad = useRef(true);

  useEffect(() => {
    const allDriverRuns = [...activeRuns, ...completedRuns];
    if (isInitialDriverMsgCountLoad.current) {
      const initMap = new Map<string, number>();
      allDriverRuns.forEach((o) => initMap.set(o.id, o.messages?.length || 0));
      prevDriverMsgCountsRef.current = initMap;
      isInitialDriverMsgCountLoad.current = false;
      return;
    }

    const prevMap = prevDriverMsgCountsRef.current;
    allDriverRuns.forEach((ord) => {
      const prevCount = prevMap.get(ord.id) || 0;
      const currentCount = ord.messages?.length || 0;
      if (currentCount > prevCount && ord.messages) {
        const latestMsg = ord.messages[currentCount - 1];
        if (latestMsg && latestMsg.senderId !== user?.uid && latestMsg.senderRole !== 'driver') {
          playNotificationSound('bell');
          const senderTitle = latestMsg.senderRole === 'admin' ? 'Admin Desk' : (ord.clientName || 'Customer');
          showToast(`💬 ${senderTitle}: "${latestMsg.text}"`);
          sendBrowserPushNotification(`💬 Message from ${senderTitle}`, latestMsg.text);
        }
      }
    });

    const nextMap = new Map<string, number>();
    allDriverRuns.forEach((o) => nextMap.set(o.id, o.messages?.length || 0));
    prevDriverMsgCountsRef.current = nextMap;
  }, [activeRuns, completedRuns, user?.uid]);

  // Handle Save Vehicle Form
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleForm.vehicleNumber.trim() || !vehicleForm.payoutUpiId.trim()) {
      showToast('❌ Please provide both Vehicle Registration Number and Payout UPI ID.', true);
      return;
    }

    const cleanPlate = normalizeVehiclePlate(vehicleForm.vehicleNumber);
    const duplicatePartner = driverPartners.find(
      (d) =>
        d.id !== user?.uid &&
        d.vehicleNumber &&
        normalizeVehiclePlate(d.vehicleNumber) === cleanPlate
    );

    if (duplicatePartner) {
      showToast(`🚫 Conflict: Vehicle "${formatVehiclePlate(cleanPlate)}" is already registered to "${duplicatePartner.name}".`, true);
      alert(`Vehicle Already Registered: Vehicle number ${formatVehiclePlate(cleanPlate)} is already registered by another driver partner (${duplicatePartner.name}). Two drivers cannot register the same vehicle.`);
      return;
    }

    try {
      await registerDriverVehicle({
        vehicleType: vehicleForm.vehicleType,
        vehicleNumber: formatVehiclePlate(vehicleForm.vehicleNumber) || vehicleForm.vehicleNumber,
        payoutUpiId: vehicleForm.payoutUpiId,
        name: vehicleForm.name,
        phone: vehicleForm.phone,
      });
      setShowVehicleModal(false);
      showToast('✅ Partner Vehicle & Payout UPI details saved successfully!');
    } catch (err: any) {
      console.error('Error registering vehicle:', err);
      showToast(`❌ Registration Failed: ${err.message || 'Error saving vehicle'}`, true);
      alert(err.message || 'Could not save vehicle details.');
    }
  };

  const handleAcceptOrder = async (orderId: string) => {
    if (!orderId) {
      showToast('❌ Invalid Order ID. Please select a valid run.', true);
      return;
    }
    if (!isVerified) {
      showToast('❌ Account pending Admin Verification. Contact Admin Desk to unlock acceptance.', true);
      alert('Verification Required: Your driver partner account is pending admin verification. Please switch to Admin mode or contact admin to verify.');
      return;
    }

    const target = availableRuns.find((o) => o.id === orderId) || orders.find((o) => o.id === orderId);
    if (!target) {
      showToast('❌ Selected run is no longer available in the pool.', true);
      return;
    }

    const currentDriverUid = user?.uid || 'drv_active';
    const optimisticAcceptedOrder: Order = {
      ...target,
      status: 'assigned',
      assignedTo: currentDriverUid,
      driverId: currentDriverUid,
      driverName: user?.name || 'Driver Partner',
      driverPhone: user?.phoneNumber || '9876543210',
      driverPhoto: user?.photoURL || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    };

    // 1. Instantly remove from availableRuns state
    setAvailableRuns((prev) => prev.filter((o) => o.id !== orderId));

    // 2. Instantly add to activeRuns state
    setActiveRuns((prev) => [
      optimisticAcceptedOrder,
      ...prev.filter((o) => o.id !== orderId),
    ]);

    // 3. Switch immediately to Active Runs tab
    setActiveTab('active');

    try {
      // Direct Firestore Force Write with explicit status: 'assigned' and driverId
      if (isFirebaseConfigured && db && user?.uid) {
        const orderRef = doc(db, 'orders', orderId);
        await setDoc(
          orderRef,
          {
            status: 'assigned',
            driverId: user.uid,
            assignedTo: user.uid,
            driverName: user.name || 'Driver Partner',
            driverPhone: user.phoneNumber || '9876543210',
            driverPhoto: user.photoURL || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
            updatedAt: new Date().toISOString(),
            acceptedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
      await acceptOrder(orderId);
      showToast('✅ Run locked to your profile! Heading to pickup.');
    } catch (err: any) {
      console.error('Error accepting order:', err);
      // Revert optimistic update on failure
      setAvailableRuns((prev) => [target, ...prev.filter((o) => o.id !== orderId)]);
      setActiveRuns((prev) => prev.filter((o) => o.id !== orderId));
      showToast(`❌ Failed to accept order: ${err.message || 'Database write error'}`, true);
      alert(`Could not accept run: ${err.message || 'Unknown database error'}. Please check your connection or contact Admin.`);
    }
  };

  // Handle Photo Selection via File Input
  const handleFileChange = (orderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadPreview((prev) => ({ ...prev, [orderId]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Photo Preset Select
  const handlePresetSelect = (orderId: string, url: string) => {
    setUploadPreview((prev) => ({ ...prev, [orderId]: url }));
  };

  // Submit Photo Action
  const handleSubmitBillPhoto = async (orderId: string) => {
    const photo = uploadPreview[orderId];
    if (!photo) return;

    setIsUploading((prev) => ({ ...prev, [orderId]: true }));
    try {
      await uploadBillPhoto(orderId, photo);
      showToast(`📸 Verification photo submitted! Client notified for delivery approval.`);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setIsUploading((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  // Secure Delivery PIN Modal State
  const [pinModalOrder, setPinModalOrder] = useState<Order | null>(null);
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);

  const handleOpenPinModal = (order: Order) => {
    setPinModalOrder(order);
    setEnteredPin('');
    setPinError(null);
  };

  const handleVerifyAndCompleteRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalOrder) return;

    const currentOrderId = pinModalOrder.id;
    const currentAttempts = pinAttempts[currentOrderId] || 0;

    // Check if already locked out
    if (currentAttempts >= 5 || isBlocked || user?.isSuspended) {
      setPinError('🚫 ACCOUNT LOCKED: Exceeded maximum allowed PIN attempts. Your driver account is suspended. Contact Admin.');
      return;
    }

    const cleanPin = enteredPin.trim();
    if (!cleanPin || cleanPin.length !== 4) {
      setPinError('Please enter the 4-digit Delivery PIN provided by the client.');
      return;
    }

    setIsVerifyingPin(true);
    setPinError(null);

    try {
      await completeOrderWithPin(currentOrderId, cleanPin);

      // Reset attempts on successful verification
      setPinAttempts((prev) => {
        const next = { ...prev };
        delete next[currentOrderId];
        return next;
      });

      // Optimistically move order from activeRuns to completedRuns
      const completedOrder: Order = {
        ...pinModalOrder,
        status: 'completed',
        completedAt: new Date().toISOString(),
      };

      setActiveRuns((prev) => prev.filter((o) => o.id !== currentOrderId));
      setCompletedRuns((prev) => [completedOrder, ...prev.filter((o) => o.id !== currentOrderId)]);

      playOrderBellNotification();
      const netPayout = Math.max(0, (pinModalOrder.price || 0) - PLATFORM_COMMISSION_FEE);
      showToast(`🎉 Delivery confirmed with PIN ${cleanPin}! ₹${netPayout} credited to your earnings.`);
      setPinModalOrder(null);
      setEnteredPin('');
    } catch (err: any) {
      const nextAttempts = currentAttempts + 1;
      setPinAttempts((prev) => ({ ...prev, [currentOrderId]: nextAttempts }));

      if (nextAttempts >= 5) {
        // Trigger automated Anti-Brute-Force Lockout
        await suspendDriverForBruteForce(user?.uid || '', currentOrderId);
        const lockMsg = '🚫 SECURITY LOCKOUT: You entered an incorrect PIN 5 times. Your driver account is now suspended and flagged for anti-fraud review. Contact Admin Desk.';
        setPinError(lockMsg);
        showToast('🚨 Driver Account Suspended for Multiple Failed PIN Attempts!', true);
      } else {
        const attemptsLeft = 5 - nextAttempts;
        const errMsg = `❌ Invalid Delivery PIN. You have ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before your driver account is suspended.`;
        setPinError(errMsg);
        showToast(`❌ Wrong PIN! (${attemptsLeft} attempts left)`, true);
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Priority Nearest-Run Offer Alert Modal */}
      {priorityOfferOrder && isDriverOnline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border-2 border-amber-500 space-y-4 relative overflow-hidden">
            {/* Countdown Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-100">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-1000 ease-linear"
                style={{ width: `${Math.min(100, (offerRemainingSeconds / 45) * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300">
                  Exclusive Nearest Partner Offer
                </span>
              </div>
              <span className="text-xs font-mono font-black text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg border border-red-200">
                ⏱️ {offerRemainingSeconds}s left
              </span>
            </div>

            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-black text-slate-900">{priorityOfferOrder.title}</h3>
                <span className="text-lg font-black text-emerald-600">₹{priorityOfferOrder.price}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{priorityOfferOrder.description}</p>
            </div>

            {/* Proximity / Distance Box */}
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span className="flex items-center gap-1.5 text-amber-900">
                  <MapPin className="w-4 h-4 text-amber-600" />
                  Pickup: {priorityOfferOrder.pickupAddress}
                </span>
                <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md font-extrabold text-[11px]">
                  📍 {formatDistance(priorityOfferOrder.currentOfferDriverDistance || 0.4)} (~{estimateTravelTimeMinutes(priorityOfferOrder.currentOfferDriverDistance || 0.4)} min)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>Drop: {priorityOfferOrder.dropAddress}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={async () => {
                  await declineOrderOffer(priorityOfferOrder.id);
                  showToast('⏭️ Order passed. Cascading to next nearest driver partner.');
                }}
                className="py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
              >
                Pass / Decline
              </button>

              <button
                type="button"
                onClick={async () => {
                  await handleAcceptOrder(priorityOfferOrder.id);
                }}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Accept Run (₹{priorityOfferOrder.price})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notice */}
      {toastNotice && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md text-white p-4 rounded-2xl shadow-2xl border flex items-start gap-3 animate-in slide-in-from-bottom-5 duration-200 ${
            toastNotice.isError
              ? 'bg-red-950 border-red-700 text-red-200'
              : 'bg-slate-900 border-slate-700 text-white'
          }`}
        >
          <div
            className={`p-1 rounded-lg mt-0.5 ${
              toastNotice.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}
          >
            {toastNotice.isError ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold">{toastNotice.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
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
        <div className="p-4 rounded-3xl bg-slate-900 border border-emerald-500/40 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-black text-white">
                📲 Driver Radar Lock-Screen & Status Bar Notifications
              </p>
              <p className="text-[11px] text-slate-400">
                Allow notifications to receive high-demand delivery alerts and sound chimes on your phone even when the screen is locked.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={handleAllowPush}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 text-xs font-black transition shadow-md shadow-emerald-500/20 flex items-center gap-1.5"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Allow Radar Alerts</span>
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

      {/* Driver Header & Duty Switch */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-emerald-700/30">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-[10px] font-black uppercase tracking-wider text-slate-950">
                Driver Partner Desk
              </span>
              <span className="flex items-center gap-1 text-xs text-emerald-200">
                <Radio className={`w-3.5 h-3.5 ${isDriverOnline ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                {isDriverOnline ? 'Online • Ready for Runs' : 'Offline • Rest Mode'}
              </span>
              {isDriverOnline && (
                <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Navigation className="w-3 h-3 text-emerald-400 animate-spin" />
                  GPS Tracking: {driverLocation?.spotName || 'Rawatbhata Area'}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Pilot Portal: {user?.name}</h1>
            <p className="text-xs text-emerald-100 mt-1">
              Rawatbhata Hyperlocal Dispatch & Verification Console.
            </p>
          </div>

          {/* Duty Toggle Button */}
          <div className="flex items-center gap-3 bg-emerald-950/70 p-2 rounded-2xl border border-emerald-500/30">
            <span className="text-xs font-bold px-2 text-slate-200">
              {isBlocked ? '🔴 BLOCKED' : !isApproved ? '⏳ APPROVAL PENDING' : isDriverOnline ? '🟢 ON DUTY' : '🔴 OFF DUTY'}
            </span>
            <button
              type="button"
              disabled={!isApproved || isBlocked}
              onClick={toggleDriverDuty}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md ${
                !isApproved || isBlocked
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                  : isDriverOnline
                  ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{isBlocked ? '🚫 Blocked' : !isApproved ? '⏳ Approval Pending' : isDriverOnline ? 'Go Offline' : 'Go Online'}</span>
            </button>
          </div>
        </div>

        {/* Approval / Blocking Warning Banners */}
        {isBlocked ? (
          <div className="mt-4 p-4 rounded-2xl bg-red-950/90 border-2 border-red-500 text-red-200 flex items-start gap-3 shadow-lg">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-black text-white">🚫 Account Blocked by Admin</h4>
              <p className="text-xs text-red-200 mt-0.5">
                Your driver partner account has been suspended by Admin. You cannot go online or claim delivery runs. Please reach out to Admin Desk.
              </p>
            </div>
          </div>
        ) : !isApproved ? (
          <div className="mt-4 p-4 rounded-2xl bg-amber-950/90 border-2 border-amber-400 text-amber-200 flex items-start gap-3 shadow-lg">
            <Hourglass className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
            <div>
              <h4 className="text-sm font-black text-amber-300">⚠️ Account Pending Admin Approval</h4>
              <p className="text-xs text-amber-200 mt-0.5">
                Your partner registration is pending Admin verification. You cannot go online yet. Once the Admin verifies your vehicle and details, your duty toggle will unlock automatically.
              </p>
            </div>
          </div>
        ) : null}

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-emerald-700/40">
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-300 block">Available Runs</span>
            <span className="text-xl sm:text-2xl font-black text-white">{displayedAvailableRuns.length}</span>
          </div>
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-amber-300 block">Active Runs</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400">{activeRuns.length}</span>
          </div>
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-emerald-300 block">Total Earnings</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400">₹{totalEarnings}</span>
          </div>
        </div>

        {/* Partner Vehicle & Audio Chime Control Bar */}
        <div className="mt-4 pt-4 border-t border-emerald-700/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/20 p-3 rounded-2xl">
          <div className="flex items-center gap-2 text-xs">
            {user?.vehicleNumber ? (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                  <Bike className="w-3.5 h-3.5" />
                  <span className="capitalize">{user.vehicleType || 'Bike'}</span> • {user.vehicleNumber}
                </span>
                <span className="text-emerald-200/80 font-mono text-[11px]">
                  UPI: {user.payoutUpiId || 'Not set'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-300 font-medium">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Vehicle details & Payout UPI required for automated settlements.</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={async () => {
                if (confirm('Clear all test runs and reset available/active counts to 0?')) {
                  await clearAllOrders();
                  setAvailableRuns([]);
                  setActiveRuns([]);
                  setCompletedRuns([]);
                  showToast('🧹 All test runs cleared from database!');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold transition flex items-center gap-1.5 border border-red-500/30"
              title="Clear all test runs from database"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Clear Test Runs</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playOrderBellNotification();
                showToast('🔔 Web Audio Bell Chime Tested!');
              }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5"
              title="Test audio chime sound"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>Test Bell</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setVehicleForm({
                  vehicleType: user?.vehicleType || 'bike',
                  vehicleNumber: user?.vehicleNumber || '',
                  payoutUpiId: user?.payoutUpiId || '',
                  name: user?.name || '',
                  phone: user?.phoneNumber || '',
                });
                setShowVehicleModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{user?.vehicleNumber ? 'Edit Vehicle' : 'Register Vehicle'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Verification Gatekeeper Warning / Verified Confirmation */}
      {!isVerified ? (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border-2 border-amber-500/40 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 mt-0.5">
              <Hourglass className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                ⏳ Driver Partner Application Under Review
              </h3>
              <p className="text-xs text-slate-600 mt-0.5 max-w-xl leading-relaxed">
                Your driver partner profile has been registered and is pending verification from the <strong>Rawatbhata Admin Desk</strong>. You can browse active runs, but order acceptance is locked until verified.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
              Pending Admin Approval
            </span>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-900 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-emerald-500 text-white">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold">Verified Delivery Partner:</span> Instant run claiming and dispatch acceptance active across Rawatbhata.
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 font-bold text-emerald-800 border border-emerald-200 whitespace-nowrap">
            ✓ Verified Partner
          </span>
        </div>
      )}

      {/* Task Isolation Badge Notice */}
      <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-800">
        <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Strict Driver Protocol:</strong> This feed is tuned exclusively for market errands, food pickups, kirana orders, and local rides.
          {isolatedCount > 0 && (
            <span className="ml-1 text-amber-900 font-semibold">
              ({isolatedCount} Companion/Listening request isolated directly to Admin desk).
            </span>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('available')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'available'
              ? 'bg-slate-900 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Available Runs ({displayedAvailableRuns.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 relative ${
            activeTab === 'active'
              ? 'bg-amber-500 text-slate-950 shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>My Active Runs ({activeRuns.length})</span>
          {activeRuns.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute -top-1 -right-1" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'completed'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Completed History ({completedRuns.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('payouts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'payouts'
              ? 'bg-emerald-800 text-white shadow'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Wallet className="w-3.5 h-3.5 text-amber-400" />
          <span>💰 Weekly Payouts</span>
        </button>
      </div>

      {/* 1. AVAILABLE RUNS TAB */}
      {activeTab === 'available' && (
        <section className="space-y-4">
          {!isDriverOnline ? (
            <div className="p-10 rounded-3xl bg-white border border-slate-200 text-center space-y-3">
              <Power className="w-10 h-10 mx-auto text-red-400" />
              <h3 className="text-sm font-bold text-slate-800">You are currently OFFLINE</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Toggle your duty switch above to go online and receive live order dispatches in Rawatbhata.
              </p>
              <button
                type="button"
                onClick={toggleDriverDuty}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow hover:bg-emerald-500 transition"
              >
                Go Online Now
              </button>
            </div>
          ) : displayedAvailableRuns.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white border-2 border-dashed border-slate-200 text-center space-y-2">
              <Bike className="w-10 h-10 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-800">No open runs available in Rawatbhata</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Switch role to Client in the top navigation bar to create test errand, food, or grocery orders.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedAvailableRuns.map((ord) => {
                const isPaid = ord.paymentStatus === 'paid_online';
                return (
                  <div
                    key={ord.id}
                    className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {ord.categoryLabel}
                          </span>
                          {ord.paymentStatus === 'pending_verification' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 flex items-center gap-0.5 border border-amber-300">
                              <AlertCircle className="w-3 h-3 text-amber-600" /> Verify UTR: {ord.utrNumber || ord.transactionRef || 'Pending'}
                            </span>
                          ) : isPaid ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 flex items-center gap-0.5">
                              <QrCode className="w-3 h-3" /> UPI Paid
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-0.5">
                              <Banknote className="w-3 h-3" /> COD Collect
                            </span>
                          )}
                        </div>
                        <span className="text-base font-black text-emerald-600">₹{ord.price}</span>
                      </div>

                      <h3 className="text-sm font-extrabold text-slate-900">{ord.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">{ord.description}</p>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1 text-slate-600">
                        <p className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-amber-600" />
                          <span>Pickup: <strong>{ord.pickupAddress}</strong></span>
                        </p>
                        <p className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Drop: <strong>{ord.dropAddress}</strong></span>
                        </p>
                        <p className="text-[11px] text-slate-400 pt-1">
                          Client: <strong>{ord.clientName}</strong> ({ord.clientPhone || 'Verified'})
                        </p>
                      </div>

                      {/* Earning & Commission Split Engine */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-bold">Total Fare</span>
                          <span className="font-bold text-slate-800">₹{ord.price}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-slate-400 block text-[9px] uppercase font-bold">Platform Fee</span>
                          <span className="font-bold text-amber-600">-₹{PLATFORM_COMMISSION_FEE}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-emerald-600 block text-[9px] uppercase font-black">Net Payout</span>
                          <span className="font-black text-emerald-700 text-sm">
                            ₹{Math.max(0, (ord.price || 0) - PLATFORM_COMMISSION_FEE)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Created: {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (confirm(`Delete test order "${ord.title}" from pool?`)) {
                              await deleteOrder(ord.id);
                              setAvailableRuns((prev) => prev.filter((o) => o.id !== ord.id));
                              showToast('🗑️ Order removed from pool!');
                            }
                          }}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete test order"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        {isVerified ? (
                          <button
                            type="button"
                            onClick={() => handleAcceptOrder(ord.id)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Accept Run</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAcceptOrder(ord.id)}
                            className="px-4 py-2 rounded-xl bg-slate-200 text-slate-500 text-xs font-bold flex items-center gap-1.5 cursor-not-allowed hover:bg-slate-300 transition"
                            title="Admin verification required to accept orders"
                          >
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Verification Required</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 2. MY ACTIVE RUNS TAB */}
      {activeTab === 'active' && (
        <section className="space-y-4">
          {activeRuns.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white border-2 border-dashed border-slate-200 text-center space-y-2">
              <Clock className="w-10 h-10 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-800">No active runs assigned to you</h3>
              <p className="text-xs text-slate-400">Go to the Available Runs tab and accept a delivery task.</p>
              <button
                type="button"
                onClick={() => setActiveTab('available')}
                className="mt-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold shadow hover:bg-amber-400 transition"
              >
                Browse Available Runs
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {activeRuns.map((ord) => {
                const isPhotoUploaded = ord.status === 'photo_uploaded';
                const currentPreview = uploadPreview[ord.id] || ord.billPhotoURL;
                const isPendingVerification = ord.paymentStatus === 'pending_verification';
                const isPaidOnline = ord.paymentStatus === 'paid_online';
                const isCashCollected = ord.paymentStatus === 'collected_cash';

                return (
                  <div
                    key={ord.id}
                    className="p-6 rounded-3xl bg-white border-2 border-amber-400 shadow-lg space-y-5"
                  >
                    {/* Header & Status Indicator */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                            Active Run in Progress
                          </span>
                          <span className="text-xs font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {ord.categoryLabel}
                          </span>
                          <span className="text-xs font-bold text-slate-400">• ID: {ord.id.slice(-6)}</span>
                        </div>
                        <h2 className="text-base font-black text-slate-900 mt-1.5">{ord.title}</h2>

                        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <span className="font-bold text-amber-900 text-[10px] tracking-wider uppercase">Items to Pick Up:</span>
                          <p className="text-slate-800 text-sm font-medium whitespace-pre-wrap mt-1">{ord.description || "No items listed."}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-[10px] text-slate-400 block font-bold uppercase">Net Payout (₹{ord.price} - ₹{PLATFORM_COMMISSION_FEE})</span>
                        <span className="text-xl font-black text-emerald-600">
                          ₹{Math.max(0, (ord.price || 0) - PLATFORM_COMMISSION_FEE)}
                        </span>
                      </div>
                    </div>

                    {/* Payment Instruction Banner */}
                    <div
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
                        isPendingVerification
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : isPaidOnline
                          ? 'bg-purple-50 border-purple-200 text-purple-900'
                          : isCashCollected
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold">
                        {isPendingVerification ? (
                          <>
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <span>⚠️ Verify UPI Payment - UTR: {ord.utrNumber || ord.transactionRef || 'Pending Submission'} (Verify ₹{ord.price} in Bank/App before delivery)</span>
                          </>
                        ) : isPaidOnline ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                            <span>✓ Online Payment Verified (Ref: {ord.utrNumber || ord.transactionRef || 'Prepaid'})</span>
                          </>
                        ) : isCashCollected ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            <span>✓ Cash of ₹{ord.price} Collected in Full</span>
                          </>
                        ) : (
                          <>
                            <Banknote className="w-4 h-4 text-amber-600 flex-shrink-0" />
                            <span>Cash on Delivery: Please collect ₹{ord.price} physical cash from client upon handover</span>
                          </>
                        )}
                      </div>

                      {!isPaidOnline && !isCashCollected && (
                        <button
                          type="button"
                          onClick={() => {
                            markCashCollected(ord.id);
                            showToast(`💵 Payment of ₹${ord.price} verified & marked collected for order ${ord.id.slice(-6)}!`);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs shadow-sm transition whitespace-nowrap"
                        >
                          {ord.paymentMethod === 'UPI' || ord.paymentMethod === 'upi_instant' ? 'Mark UPI Verified' : 'Mark Cash Collected'}
                        </button>
                      )}
                    </div>

                    {/* Step-by-Step Workflow Tracker */}
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
                      <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>1. Order Locked</span>
                      </div>
                      <div
                        className={`p-2 rounded-xl border flex items-center justify-center gap-1 ${
                          isPhotoUploaded
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                        }`}
                      >
                        {isPhotoUploaded ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Camera className="w-3.5 h-3.5 text-amber-600" />}
                        <span>2. Photo Verify</span>
                      </div>
                      <div
                        className={`p-2 rounded-xl border flex items-center justify-center gap-1 ${
                          isPhotoUploaded
                            ? 'bg-purple-50 text-purple-800 border-purple-200'
                            : 'bg-slate-100 text-slate-400 border-slate-200'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>3. Client Approval</span>
                      </div>
                    </div>

                    {/* Client Details & Contact Buttons */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1 text-xs">
                        <p className="text-slate-500">Client: <strong className="text-slate-900">{ord.clientName}</strong></p>
                        <p className="text-slate-500">Pickup: <strong className="text-slate-900">{ord.pickupAddress}</strong></p>
                        <p className="text-slate-500">Drop: <strong className="text-slate-900">{ord.dropAddress}</strong></p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <a
                          href={`tel:${ord.clientPhone || '9876543210'}`}
                          className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Phone className="w-3.5 h-3.5 text-amber-400" />
                          <span>Call</span>
                        </a>

                        <a
                          href={generateWhatsAppLink(
                            ord.clientPhone || '9876543210',
                            formatDriverUpdateWhatsApp(ord, user?.name || 'Driver Partner', user?.phoneNumber)
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                          title="Send instant WhatsApp delivery update to client"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-200" />
                          <span>WhatsApp Update</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => setSelectedChatOrder(ord)}
                          className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Live Chat ({ord.messages?.length || 0})</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (confirm(`Delete test run "${ord.title}"? This will remove it from active runs.`)) {
                              await deleteOrder(ord.id);
                              setActiveRuns((prev) => prev.filter((o) => o.id !== ord.id));
                              showToast(`🗑️ Test run "${ord.title}" removed!`);
                            }
                          }}
                          className="flex-1 sm:flex-none px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
                          title="Delete this test run"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          <span>Delete Run</span>
                        </button>
                      </div>
                    </div>

                    {/* Bill / Item Photo Verification Card */}
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/50 to-orange-50/30 border border-amber-200 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Camera className="w-5 h-5 text-amber-600" />
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                            Bill / Parcel Photo Verification
                          </h3>
                        </div>
                        {isPhotoUploaded ? (
                          <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Submitted to Client
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-amber-200 text-amber-900">
                            Required for Approval
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        Snap or select the store bill / parcel image before final delivery so the client can verify item costs and quality.
                      </p>

                      {/* Photo Preview if selected or uploaded */}
                      {currentPreview && (
                        <div className="relative rounded-2xl overflow-hidden border-2 border-amber-400 bg-slate-900 max-h-56 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={currentPreview}
                            alt="Bill verification"
                            className="max-h-56 w-auto object-contain"
                          />
                          <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-slate-900/80 backdrop-blur-sm text-[10px] font-bold text-white">
                            {isPhotoUploaded ? 'Attached to Order' : 'Preview Ready'}
                          </div>
                        </div>
                      )}

                      {/* Photo Upload Controls */}
                      {!isPhotoUploaded && (
                        <div className="space-y-3 pt-2">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                              Option A: Snap Photo / Choose from Device
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => handleFileChange(ord.id, e)}
                              className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-slate-800 cursor-pointer"
                            />
                          </div>

                          <div>
                            <span className="text-[11px] font-bold text-slate-600 block mb-1">
                              Option B: Quick Simulation Presets
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {SAMPLE_BILL_PRESETS.map((preset, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handlePresetSelect(ord.id, preset.url)}
                                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition ${
                                    uploadPreview[ord.id] === preset.url
                                      ? 'border-amber-500 bg-amber-100 text-amber-900 font-bold'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  + {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!uploadPreview[ord.id] || isUploading[ord.id]}
                            onClick={() => handleSubmitBillPhoto(ord.id)}
                            className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isUploading[ord.id] ? (
                              <>
                                <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                                <span>Uploading Verification Photo...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4" />
                                <span>Submit Verification Photo for Client Approval</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {isPhotoUploaded && (
                        <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 flex items-center gap-2 text-xs text-purple-900">
                          <Clock className="w-4 h-4 text-purple-600 animate-spin" />
                          <span>
                            Photo delivered to client. Ready for handoff & PIN verification.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Complete Run & Secure Handover PIN Button */}
                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-amber-50/50 p-4 rounded-2xl border border-amber-200">
                      <div className="flex items-center gap-2 text-xs text-slate-700">
                        <KeyRound className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>Ask client for their 4-digit Delivery PIN to complete handover and claim <strong>₹{Math.max(0, (ord.price || 0) - PLATFORM_COMMISSION_FEE)}</strong>.</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenPinModal(ord)}
                        className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>Complete Run (Enter PIN)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3. COMPLETED RUNS TAB */}
      {activeTab === 'completed' && (
        <section className="space-y-4">
          {completedRuns.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white border-2 border-dashed border-slate-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-slate-300" />
              <h3 className="text-sm font-bold text-slate-800">No completed runs yet</h3>
              <p className="text-xs text-slate-400">Complete delivery runs to earn money in Rawatbhata.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completedRuns.map((ord) => (
                <div key={ord.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900">{ord.title}</span>
                    <span className="text-sm font-black text-emerald-600">+ ₹{ord.price}</span>
                  </div>
                  {ord.description && (
                    <p className="text-xs text-slate-600 font-medium">{ord.description}</p>
                  )}
                  <p className="text-xs text-slate-500">Delivered to: {ord.dropAddress}</p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Client: {ord.clientName}</span>
                    <span className="text-emerald-700 font-bold">
                      {ord.paymentStatus === 'collected_cash' ? '✓ Cash Collected' : '✓ Paid via UPI'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 4. WEEKLY PAYOUTS & REMITTANCE TAB */}
      {activeTab === 'payouts' && (
        <section className="space-y-6">
          {(() => {
            const onlineCompleted = completedRuns.filter(
              (o) =>
                o.paymentMethod === 'upi_instant' ||
                o.paymentMethod === 'UPI' ||
                o.paymentStatus === 'paid_online'
            );
            const cashCompleted = completedRuns.filter(
              (o) =>
                o.paymentMethod === 'cod' ||
                o.paymentMethod === 'COD' ||
                o.paymentStatus === 'collected_cash'
            );

            const onlineEarnings = onlineCompleted.reduce(
              (sum, o) => sum + Math.max(0, (Number(o.price) || 50) - PLATFORM_COMMISSION_FEE),
              0
            );
            const cashTotalCollected = cashCompleted.reduce(
              (sum, o) => sum + (Number(o.price) || 50),
              0
            );
            const cashCommissionOwed = cashCompleted.length * PLATFORM_COMMISSION_FEE;
            const totalCommission = completedRuns.length * PLATFORM_COMMISSION_FEE;
            const netWeeklyDue = onlineEarnings - cashCommissionOwed;

            return (
              <div className="space-y-6">
                {/* Payout Header & Schedule Banner */}
                <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white border border-emerald-500/40 shadow-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-2xl bg-emerald-500 text-slate-950 font-black">
                        <Wallet className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Automated Weekly Remittance
                        </span>
                        <h3 className="text-base font-black text-white mt-0.5">
                          Weekly Partner Settlement Ledger
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white/10 text-emerald-200 border border-white/10 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                        Payout Cycle: Sunday / Monday
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-300 leading-relaxed">
                    💡 <strong>How You Get Paid:</strong> For online orders (UPI), clients pay directly to the platform. We hold your earnings (<code>Price - ₹5</code>) and remit them weekly to your registered Payout UPI ID. For cash orders (COD), you keep the cash in hand and the flat ₹5 platform fee is adjusted against your online earnings.
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Completed</span>
                    <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
                      {completedRuns.length} runs
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">Deliveries done</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Online Earnings (Admin)</span>
                    <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block">
                      ₹{onlineEarnings}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-medium">{onlineCompleted.length} online runs</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">Cash Collected in Hand</span>
                    <span className="text-xl sm:text-2xl font-black text-amber-800 mt-1 block">
                      ₹{cashTotalCollected}
                    </span>
                    <span className="text-[10px] text-amber-600 font-medium">{cashCompleted.length} cash runs (Keep cash)</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-purple-700 block">Net Payout Due</span>
                    <span className="text-xl sm:text-2xl font-black text-purple-900 mt-1 block">
                      ₹{netWeeklyDue}
                    </span>
                    <span className="text-[10px] text-purple-700 font-medium">
                      {netWeeklyDue > 0 ? 'To receive on UPI' : netWeeklyDue < 0 ? 'Cash fee adjustment' : 'Settled'}
                    </span>
                  </div>
                </div>

                {/* Linked Payout UPI ID Box */}
                <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-purple-100 text-purple-800">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-400">Registered Payout Account</span>
                      <h4 className="text-sm font-black text-slate-900 font-mono">
                        {user?.payoutUpiId || '⚠️ No Payout UPI ID Set'}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Remittances are sent to this UPI ID (GPay / PhonePe / Paytm).
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setVehicleForm({
                        vehicleType: user?.vehicleType || 'bike',
                        vehicleNumber: user?.vehicleNumber || '',
                        payoutUpiId: user?.payoutUpiId || '',
                        name: user?.name || '',
                        phone: user?.phoneNumber || '',
                      });
                      setShowVehicleModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{user?.payoutUpiId ? 'Change UPI ID' : 'Set Payout UPI ID'}</span>
                  </button>
                </div>

                {/* Individual Completed Runs Earnings Breakdown Table */}
                <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    Completed Runs Ledger Breakdown
                  </h4>

                  {completedRuns.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No completed runs recorded in this cycle.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {completedRuns.map((ord) => {
                        const price = Number(ord.price) || 50;
                        const fee = PLATFORM_COMMISSION_FEE;
                        const net = Math.max(0, price - fee);
                        const isOnline =
                          ord.paymentMethod === 'upi_instant' ||
                          ord.paymentMethod === 'UPI' ||
                          ord.paymentStatus === 'paid_online';

                        return (
                          <div key={ord.id} className="py-3 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-extrabold text-slate-900 block">{ord.title}</span>
                              <span className="text-[11px] text-slate-400">
                                {isOnline ? '💳 Online (UPI)' : '💵 Cash on Delivery'} • Drop: {ord.dropAddress}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-slate-900 block">₹{price} Gross</span>
                              <span className="text-[11px] font-bold text-emerald-600 block">
                                +₹{net} Net (-₹{fee} Platform Fee)
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Live Chat Modal Trigger */}
      {selectedChatOrder && (
        <LiveChatModal
          order={selectedChatOrder}
          onClose={() => setSelectedChatOrder(null)}
        />
      )}

      {/* Complete Run with Client 4-Digit Delivery PIN Modal */}
      {pinModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border-2 border-amber-500 space-y-5 relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-500 text-slate-950 shadow-md">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Security Verification
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 mt-0.5">Enter Delivery PIN (OTP)</h3>
                  <p className="text-xs text-slate-500">
                    Ask client <strong>{pinModalOrder.clientName}</strong> for their 4-digit PIN upon parcel handover.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPinModalOrder(null);
                  setEnteredPin('');
                  setPinError(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            {/* Order Summary Pill */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-900">
                <span>{pinModalOrder.title}</span>
                <span className="text-emerald-600 font-extrabold text-sm">
                  ₹{Math.max(0, (pinModalOrder.price || 0) - PLATFORM_COMMISSION_FEE)} Net
                </span>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                Drop: {pinModalOrder.dropAddress}
              </p>
              {pinModalOrder.paymentStatus !== 'collected_cash' && pinModalOrder.paymentStatus !== 'paid_online' && (
                <p className="text-[11px] font-bold text-amber-800 bg-amber-100/70 px-2 py-1 rounded-lg">
                  💰 Remember to collect ₹{pinModalOrder.price} cash if not already paid!
                </p>
              )}
            </div>

            <form onSubmit={handleVerifyAndCompleteRun} className="space-y-4">
              {(() => {
                const currentOrderId = pinModalOrder.id;
                const attemptsCount = pinAttempts[currentOrderId] || 0;
                const isLockedOut = attemptsCount >= 5 || isBlocked || user?.isSuspended;

                if (isLockedOut) {
                  return (
                    <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-500 space-y-2 text-center animate-in fade-in">
                      <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-black text-red-900">Driver Account Suspended</h4>
                      <p className="text-xs text-red-700 leading-relaxed font-medium">
                        5 consecutive incorrect PIN attempts detected. Your account has been automatically locked for anti-fraud security. Contact Admin Desk to unlock.
                      </p>
                    </div>
                  );
                }

                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                        4-Digit Client Delivery PIN <span className="text-red-500">*</span>
                      </label>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${attemptsCount > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600'}`}>
                        🛡️ Attempt {attemptsCount} / 5
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      autoFocus
                      disabled={isLockedOut}
                      value={enteredPin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setEnteredPin(val);
                        if (pinError) setPinError(null);
                      }}
                      placeholder="• • • •"
                      className="w-full text-center text-3xl font-mono font-black tracking-widest px-4 py-3 rounded-2xl border-2 border-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 focus:outline-none transition disabled:bg-slate-100 disabled:opacity-60"
                      required
                    />
                    {pinError && (
                      <p className="text-xs font-bold text-red-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{pinError}</span>
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinModalOrder(null);
                    setEnteredPin('');
                    setPinError(null);
                  }}
                  className="py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    enteredPin.length !== 4 ||
                    isVerifyingPin ||
                    (pinAttempts[pinModalOrder.id] || 0) >= 5 ||
                    isBlocked ||
                    user?.isSuspended
                  }
                  className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 text-white font-black text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-1.5"
                >
                  {isVerifyingPin ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verify & Finish Run</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicle Registration & Payout UPI Modal */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700">
                  <Bike className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Partner Vehicle & UPI Details</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Required for on-road compliance and automated payout settlements.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVehicleModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVehicle} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Driver Full Name</label>
                <input
                  type="text"
                  required
                  value={vehicleForm.name}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                  placeholder="e.g. Rajesh Meena"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Phone Number</label>
                <input
                  type="tel"
                  required
                  value={vehicleForm.phone}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, phone: e.target.value })}
                  placeholder="10-digit mobile number"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Category</label>
                <select
                  value={vehicleForm.vehicleType}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value as VehicleType })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:border-emerald-500 focus:outline-none bg-white"
                >
                  <option value="bike">🏍️ Motorcycle / Bike</option>
                  <option value="scooty">🛵 Scooty / Moped</option>
                  <option value="auto">🛺 Auto Rickshaw</option>
                  <option value="erickshaw">🔋 E-Rickshaw / Toto</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Vehicle Registration Number <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Auto-Verification Active
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={vehicleForm.vehicleNumber}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleNumber: e.target.value.toUpperCase() })}
                  placeholder="e.g. RJ-20-MB-4512 or RJ20SB1234"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-black uppercase tracking-wider focus:border-emerald-500 focus:outline-none bg-slate-50"
                />

                {/* Live Vehicle Duplicate & Free RTO Intelligence Card */}
                {(() => {
                  const cleanPlate = normalizeVehiclePlate(vehicleForm.vehicleNumber);
                  if (!cleanPlate || cleanPlate.length < 3) return null;

                  const duplicatePartner = driverPartners.find(
                    (d) =>
                      d.id !== user?.uid &&
                      d.vehicleNumber &&
                      normalizeVehiclePlate(d.vehicleNumber) === cleanPlate
                  );

                  const vehicleInfo = parseVehicleInfo(vehicleForm.vehicleNumber, vehicleForm.vehicleType);

                  if (duplicatePartner) {
                    return (
                      <div className="mt-2.5 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1 animate-in fade-in duration-200">
                        <div className="flex items-center gap-1.5 font-bold text-red-700">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>🚫 Vehicle Number Already Registered in System</span>
                        </div>
                        <p className="text-[11px] text-red-600 pl-5">
                          Vehicle <strong>{formatVehiclePlate(cleanPlate)}</strong> is already assigned to driver partner <strong>{duplicatePartner.name}</strong> ({duplicatePartner.phone || 'Verified'}).
                        </p>
                        <p className="text-[10px] text-red-500 pl-5 font-medium">
                          A vehicle can only belong to one active driver partner. Please check your plate number.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-2.5 p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 space-y-1.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center gap-1.5 text-emerald-800">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Vehicle Plate Verified</span>
                        </span>
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200/70 text-emerald-900">
                          {formatVehiclePlate(cleanPlate)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px] border-t border-emerald-200/60">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">RTO Division:</span>
                          <span className="font-bold text-slate-800">{vehicleInfo.rtoZoneName}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase font-bold">Fleet Class:</span>
                          <span className="font-bold text-slate-800">{vehicleInfo.vehicleClassDescription}</span>
                        </div>
                      </div>

                      <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 pt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>100% Unique in Rawatbhata fleet • Ready for dispatch verification</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payout UPI ID (GPay / PhonePe / Paytm)</label>
                <input
                  type="text"
                  required
                  value={vehicleForm.payoutUpiId}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, payoutUpiId: e.target.value.toLowerCase() })}
                  placeholder="e.g. rajesh@upi or 9829012345@paytm"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Platform fees (₹5) are automatically subtracted; balance is remitted directly to this UPI ID.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowVehicleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                {(() => {
                  const cleanPlate = normalizeVehiclePlate(vehicleForm.vehicleNumber);
                  const isDuplicate = Boolean(
                    cleanPlate &&
                    driverPartners.some(
                      (d) =>
                        d.id !== user?.uid &&
                        d.vehicleNumber &&
                        normalizeVehiclePlate(d.vehicleNumber) === cleanPlate
                    )
                  );

                  return (
                    <button
                      type="submit"
                      disabled={isDuplicate || !vehicleForm.vehicleNumber.trim() || !vehicleForm.payoutUpiId.trim()}
                      className={`px-5 py-2.5 rounded-xl text-xs font-black transition shadow-md ${
                        isDuplicate || !vehicleForm.vehicleNumber.trim() || !vehicleForm.payoutUpiId.trim()
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300 shadow-none'
                          : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-emerald-600/20 cursor-pointer'
                      }`}
                    >
                      {isDuplicate ? '🚫 Vehicle Plate Already in Use' : 'Save Partner Vehicle & UPI'}
                    </button>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Broadcast Alert Modal for Drivers */}
      {activeBroadcastModal && (
        <div
          onClick={() => handleDismissBroadcast(activeBroadcastModal.id)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border-2 border-emerald-500 space-y-4 relative cursor-default"
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
              <div className="p-3 rounded-2xl bg-emerald-500 text-slate-950 shadow-md">
                <Bell className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  📢 Admin Broadcast to Drivers
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Message from Admin Desk
                </h3>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 leading-relaxed whitespace-pre-line">
              {activeBroadcastModal.text}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Admin: {activeBroadcastModal.senderName || 'Control Desk'}</span>
              <span>{new Date(activeBroadcastModal.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <button
              type="button"
              onClick={() => handleDismissBroadcast(activeBroadcastModal.id)}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-xs shadow-lg shadow-emerald-600/30 transition"
            >
              ✓ Got It / Dismiss Notice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
