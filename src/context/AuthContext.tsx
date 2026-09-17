'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from '@/lib/firebase';
import {
  UserProfile,
  UserRole,
  UserLocation,
  GeoPoint,
  Order,
  OrderCategory,
  TargetAudience,
  OrderStatus,
  ChatMessage,
  DriverPartnerRecord,
  SystemNotification,
  ServicePriceConfig,
  PaymentMethod,
  PaymentStatus,
  VehicleType,
  PLATFORM_COMMISSION_FEE,
  ADMIN_EMAIL_WHITELIST,
  ADMIN_MASTER_PIN,
  PayoutSettlementRecord
} from '@/lib/types';
import {
  RAWATBHATA_CENTER,
  calculateDistanceKm,
  resolveLocationCoordinates,
  formatDistance,
  findNearestSpotName,
  getCurrentDeviceLocation
} from '@/lib/geo';
import { unlockAudioContext } from '@/lib/audio';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isFirstLogin: boolean;
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  saveOnboardingProfile: (data: {
    name: string;
    phoneNumber: string;
    photoURL?: string;
    role?: UserRole;
    vehicleType?: VehicleType;
    vehicleNumber?: string;
    payoutUpiId?: string;
  }) => Promise<void>;
  switchRole: (newRole: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  orders: Order[];
  createOrder: (orderData: {
    category: OrderCategory;
    categoryLabel: string;
    title: string;
    description: string;
    pickupAddress: string;
    dropAddress: string;
    pickupCoords?: GeoPoint;
    dropCoords?: GeoPoint;
    price: number;
    targetAudience: TargetAudience;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    transactionRef?: string;
    utrNumber?: string;
  }) => Promise<Order>;
  cancelOrder: (orderId: string) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  clearAllOrders: () => Promise<void>;
  // Driver & Order Flow
  isDriverOnline: boolean;
  toggleDriverDuty: () => void;
  driverLocation: UserLocation | null;
  declineOrderOffer: (orderId: string) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  uploadBillPhoto: (orderId: string, photoURL: string) => Promise<void>;
  approveDelivery: (orderId: string) => Promise<void>;
  completeOrderWithPin: (orderId: string, enteredPin: string) => Promise<void>;
  sendChatMessage: (orderId: string, text: string) => Promise<void>;
  applyAsDriver: () => Promise<void>;
  registerDriverVehicle: (data: {
    vehicleType: VehicleType;
    vehicleNumber: string;
    payoutUpiId: string;
    name?: string;
    phone?: string;
  }) => Promise<void>;
  // Admin & Pricing Desk
  servicePrices: { [key in OrderCategory]: number };
  updateServicePrice: (category: OrderCategory, newPrice: number) => Promise<void>;
  driverPartners: DriverPartnerRecord[];
  toggleDriverVerification: (driverId: string) => Promise<void>;
  approveDriver: (driverId: string) => Promise<void>;
  blockDriver: (driverId: string) => Promise<void>;
  deleteDriver: (driverId: string) => Promise<void>;
  suspendDriverForBruteForce: (driverId: string, orderId: string) => Promise<void>;
  sendBroadcastNotification: (target: 'drivers' | 'clients' | 'all', text: string) => Promise<void>;
  deleteBroadcastNotification: (notifId: string) => Promise<void>;
  clearAllBroadcastNotifications: () => Promise<void>;
  adminAcceptCompanionOrder: (orderId: string) => Promise<void>;
  settleDriverPayout: (data: {
    driverId: string;
    driverName: string;
    payoutUpiId: string;
    amount: number;
    completedRunsCount: number;
    paymentRef?: string;
  }) => Promise<void>;
  // Dynamic UPI & COD Payment Flow
  confirmOrderPayment: (orderId: string, transactionRef?: string) => Promise<void>;
  markCashCollected: (orderId: string) => Promise<void>;
  // Security & Admin PIN Passkey
  isAdminAuthenticated: boolean;
  showAdminPinModal: boolean;
  setShowAdminPinModal: (show: boolean) => void;
  requestAdminAccess: () => void;
  verifyAdminPin: (pin: string) => boolean;
  // WhatsApp Support Number Engine
  supportWhatsAppNumber: string;
  updateSupportWhatsAppNumber: (num: string) => Promise<void>;
}

const LOCAL_STORAGE_USER_KEY = 'rawatbhata_user_profile';
const LOCAL_STORAGE_ORDERS_KEY = 'rawatbhata_active_orders';
const LOCAL_STORAGE_DUTY_KEY = 'rawatbhata_driver_duty';
const LOCAL_STORAGE_PRICES_KEY = 'rawatbhata_service_prices';
const LOCAL_STORAGE_DRIVERS_KEY = 'rawatbhata_driver_partners';
const LOCAL_STORAGE_ADMIN_AUTH_KEY = 'rawatbhata_admin_authenticated';
const LOCAL_STORAGE_WHATSAPP_KEY = 'rawatbhata_support_whatsapp';

const DEFAULT_PRICES: { [key in OrderCategory]: number } = {
  errand: 40,
  food: 50,
  delivery: 40,
  ride: 60,
  companion_listening_ghumna: 150,
};

const DEFAULT_DRIVERS: DriverPartnerRecord[] = [];

/**
 * Recursively strips out any `undefined` values from an object or array.
 * Firestore `setDoc` & `updateDoc` throw errors if passed objects with undefined fields.
 */
function sanitizeFirestoreData(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  // Keep Firestore Sentinel objects (e.g. serverTimestamp()) intact
  if (typeof obj.isEqual === 'function' || typeof obj.toMillis === 'function') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeFirestoreData(item)).filter((item) => item !== undefined);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !(value instanceof Date) && typeof (value as any).isEqual !== 'function') {
        clean[key] = sanitizeFirestoreData(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFirstLogin, setIsFirstLogin] = useState<boolean>(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isDriverOnline, setIsDriverOnline] = useState<boolean>(true);
  const [driverLocation, setDriverLocation] = useState<UserLocation | null>(null);
  const [servicePrices, setServicePrices] = useState<{ [key in OrderCategory]: number }>(DEFAULT_PRICES);
  const [driverPartners, setDriverPartners] = useState<DriverPartnerRecord[]>(DEFAULT_DRIVERS);
  const [supportWhatsAppNumber, setSupportWhatsAppNumber] = useState<string>('919829012345');

  // Security State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState<boolean>(false);

  // Global AudioContext Auto-Unlocker on First Touch / Click
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFirstTouch = () => {
      unlockAudioContext();
      window.removeEventListener('click', handleFirstTouch);
      window.removeEventListener('touchstart', handleFirstTouch);
    };
    window.addEventListener('click', handleFirstTouch, { passive: true });
    window.addEventListener('touchstart', handleFirstTouch, { passive: true });
    return () => {
      window.removeEventListener('click', handleFirstTouch);
      window.removeEventListener('touchstart', handleFirstTouch);
    };
  }, []);

  // Background Driver Geolocation Watcher (Active when On Duty)
  useEffect(() => {
    if (typeof window === 'undefined' || !user || user.role !== 'driver' || !isDriverOnline) {
      return;
    }

    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const coords: UserLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading || undefined,
          speed: pos.coords.speed || undefined,
          spotName: findNearestSpotName({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          updatedAt: new Date().toISOString(),
        };
        setDriverLocation(coords);

        if (isFirebaseConfigured && db && user.uid) {
          try {
            await setDoc(doc(db, 'drivers', user.uid), { location: coords, updatedAt: new Date().toISOString() }, { merge: true });
            await setDoc(doc(db, 'users', user.uid), { location: coords, updatedAt: new Date().toISOString() }, { merge: true });
          } catch (err) {
            console.warn('Driver location sync note:', err);
          }
        }
      },
      (err) => {
        console.warn('GPS location watch notice:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [user?.uid, user?.role, isDriverOnline]);

  // Load initial store state
  const loadLocalStore = useCallback(() => {
    try {
      const savedOrders = localStorage.getItem(LOCAL_STORAGE_ORDERS_KEY);
      if (savedOrders) {
        setOrders(JSON.parse(savedOrders));
      }
      const savedDuty = localStorage.getItem(LOCAL_STORAGE_DUTY_KEY);
      if (savedDuty !== null) {
        setIsDriverOnline(savedDuty === 'true');
      }
      const savedPrices = localStorage.getItem(LOCAL_STORAGE_PRICES_KEY);
      if (savedPrices) {
        setServicePrices(JSON.parse(savedPrices));
      }
      const savedDrivers = localStorage.getItem(LOCAL_STORAGE_DRIVERS_KEY);
      if (savedDrivers) {
        setDriverPartners(JSON.parse(savedDrivers));
      }
      const savedAdminAuth = localStorage.getItem(LOCAL_STORAGE_ADMIN_AUTH_KEY);
      if (savedAdminAuth === 'true') {
        setIsAdminAuthenticated(true);
      }
      const savedWhatsApp = localStorage.getItem(LOCAL_STORAGE_WHATSAPP_KEY);
      if (savedWhatsApp) {
        setSupportWhatsAppNumber(savedWhatsApp);
      }
    } catch {
      // ignore
    }
  }, []);

  // Initialize Auth state
  // Initialize Auth state & Real-time Profile Listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isFirebaseConfigured && auth && db) {
      let unsubUserDoc: (() => void) | null = null;
      let unsubDriverDoc: (() => void) | null = null;

      const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        if (unsubUserDoc) {
          unsubUserDoc();
          unsubUserDoc = null;
        }
        if (unsubDriverDoc) {
          unsubDriverDoc();
          unsubDriverDoc = null;
        }

        if (fbUser) {
          try {
            const userDocRef = doc(db!, 'users', fbUser.uid);
            let initialUser: UserProfile | null = null;

            try {
              const userSnap = await getDoc(userDocRef);
              if (userSnap.exists()) {
                const data = userSnap.data() as UserProfile;
                const isVerified = Boolean(
                  data.isDriverVerified === true ||
                  data.isVerified === true ||
                  data.status === 'approved' ||
                  data.verified === true
                );
                initialUser = {
                  ...data,
                  isDriverVerified: isVerified,
                  isVerified: isVerified,
                  status: isVerified ? 'approved' : (data.status || 'pending'),
                  verified: isVerified,
                };
                setUser(initialUser);
                try {
                  localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(initialUser));
                } catch {}
                if (!data.onboardingCompleted || !data.phoneNumber) {
                  setIsFirstLogin(true);
                  setShowOnboarding(true);
                } else {
                  setIsFirstLogin(false);
                  setShowOnboarding(false);
                }
              } else {
                const provisionalUser: UserProfile = {
                  uid: fbUser.uid,
                  name: fbUser.displayName || 'Rawatbhata Citizen',
                  email: fbUser.email || '',
                  phoneNumber: fbUser.phoneNumber || '',
                  photoURL: fbUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
                  role: 'client',
                  isDriverVerified: false,
                  isVerified: false,
                  status: 'pending',
                  verified: false,
                  onboardingCompleted: false,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                await setDoc(userDocRef, provisionalUser);
                setUser(provisionalUser);
                setIsFirstLogin(true);
                setShowOnboarding(true);
              }
            } catch (snapErr) {
              console.warn('Initial user profile fetch notice:', snapErr);
              // Fallback to basic Firebase user if Firestore is slow or offline
              const fallbackUser: UserProfile = {
                uid: fbUser.uid,
                name: fbUser.displayName || 'Rawatbhata Citizen',
                email: fbUser.email || '',
                phoneNumber: fbUser.phoneNumber || '',
                photoURL: fbUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
                role: 'client',
                isDriverVerified: false,
                isVerified: false,
                status: 'pending',
                verified: false,
                onboardingCompleted: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              setUser(fallbackUser);
            }

            // Real-time listener on users/{fbUser.uid}
            unsubUserDoc = onSnapshot(
              userDocRef,
              (snap) => {
                if (snap.exists()) {
                  const data = snap.data() as UserProfile;
                  const isVerified = Boolean(
                    data.isDriverVerified === true ||
                    data.isVerified === true ||
                    data.status === 'approved' ||
                    data.verified === true
                  );
                  const updatedUser: UserProfile = {
                    ...data,
                    isDriverVerified: isVerified,
                    isVerified: isVerified,
                    status: isVerified ? 'approved' : (data.status || 'pending'),
                    verified: isVerified,
                  };
                  setUser(updatedUser);
                  try {
                    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updatedUser));
                  } catch {}

                  if (!data.onboardingCompleted || !data.phoneNumber) {
                    setIsFirstLogin(true);
                    setShowOnboarding(true);
                  } else {
                    setIsFirstLogin(false);
                    setShowOnboarding(false);
                  }
                }
              },
              (err) => {
                console.warn('Firestore user profile snapshot notice:', err);
              }
            );

            // Real-time listener on drivers/{fbUser.uid}
            const driverDocRef = doc(db!, 'drivers', fbUser.uid);
            unsubDriverDoc = onSnapshot(
              driverDocRef,
              (snap) => {
                if (snap.exists()) {
                  const driverData = snap.data() as Partial<DriverPartnerRecord>;
                  const isVerified = Boolean(
                    driverData.isVerified === true ||
                    driverData.isDriverVerified === true ||
                    driverData.status === 'approved' ||
                    driverData.verified === true
                  );
                  setUser((prev) => {
                    if (!prev || prev.uid !== fbUser.uid) return prev;
                    const synced: UserProfile = {
                      ...prev,
                      isDriverVerified: isVerified,
                      isVerified: isVerified,
                      status: isVerified ? 'approved' : (driverData.status || prev.status || 'pending'),
                      verified: isVerified,
                      vehicleType: driverData.vehicleType || prev.vehicleType,
                      vehicleNumber: driverData.vehicleNumber || prev.vehicleNumber,
                      payoutUpiId: driverData.payoutUpiId || prev.payoutUpiId,
                    };
                    try {
                      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(synced));
                    } catch {}
                    return synced;
                  });
                }
              },
              (err) => {
                console.warn('Firestore driver profile snapshot notice:', err);
              }
            );
          } catch (err) {
            console.error('Error fetching user profile from Firestore:', err);
          }
        } else {
          setUser(null);
          setIsFirstLogin(false);
          setShowOnboarding(false);
        }
        setLoading(false);
      });

      return () => {
        unsubscribeAuth();
        if (unsubUserDoc) unsubUserDoc();
        if (unsubDriverDoc) unsubDriverDoc();
      };
    } else {
      // Local Persistence Mode
      try {
        const savedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (savedUser) {
          const parsed = JSON.parse(savedUser) as UserProfile;
          setUser(parsed);
          if (!parsed.onboardingCompleted || !parsed.phoneNumber) {
            setIsFirstLogin(true);
            setShowOnboarding(true);
          }
        }
        loadLocalStore();
      } catch (e) {
        console.warn('Local storage error:', e);
      } finally {
        setLoading(false);
      }
    }
  }, [loadLocalStore]);

  // Real-time Firestore Listeners for Orders & Driver Network
  useEffect(() => {
    if (isFirebaseConfigured && db) {
      // 1. Orders Real-time Stream
      const ordersRef = collection(db!, 'orders');
      const qOrders = query(ordersRef);
      const unsubOrders = onSnapshot(
        qOrders,
        (snapshot) => {
          const fetched: Order[] = [];
          const seenIds = new Set<string>();

          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Omit<Order, 'id'>;
            const docId = docSnap.id;
            if (!seenIds.has(docId)) {
              seenIds.add(docId);
              fetched.push({
                id: docId,
                ...data,
              });
            }
          });

          if (fetched.length > 0) {
            const sorted = fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setOrders(sorted);
            try {
              localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(sorted));
            } catch {}
          } else {
            try {
              localStorage.removeItem(LOCAL_STORAGE_ORDERS_KEY);
            } catch {}
            setOrders([]);
          }
        },
        (err) => {
          console.warn('Firestore orders sync notice (fallback active):', err);
          loadLocalStore();
        }
      );

      // 2. Drivers Real-time Stream
      const driversRef = collection(db!, 'drivers');
      const qDrivers = query(driversRef);
      const unsubDrivers = onSnapshot(
        qDrivers,
        (snapshot) => {
          const fetched: DriverPartnerRecord[] = [];
          snapshot.forEach((docSnap) => {
            const dData = docSnap.data() as Omit<DriverPartnerRecord, 'id'>;
            const isVerified = Boolean(
              dData.isVerified === true ||
              dData.isDriverVerified === true ||
              dData.status === 'approved' ||
              dData.verified === true
            );
            fetched.push({
              id: docSnap.id,
              ...dData,
              isVerified,
              isDriverVerified: isVerified,
              status: isVerified ? 'approved' : (dData.status || 'pending'),
              verified: isVerified,
            });
          });
          if (fetched.length > 0) {
            setDriverPartners(fetched);
            try {
              localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(fetched));
            } catch {}

            // Immediate sync if current logged-in user matches any driver record
            setUser((currentUser) => {
              if (!currentUser) return null;
              const matched = fetched.find((d) => d.id === currentUser.uid);
              if (matched) {
                const isVerified = Boolean(
                  matched.isVerified === true ||
                  matched.isDriverVerified === true ||
                  matched.status === 'approved' ||
                  matched.verified === true
                );
                if (currentUser.isDriverVerified !== isVerified || currentUser.isVerified !== isVerified) {
                  const updated: UserProfile = {
                    ...currentUser,
                    isDriverVerified: isVerified,
                    isVerified: isVerified,
                    status: isVerified ? 'approved' : 'pending',
                    verified: isVerified,
                    vehicleType: matched.vehicleType || currentUser.vehicleType,
                    vehicleNumber: matched.vehicleNumber || currentUser.vehicleNumber,
                    payoutUpiId: matched.payoutUpiId || currentUser.payoutUpiId,
                  };
                  try {
                    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updated));
                  } catch {}
                  return updated;
                }
              }
              return currentUser;
            });
          }
        },
        (err) => {
          console.warn('Firestore drivers sync notice:', err);
        }
      );

      // 3. Real-Time Pricing Configuration Stream
      const pricingDocRef = doc(db!, 'config', 'pricing');
      const unsubPricing = onSnapshot(
        pricingDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Partial<{ [key in OrderCategory]: number }>;
            const mergedPrices: { [key in OrderCategory]: number } = {
              errand: Number(data.errand) || DEFAULT_PRICES.errand,
              food: Number(data.food) || DEFAULT_PRICES.food,
              delivery: Number(data.delivery) || DEFAULT_PRICES.delivery,
              ride: Number(data.ride) || DEFAULT_PRICES.ride,
              companion_listening_ghumna: Number(data.companion_listening_ghumna) || DEFAULT_PRICES.companion_listening_ghumna,
            };
            setServicePrices(mergedPrices);
            try {
              localStorage.setItem(LOCAL_STORAGE_PRICES_KEY, JSON.stringify(mergedPrices));
            } catch {}
          }
        },
        (err) => {
          console.warn('Firestore pricing sync notice:', err);
        }
      );

      return () => {
        unsubOrders();
        unsubDrivers();
        unsubPricing();
      };
    } else {
      loadLocalStore();
    }
  }, [loadLocalStore]);

  // Automated Nearest-Driver Cascading Timeout Checker (Checks for 45s offer expiry)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      orders.forEach(async (ord) => {
        if (
          ord.status === 'pending' &&
          ord.targetAudience === 'driver_pool' &&
          ord.dispatchMode === 'targeted' &&
          ord.currentOfferExpiresAt &&
          new Date(ord.currentOfferExpiresAt).getTime() < now
        ) {
          // Timeout reached for current targeted driver! Cascade to next nearest driver
          const timedOutDriverId = ord.currentOfferDriverId;
          const rejected = Array.from(
            new Set([...(ord.rejectedDrivers || []), ...(timedOutDriverId ? [timedOutDriverId] : [])])
          );

          const pickupCoords = ord.pickupCoords || resolveLocationCoordinates(ord.pickupAddress);
          const eligibleDrivers = driverPartners.filter(
            (d) =>
              !rejected.includes(d.id) &&
              d.isOnline &&
              (d.isVerified || d.isDriverVerified || d.status === 'approved' || d.verified)
          );

          if (eligibleDrivers.length > 0) {
            const sorted = eligibleDrivers
              .map((d) => {
                const dCoords = d.location ? { lat: d.location.lat, lng: d.location.lng } : RAWATBHATA_CENTER;
                return { driver: d, dist: calculateDistanceKm(pickupCoords, dCoords) };
              })
              .sort((a, b) => a.dist - b.dist);

            const nextDriver = sorted[0].driver;
            const nextDistance = sorted[0].dist;

            const updatePayload: Partial<Order> = {
              currentOfferDriverId: nextDriver.id,
              currentOfferDriverName: nextDriver.name,
              currentOfferDriverDistance: nextDistance,
              currentOfferExpiresAt: new Date(Date.now() + 45000).toISOString(),
              rejectedDrivers: rejected,
            };

            const updated = orders.map((o) => (o.id === ord.id ? { ...o, ...updatePayload } : o));
            persistLocalOrders(updated);

            if (isFirebaseConfigured && db) {
              const docRef = doc(db!, 'orders', ord.id);
              await setDoc(docRef, updatePayload, { merge: true });
            }
          } else {
            // No more online drivers, fall back to public broadcast pool
            const updatePayload: Partial<Order> = {
              dispatchMode: 'broadcast',
              currentOfferDriverId: undefined,
              currentOfferDriverName: undefined,
              currentOfferDriverDistance: undefined,
              currentOfferExpiresAt: undefined,
              rejectedDrivers: rejected,
            };

            const updated = orders.map((o) => (o.id === ord.id ? { ...o, ...updatePayload } : o));
            persistLocalOrders(updated);

            if (isFirebaseConfigured && db) {
              const docRef = doc(db!, 'orders', ord.id);
              await setDoc(docRef, updatePayload, { merge: true });
            }
          }
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [orders, driverPartners]);

  // Helper to persist local orders
  const persistLocalOrders = (updated: Order[]) => {
    setOrders(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_ORDERS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Sign In with 1-Click Google
  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      if (isFirebaseConfigured && auth && googleProvider && db) {
        const result = await signInWithPopup(auth, googleProvider);
        const fbUser = result.user;
        const userDocRef = doc(db!, 'users', fbUser.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfile;
          setUser(data);
          if (!data.onboardingCompleted || !data.phoneNumber) {
            setIsFirstLogin(true);
            setShowOnboarding(true);
          } else {
            setIsFirstLogin(false);
            setShowOnboarding(false);
          }
        } else {
          const newUser: UserProfile = {
            uid: fbUser.uid,
            name: fbUser.displayName || 'Rawatbhata Citizen',
            email: fbUser.email || '',
            phoneNumber: fbUser.phoneNumber || '',
            photoURL: fbUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            role: 'client',
            isDriverVerified: false,
            onboardingCompleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await setDoc(userDocRef, newUser);
          setUser(newUser);
          setIsFirstLogin(true);
          setShowOnboarding(true);
        }
      } else {
        const mockUid = 'user_rawatbhata_' + Date.now().toString(36);
        const provisionalUser: UserProfile = {
          uid: mockUid,
          name: 'Priya Sharma',
          email: 'priya.sharma.rawatbhata@gmail.com',
          phoneNumber: '',
          photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          role: 'client',
          isDriverVerified: false,
          onboardingCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(provisionalUser));
        setUser(provisionalUser);
        setIsFirstLogin(true);
        setShowOnboarding(true);
      }
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Save Onboarding Profile
  const saveOnboardingProfile = async (data: {
    name: string;
    phoneNumber: string;
    photoURL?: string;
    role?: UserRole;
    vehicleType?: VehicleType;
    vehicleNumber?: string;
    payoutUpiId?: string;
  }) => {
    if (!user) throw new Error('No authenticated user found');

    const cleanVehicleNumber = data.vehicleNumber ? data.vehicleNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : user.vehicleNumber;
    const cleanPayoutUpi = data.payoutUpiId ? data.payoutUpiId.trim().toLowerCase() : user.payoutUpiId;
    const isDriverRole = (data.role || user.role) === 'driver';

    const currentDriverRecord = driverPartners.find(d => d.id === user.uid);
    const isAlreadyVerified = Boolean(
      user.isDriverVerified === true ||
      user.isVerified === true ||
      user.status === 'approved' ||
      user.verified === true ||
      currentDriverRecord?.isVerified === true ||
      currentDriverRecord?.isDriverVerified === true ||
      currentDriverRecord?.status === 'approved' ||
      currentDriverRecord?.verified === true
    );

    const updatedProfile: UserProfile = {
      ...user,
      name: data.name.trim(),
      phoneNumber: data.phoneNumber.trim(),
      photoURL: data.photoURL || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: data.role || user.role || 'client',
      isDriverVerified: isDriverRole ? isAlreadyVerified : true,
      isVerified: isDriverRole ? isAlreadyVerified : true,
      status: isDriverRole ? (isAlreadyVerified ? 'approved' : 'pending') : 'approved',
      verified: isDriverRole ? isAlreadyVerified : true,
      vehicleType: data.vehicleType || user.vehicleType || 'bike',
      vehicleNumber: cleanVehicleNumber || user.vehicleNumber,
      payoutUpiId: cleanPayoutUpi || user.payoutUpiId,
      onboardingCompleted: true,
      updatedAt: new Date().toISOString(),
    };

    if (isDriverRole) {
      const existingDriverIndex = driverPartners.findIndex((d) => d.id === user.uid);
      const driverRecord: DriverPartnerRecord = {
        id: user.uid,
        name: updatedProfile.name,
        phone: updatedProfile.phoneNumber,
        photoURL: updatedProfile.photoURL,
        isOnline: true,
        isVerified: isAlreadyVerified,
        isDriverVerified: isAlreadyVerified,
        status: isAlreadyVerified ? 'approved' : 'pending',
        verified: isAlreadyVerified,
        vehicleType: updatedProfile.vehicleType,
        vehicleNumber: updatedProfile.vehicleNumber,
        payoutUpiId: updatedProfile.payoutUpiId,
        completedRuns: currentDriverRecord?.completedRuns || 0,
        totalEarnings: currentDriverRecord?.totalEarnings || 0,
        rating: currentDriverRecord?.rating || 5.0,
        joinedDate: currentDriverRecord?.joinedDate || new Date().toISOString().split('T')[0],
      };

      let updatedDriversList: DriverPartnerRecord[];
      if (existingDriverIndex >= 0) {
        updatedDriversList = driverPartners.map((d, i) => (i === existingDriverIndex ? driverRecord : d));
      } else {
        updatedDriversList = [driverRecord, ...driverPartners];
      }

      setDriverPartners(updatedDriversList);
      try {
        localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updatedDriversList));
      } catch {}

      if (isFirebaseConfigured && db) {
        const driverDocRef = doc(db!, 'drivers', user.uid);
        await setDoc(driverDocRef, sanitizeFirestoreData(driverRecord), { merge: true });
      }
    }

    if (isFirebaseConfigured && db) {
      const userDocRef = doc(db!, 'users', user.uid);
      await setDoc(userDocRef, sanitizeFirestoreData(updatedProfile), { merge: true });
    }

    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updatedProfile));
    setUser(updatedProfile);
    setIsFirstLogin(false);
    setShowOnboarding(false);
  };

  // Switch Role with Security Guard & Instant Unlock Fallback
  const switchRole = async (newRole: UserRole) => {
    if (!user) return;

    // Security Check for Admin
    if (newRole === 'admin') {
      const isEmailWhitelisted = ADMIN_EMAIL_WHITELIST.includes(user.email?.toLowerCase());
      if (!isEmailWhitelisted && !isAdminAuthenticated) {
        setShowAdminPinModal(true);
        return;
      }
    }

    const currentDriverRecord = driverPartners.find(d => d.id === user.uid);
    const isAlreadyVerified = Boolean(
      user.isDriverVerified === true ||
      user.isVerified === true ||
      user.status === 'approved' ||
      user.verified === true ||
      currentDriverRecord?.isVerified === true ||
      currentDriverRecord?.isDriverVerified === true ||
      currentDriverRecord?.status === 'approved' ||
      currentDriverRecord?.verified === true
    );

    const updated: UserProfile = {
      ...user,
      role: newRole,
      isDriverVerified: isAlreadyVerified || (user.isDriverVerified ?? false),
      isVerified: isAlreadyVerified || (user.isVerified ?? false),
      status: isAlreadyVerified ? 'approved' : (user.status || 'pending'),
      verified: isAlreadyVerified || (user.verified ?? false),
      updatedAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured && db) {
      const userDocRef = doc(db!, 'users', user.uid);
      await setDoc(userDocRef, {
        role: newRole,
        isDriverVerified: updated.isDriverVerified,
        isVerified: updated.isVerified,
        status: updated.status,
        verified: updated.verified,
        updatedAt: updated.updatedAt,
      }, { merge: true });
    }

    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updated));
    setUser(updated);
  };

  // Request Admin Access
  const requestAdminAccess = () => {
    if (!user) return;
    const isEmailWhitelisted = ADMIN_EMAIL_WHITELIST.includes(user.email?.toLowerCase());
    if (isEmailWhitelisted || isAdminAuthenticated) {
      switchRole('admin');
    } else {
      setShowAdminPinModal(true);
    }
  };

  // Verify Admin PIN
  const verifyAdminPin = (pin: string): boolean => {
    if (pin.trim() === ADMIN_MASTER_PIN) {
      setIsAdminAuthenticated(true);
      try {
        localStorage.setItem(LOCAL_STORAGE_ADMIN_AUTH_KEY, 'true');
      } catch {
        // ignore
      }
      setShowAdminPinModal(false);
      switchRole('admin');
      return true;
    }
    return false;
  };

  // Apply as Driver Partner
  const applyAsDriver = async () => {
    if (!user) return;
    const currentDriverRecord = driverPartners.find(d => d.id === user.uid);
    const isAlreadyVerified = Boolean(
      user.isDriverVerified === true ||
      user.isVerified === true ||
      user.status === 'approved' ||
      user.verified === true ||
      currentDriverRecord?.isVerified === true ||
      currentDriverRecord?.isDriverVerified === true ||
      currentDriverRecord?.status === 'approved' ||
      currentDriverRecord?.verified === true
    );

    const updated: UserProfile = {
      ...user,
      role: 'driver',
      isDriverVerified: isAlreadyVerified,
      isVerified: isAlreadyVerified,
      status: isAlreadyVerified ? 'approved' : 'pending',
      verified: isAlreadyVerified,
      updatedAt: new Date().toISOString(),
    };

    // Add to driver directory as pending or approved
    if (!currentDriverRecord) {
      const newDriverRecord: DriverPartnerRecord = {
        id: user.uid,
        name: user.name,
        phone: user.phoneNumber || 'Not provided',
        photoURL: user.photoURL,
        isOnline: true,
        isVerified: isAlreadyVerified,
        isDriverVerified: isAlreadyVerified,
        status: isAlreadyVerified ? 'approved' : 'pending',
        verified: isAlreadyVerified,
        completedRuns: 0,
        totalEarnings: 0,
        rating: 5.0,
        joinedDate: new Date().toISOString().split('T')[0],
      };
      const updatedDrivers = [newDriverRecord, ...driverPartners];
      setDriverPartners(updatedDrivers);
      try {
        localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updatedDrivers));
      } catch {
        // ignore
      }
    }

    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updated));
    setUser(updated);

    if (isFirebaseConfigured && db) {
      await setDoc(doc(db!, 'users', user.uid), {
        role: 'driver',
        isDriverVerified: isAlreadyVerified,
        isVerified: isAlreadyVerified,
        status: isAlreadyVerified ? 'approved' : 'pending',
        verified: isAlreadyVerified,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await setDoc(doc(db!, 'drivers', user.uid), {
        id: user.uid,
        name: user.name,
        phone: user.phoneNumber || 'Not provided',
        photoURL: user.photoURL,
        isOnline: true,
        isVerified: isAlreadyVerified,
        isDriverVerified: isAlreadyVerified,
        status: isAlreadyVerified ? 'approved' : 'pending',
        verified: isAlreadyVerified,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
  };

  // Register / Update Driver Vehicle Details
  const registerDriverVehicle = async (data: {
    vehicleType: VehicleType;
    vehicleNumber: string;
    payoutUpiId: string;
    name?: string;
    phone?: string;
  }) => {
    if (!user) throw new Error('Authentication required to register vehicle.');

    const cleanVehicleNumber = data.vehicleNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!cleanVehicleNumber || cleanVehicleNumber.length < 4) {
      throw new Error('Please provide a valid vehicle registration number (e.g. RJ-20-MB-4512).');
    }

    // Strict Uniqueness Check: Prevent another driver from registering the same vehicle plate
    const duplicateDriver = driverPartners.find(
      (d) =>
        d.id !== user.uid &&
        d.vehicleNumber &&
        d.vehicleNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === cleanVehicleNumber
    );

    if (duplicateDriver) {
      throw new Error(
        `🚫 Duplicate Vehicle Conflict: Vehicle plate "${data.vehicleNumber.toUpperCase()}" is already registered under partner "${duplicateDriver.name}" (${duplicateDriver.phone || 'Verified'}). A vehicle can only belong to one active driver in Rawatbhata.`
      );
    }

    const currentDriverRecord = driverPartners.find(d => d.id === user.uid);
    const isAlreadyVerified = Boolean(
      user.isDriverVerified === true ||
      user.isVerified === true ||
      user.status === 'approved' ||
      user.verified === true ||
      currentDriverRecord?.isVerified === true ||
      currentDriverRecord?.isDriverVerified === true ||
      currentDriverRecord?.status === 'approved' ||
      currentDriverRecord?.verified === true
    );

    const updatedUser: UserProfile = {
      ...user,
      name: data.name?.trim() || user.name,
      phoneNumber: data.phone?.trim() || user.phoneNumber,
      role: 'driver',
      isDriverVerified: isAlreadyVerified,
      isVerified: isAlreadyVerified,
      status: isAlreadyVerified ? 'approved' : 'pending',
      verified: isAlreadyVerified,
      vehicleType: data.vehicleType,
      vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
      payoutUpiId: data.payoutUpiId.trim().toLowerCase(),
      updatedAt: new Date().toISOString(),
    };

    // Update in Driver Partners Directory
    const existingIndex = driverPartners.findIndex(d => d.id === user.uid);
    let updatedDrivers: DriverPartnerRecord[];

    if (existingIndex >= 0) {
      updatedDrivers = driverPartners.map((d, idx) =>
        idx === existingIndex
          ? {
              ...d,
              name: updatedUser.name,
              phone: updatedUser.phoneNumber || d.phone,
              isVerified: isAlreadyVerified,
              isDriverVerified: isAlreadyVerified,
              status: isAlreadyVerified ? 'approved' : 'pending',
              verified: isAlreadyVerified,
              vehicleType: data.vehicleType,
              vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
              payoutUpiId: data.payoutUpiId.trim().toLowerCase(),
            }
          : d
      );
    } else {
      const newDriverRecord: DriverPartnerRecord = {
        id: user.uid,
        name: updatedUser.name,
        phone: updatedUser.phoneNumber || '9829012345',
        photoURL: user.photoURL,
        isOnline: true,
        isVerified: isAlreadyVerified,
        isDriverVerified: isAlreadyVerified,
        status: isAlreadyVerified ? 'approved' : 'pending',
        verified: isAlreadyVerified,
        vehicleType: data.vehicleType,
        vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
        payoutUpiId: data.payoutUpiId.trim().toLowerCase(),
        completedRuns: 0,
        totalEarnings: 0,
        rating: 5.0,
        joinedDate: new Date().toISOString().split('T')[0],
      };
      updatedDrivers = [newDriverRecord, ...driverPartners];
    }

    setDriverPartners(updatedDrivers);
    setUser(updatedUser);

    try {
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updatedUser));
      localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updatedDrivers));
    } catch {
      // ignore
    }

    if (isFirebaseConfigured && db) {
      const userDocRef = doc(db!, 'users', user.uid);
      await setDoc(userDocRef, sanitizeFirestoreData({
        name: updatedUser.name,
        phoneNumber: updatedUser.phoneNumber,
        role: 'driver',
        isDriverVerified: isAlreadyVerified,
        isVerified: isAlreadyVerified,
        status: isAlreadyVerified ? 'approved' : 'pending',
        verified: isAlreadyVerified,
        vehicleType: data.vehicleType,
        vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
        payoutUpiId: data.payoutUpiId.trim().toLowerCase(),
        updatedAt: updatedUser.updatedAt,
      }), { merge: true });

      const driverDocRef = doc(db!, 'drivers', user.uid);
      await setDoc(driverDocRef, sanitizeFirestoreData({
        id: user.uid,
        name: updatedUser.name,
        phone: updatedUser.phoneNumber || '9829012345',
        photoURL: user.photoURL || null,
        vehicleType: data.vehicleType,
        vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
        payoutUpiId: data.payoutUpiId.trim().toLowerCase(),
        isOnline: true,
        isVerified: isAlreadyVerified,
        isDriverVerified: isAlreadyVerified,
        status: isAlreadyVerified ? 'approved' : 'pending',
        verified: isAlreadyVerified,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    }
  };

  // Update Support WhatsApp Number (Admin Action)
  const updateSupportWhatsAppNumber = async (newNumber: string) => {
    const cleanNum = newNumber.replace(/\D/g, '');
    const finalNumber = cleanNum || '919829012345';
    setSupportWhatsAppNumber(finalNumber);
    try {
      localStorage.setItem(LOCAL_STORAGE_WHATSAPP_KEY, finalNumber);
    } catch {
      // ignore
    }
  };

  // Sign Out
  const signOut = async () => {
    if (isFirebaseConfigured && auth) {
      await firebaseSignOut(auth);
    }
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    localStorage.removeItem(LOCAL_STORAGE_ADMIN_AUTH_KEY);
    setIsAdminAuthenticated(false);
    setUser(null);
    setIsFirstLogin(false);
    setShowOnboarding(false);
  };

  // Create Order (Enforcing Strict Task Isolation + Proximity Dispatch + Dynamic Payment Mode)
  const createOrder = async (orderData: {
    category: OrderCategory;
    categoryLabel: string;
    title: string;
    description: string;
    pickupAddress: string;
    dropAddress: string;
    pickupCoords?: GeoPoint;
    dropCoords?: GeoPoint;
    price: number;
    targetAudience: TargetAudience;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    transactionRef?: string;
    utrNumber?: string;
  }): Promise<Order> => {
    if (!user) throw new Error('Must be logged in to create an order');

    // 1. RATE LIMITING: Anti-Spam protection (allows normal usage/testing up to 20 orders per minute)
    const ONE_MINUTE_MS = 60 * 1000;
    const nowMs = Date.now();
    let localTimestamps: number[] = [];
    try {
      const storedHistory = localStorage.getItem(`rawatbhata_order_ratelimit_${user.uid}`);
      if (storedHistory) {
        localTimestamps = JSON.parse(storedHistory).filter((t: number) => t > nowMs - ONE_MINUTE_MS);
      }
    } catch {}

    if (localTimestamps.length >= 20) {
      throw new Error('⚠️ Anti-Spam Rate Limit Exceeded: Please wait a moment before creating more tasks.');
    }

    localTimestamps.push(nowMs);
    try {
      localStorage.setItem(`rawatbhata_order_ratelimit_${user.uid}`, JSON.stringify(localTimestamps));
    } catch {}

    // 2. CLIENT-SIDE VALIDATION & TAMPER HARDENING: Sanitize text and enforce authoritative minimum price & distance
    const isCompanionCategory = orderData.category === 'companion_listening_ghumna';
    const fallbackTitle = isCompanionCategory
      ? 'Private Companion Session'
      : `${orderData.categoryLabel || 'Hyperlocal'} Order`;

    const rawTitle = (orderData.title || '').trim() || fallbackTitle;
    const rawPickup = (orderData.pickupAddress || '').trim() || 'Rawatbhata';
    const rawDrop = isCompanionCategory
      ? (rawPickup || 'Meeting Location')
      : ((orderData.dropAddress || '').trim() || rawPickup);

    const sanitizedTitle = rawTitle.slice(0, 120);
    const sanitizedDescription = (orderData.description || '').trim().slice(0, 500);
    const sanitizedPickupAddress = rawPickup.slice(0, 200);
    const sanitizedDropAddress = rawDrop.slice(0, 200);

    // Resolve GPS coordinates for pickup and drop
    const pickupCoords = orderData.pickupCoords || resolveLocationCoordinates(sanitizedPickupAddress);
    const dropCoords = orderData.dropCoords || resolveLocationCoordinates(sanitizedDropAddress);

    // Calculate authoritative distance (Haversine formula)
    const calculatedDistanceKm = calculateDistanceKm(pickupCoords, dropCoords);

    // Authoritative Fare Validation by Category (Prevents DevTools inspect price tampering)
    const baseMinPrice = servicePrices[orderData.category] || DEFAULT_PRICES[orderData.category] || 25;
    let authoritativeMinPrice = baseMinPrice;

    if (orderData.category === 'errand' || orderData.category === 'delivery') {
      authoritativeMinPrice = Math.max(25, Math.round(25 + Math.max(0, calculatedDistanceKm - 2) * 10));
    } else if (orderData.category === 'food') {
      authoritativeMinPrice = Math.max(35, Math.round(35 + Math.max(0, calculatedDistanceKm - 2) * 12));
    } else if (orderData.category === 'ride') {
      authoritativeMinPrice = Math.max(30, Math.round(30 + Math.max(0, calculatedDistanceKm - 1) * 10));
    } else if (orderData.category === 'companion_listening_ghumna') {
      authoritativeMinPrice = 120;
    }

    // Enforce tamper-proof price: Price cannot be less than authoritative minimum
    const validatedPrice = Math.max(authoritativeMinPrice, Math.round(Number(orderData.price) || authoritativeMinPrice));

    const finalTargetAudience: TargetAudience = isCompanionCategory ? 'admin_only' : 'driver_pool';

    const pMethod = orderData.paymentMethod || 'cod';
    const isUpiMethod = pMethod === 'upi_instant' || pMethod === 'UPI';
    const finalMethod: PaymentMethod = isUpiMethod ? 'UPI' : 'cod';
    const pStatus: PaymentStatus = orderData.paymentStatus || (isUpiMethod ? 'pending_verification' : 'pending');
    const finalUtr = orderData.utrNumber || orderData.transactionRef;

    // Smart Proximity Dispatch: Find nearest online & verified driver
    let dispatchMode: 'targeted' | 'broadcast' = 'broadcast';
    let currentOfferDriverId: string | undefined = undefined;
    let currentOfferDriverName: string | undefined = undefined;
    let currentOfferDriverDistance: number | undefined = undefined;
    let currentOfferExpiresAt: string | undefined = undefined;

    if (!isCompanionCategory) {
      const eligibleDrivers = driverPartners.filter((d) =>
        d.isOnline &&
        (d.isVerified || d.isDriverVerified || d.status === 'approved' || d.verified)
      );

      if (eligibleDrivers.length > 0) {
        const sorted = eligibleDrivers.map((d) => {
          const dCoords = d.location ? { lat: d.location.lat, lng: d.location.lng } : RAWATBHATA_CENTER;
          const dist = calculateDistanceKm(pickupCoords, dCoords);
          return { driver: d, dist };
        }).sort((a, b) => a.dist - b.dist);

        const closest = sorted[0];
        dispatchMode = 'targeted';
        currentOfferDriverId = closest.driver.id;
        currentOfferDriverName = closest.driver.name;
        currentOfferDriverDistance = closest.dist;
        currentOfferExpiresAt = new Date(Date.now() + 45000).toISOString(); // 45-second priority offer
      }
    }

    // Generate 4-digit Secure Delivery PIN (OTP)
    const deliveryPin = Math.floor(1000 + Math.random() * 9000).toString();

    const newOrder: Order = {
      id: 'ord_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      clientId: user.uid,
      clientName: user.name,
      clientPhone: user.phoneNumber,
      category: orderData.category,
      categoryLabel: orderData.categoryLabel,
      title: sanitizedTitle,
      description: sanitizedDescription,
      pickupAddress: sanitizedPickupAddress,
      dropAddress: sanitizedDropAddress,
      pickupCoords,
      dropCoords,
      price: validatedPrice,
      status: 'pending',
      targetAudience: finalTargetAudience,
      dispatchMode,
      currentOfferDriverId,
      currentOfferDriverName,
      currentOfferDriverDistance,
      currentOfferExpiresAt,
      rejectedDrivers: [],
      paymentMethod: finalMethod,
      paymentStatus: pStatus,
      transactionRef: finalUtr,
      utrNumber: finalUtr,
      paidAt: pStatus === 'paid_online' ? new Date().toISOString() : undefined,
      deliveryPin,
      messages: [
        {
          id: 'msg_welcome_' + Date.now(),
          senderId: 'system',
          senderName: 'Rawatbhata Direct',
          senderRole: 'admin',
          text: isCompanionCategory
            ? `🔒 Companion session registered. Direct Admin coordination is engaged.`
            : currentOfferDriverName
            ? `Task created. Estimated budget ₹${orderData.price}. Nearest partner ${currentOfferDriverName} (${formatDistance(currentOfferDriverDistance || 0)}) given first priority offer.`
            : `Task created. Estimated budget ₹${orderData.price} (${isUpiMethod ? `UPI (UTR: ${finalUtr || 'Pending Verification'})` : 'Cash on Delivery'}). Dispatching to network.`,
          timestamp: new Date().toISOString(),
        }
      ],
      createdAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', newOrder.id);
      const cleanPayload = sanitizeFirestoreData({
        ...newOrder,
        serverCreatedAt: serverTimestamp(),
      });
      await setDoc(docRef, cleanPayload, { merge: true });
    }

    persistLocalOrders([newOrder, ...orders]);
    return newOrder;
  };

  // Driver Declines / Passes Order Offer ➔ Cascades to next closest driver
  const declineOrderOffer = async (orderId: string) => {
    if (!user) return;
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;

    const rejected = Array.from(new Set([...(target.rejectedDrivers || []), user.uid]));
    const pickupCoords = target.pickupCoords || resolveLocationCoordinates(target.pickupAddress);

    const eligibleDrivers = driverPartners.filter((d) =>
      d.id !== user.uid &&
      !rejected.includes(d.id) &&
      d.isOnline &&
      (d.isVerified || d.isDriverVerified || d.status === 'approved' || d.verified)
    );

    let nextTargetDriver: DriverPartnerRecord | null = null;
    let nextDistance = 0;

    if (eligibleDrivers.length > 0) {
      const sorted = eligibleDrivers.map((d) => {
        const dCoords = d.location ? { lat: d.location.lat, lng: d.location.lng } : RAWATBHATA_CENTER;
        return { driver: d, dist: calculateDistanceKm(pickupCoords, dCoords) };
      }).sort((a, b) => a.dist - b.dist);

      nextTargetDriver = sorted[0].driver;
      nextDistance = sorted[0].dist;
    }

    const updatePayload: Partial<Order> = nextTargetDriver
      ? {
          dispatchMode: 'targeted',
          currentOfferDriverId: nextTargetDriver.id,
          currentOfferDriverName: nextTargetDriver.name,
          currentOfferDriverDistance: nextDistance,
          currentOfferExpiresAt: new Date(Date.now() + 45000).toISOString(),
          rejectedDrivers: rejected,
        }
      : {
          dispatchMode: 'broadcast',
          currentOfferDriverId: undefined,
          currentOfferDriverName: undefined,
          currentOfferDriverDistance: undefined,
          currentOfferExpiresAt: undefined,
          rejectedDrivers: rejected,
        };

    const updated = orders.map((o) => (o.id === orderId ? { ...o, ...updatePayload } : o));
    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      const cleanUpdate = sanitizeFirestoreData(updatePayload);
      await setDoc(docRef, cleanUpdate, { merge: true });
    }
  };

  // Cancel Order
  const cancelOrder = async (orderId: string) => {
    const updated = orders.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' as const } : o));
    persistLocalOrders(updated);
    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await setDoc(
        docRef,
        {
          status: 'cancelled',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  };

  // Delete Order (Permanently removes order from Firestore & Local state)
  const deleteOrder = async (orderId: string) => {
    const updated = orders.filter((o) => o.id !== orderId);
    persistLocalOrders(updated);
    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await deleteDoc(docRef);
    }
  };

  // Clear All Orders (Wipes all test orders from Firestore & Local state)
  const clearAllOrders = async () => {
    setOrders([]);
    try {
      localStorage.removeItem(LOCAL_STORAGE_ORDERS_KEY);
    } catch {}
    if (isFirebaseConfigured && db) {
      const ordersRef = collection(db!, 'orders');
      const snap = await getDocs(ordersRef);
      const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    }
  };

  // Toggle Driver Duty (With Approval Gatekeeper)
  const toggleDriverDuty = () => {
    if (isDriverOnline) {
      // Going offline is always allowed
      setIsDriverOnline(false);
      try {
        localStorage.setItem(LOCAL_STORAGE_DUTY_KEY, 'false');
      } catch {}
      return;
    }

    const currentDriverRecord = driverPartners.find((d) => d.id === user?.uid);
    const isApprovedDriver = Boolean(
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

    if (isBlocked) {
      alert('🚫 Account Blocked by Admin. You cannot go online.');
      return;
    }

    if (!isApprovedDriver) {
      alert('⚠️ Account Pending Admin Approval. You cannot go online yet.');
      return;
    }

    setIsDriverOnline(true);
    try {
      localStorage.setItem(LOCAL_STORAGE_DUTY_KEY, 'true');
    } catch {
      // ignore
    }
  };

  // Accept Order (Driver Action with Verification Gatekeeper)
  const acceptOrder = async (orderId: string) => {
    if (!orderId) throw new Error('Order ID is missing or invalid.');
    if (!user) throw new Error('Must be logged in to accept an order.');

    const currentDriverRecord = driverPartners.find((d) => d.id === user.uid);
    const isVerifiedDriver = Boolean(
      user.isDriverVerified === true ||
      user.isVerified === true ||
      user.status === 'approved' ||
      user.verified === true ||
      currentDriverRecord?.isVerified === true ||
      currentDriverRecord?.isDriverVerified === true ||
      currentDriverRecord?.status === 'approved' ||
      currentDriverRecord?.verified === true
    );

    // Security Gatekeeper: Driver MUST be verified
    if (user.role === 'driver' && !isVerifiedDriver) {
      throw new Error('Driver account pending Admin verification. Contact Admin Desk to unlock acceptance.');
    }

    const acceptanceMsg: ChatMessage = {
      id: 'msg_' + Date.now().toString(36),
      senderId: user.uid,
      senderName: user.name,
      senderRole: 'driver',
      text: `Hello ${user.name} here! I have accepted your run and am heading to pickup.`,
      timestamp: new Date().toISOString(),
    };

    const targetOrder = orders.find((o) => o.id === orderId);

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          status: 'assigned' as OrderStatus,
          assignedTo: user.uid,
          driverId: user.uid,
          driverName: user.name,
          driverPhone: user.phoneNumber || '9876543210',
          driverPhoto: user.photoURL || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
          messages: [...(o.messages || []), acceptanceMsg],
        };
      }
      return o;
    });

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      try {
        const docRef = doc(db!, 'orders', orderId);
        const baseData = targetOrder ? { ...targetOrder } : {};
        await setDoc(
          docRef,
          {
            ...baseData,
            id: orderId,
            status: 'assigned',
            assignedTo: user.uid,
            driverId: user.uid,
            driverName: user.name,
            driverPhone: user.phoneNumber || '9876543210',
            driverPhoto: user.photoURL || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
            acceptedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: arrayUnion(acceptanceMsg),
          },
          { merge: true }
        );
      } catch (err: any) {
        console.error('Firestore acceptOrder error:', err);
        throw new Error(`Database synchronization failed: ${err.message || 'Check connection or Firestore permissions'}`);
      }
    }
  };

  // Admin Accept Companion Order (Strict Admin Coordination)
  const adminAcceptCompanionOrder = async (orderId: string) => {
    if (!user) throw new Error('Admin authentication required');

    const adminMsg: ChatMessage = {
      id: 'msg_admin_' + Date.now().toString(36),
      senderId: user.uid,
      senderName: `Admin Desk (${user.name})`,
      senderRole: 'admin',
      text: `Namaste, the Rawatbhata Admin Desk has directly assumed coordination for your private companion session. We will personally ensure your comfort, safety, and timing.`,
      timestamp: new Date().toISOString(),
    };

    const targetOrder = orders.find((o) => o.id === orderId);

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          status: 'assigned' as OrderStatus,
          assignedTo: user.uid,
          driverId: user.uid,
          driverName: `Verified Admin (${user.name})`,
          driverPhone: user.phoneNumber || '01475-234567',
          driverPhoto: user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          messages: [...(o.messages || []), adminMsg],
        };
      }
      return o;
    });

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      const baseData = targetOrder ? { ...targetOrder } : {};
      await setDoc(
        docRef,
        {
          ...baseData,
          id: orderId,
          status: 'assigned',
          assignedTo: user.uid,
          driverId: user.uid,
          driverName: `Verified Admin (${user.name})`,
          driverPhone: user.phoneNumber || '01475-234567',
          driverPhoto: user.photoURL,
          updatedAt: new Date().toISOString(),
          messages: arrayUnion(adminMsg),
        },
        { merge: true }
      );
    }
  };

  // Upload Bill / Item Photo
  const uploadBillPhoto = async (orderId: string, photoURL: string) => {
    if (!user) throw new Error('Must be logged in to upload bill photo');

    const billMsg: ChatMessage = {
      id: 'msg_photo_' + Date.now().toString(36),
      senderId: user.uid,
      senderName: user.name,
      senderRole: user.role,
      text: `📸 Bill / Parcel verification photo attached for client approval.`,
      timestamp: new Date().toISOString(),
    };

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          status: 'photo_uploaded' as OrderStatus,
          billPhotoURL: photoURL,
          billUploadedAt: new Date().toISOString(),
          messages: [...(o.messages || []), billMsg],
        };
      }
      return o;
    });

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await setDoc(
        docRef,
        {
          status: 'photo_uploaded',
          billPhotoURL: photoURL,
          billUploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: arrayUnion(billMsg),
        },
        { merge: true }
      );
    }
  };

  // Approve Delivery (Client Action)
  const approveDelivery = async (orderId: string) => {
    if (!user) throw new Error('Must be logged in to approve delivery');

    const target = orders.find(o => o.id === orderId);
    const finalPaymentStatus: PaymentStatus = target?.paymentMethod === 'cod' ? 'collected_cash' : (target?.paymentStatus || 'paid_online');

    const completeMsg: ChatMessage = {
      id: 'msg_approved_' + Date.now().toString(36),
      senderId: user.uid,
      senderName: user.name,
      senderRole: 'client',
      text: `✅ Delivery and bill approved by client! Task completed successfully (${finalPaymentStatus === 'collected_cash' ? 'Cash collected' : 'UPI Settled'}).`,
      timestamp: new Date().toISOString(),
    };

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          status: 'completed' as OrderStatus,
          paymentStatus: finalPaymentStatus,
          completedAt: new Date().toISOString(),
          messages: [...(o.messages || []), completeMsg],
        };
      }
      return o;
    });

    // Update assigned driver's earnings & completed run count
    if (target && target.assignedTo) {
      const netDriverCut = Math.max(0, (target.price || 0) - PLATFORM_COMMISSION_FEE);
      const updatedDrivers = driverPartners.map((d) => {
        if (d.id === target.assignedTo) {
          return {
            ...d,
            completedRuns: (d.completedRuns || 0) + 1,
            totalEarnings: (d.totalEarnings || 0) + netDriverCut,
          };
        }
        return d;
      });
      setDriverPartners(updatedDrivers);
      try {
        localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updatedDrivers));
      } catch {
        // ignore
      }
    }

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await setDoc(
        docRef,
        {
          status: 'completed',
          paymentStatus: finalPaymentStatus,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: arrayUnion(completeMsg),
        },
        { merge: true }
      );
    }
  };

  // Secure Delivery Verification with 4-Digit Client PIN (Driver Action)
  const completeOrderWithPin = async (orderId: string, enteredPin: string) => {
    if (!user) throw new Error('Must be logged in to complete delivery');

    const target = orders.find((o) => o.id === orderId);
    if (!target) throw new Error('Order not found');

    const cleanEnteredPin = enteredPin.trim();
    const expectedPin = target.deliveryPin || '1234';

    if (cleanEnteredPin !== expectedPin) {
      throw new Error('Invalid Delivery PIN. Please ask the client for the correct 4-digit PIN.');
    }

    const finalPaymentStatus: PaymentStatus =
      target.paymentMethod === 'cod' ? 'collected_cash' : (target.paymentStatus || 'paid_online');

    const completeMsg: ChatMessage = {
      id: 'msg_pin_verified_' + Date.now().toString(36),
      senderId: user.uid,
      senderName: user.name || 'Driver Partner',
      senderRole: 'driver',
      text: `🔐 Verified Delivery PIN (${cleanEnteredPin}). Handover completed successfully! (${finalPaymentStatus === 'collected_cash' ? 'Cash collected' : 'UPI Settled'}).`,
      timestamp: new Date().toISOString(),
    };

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          status: 'completed' as OrderStatus,
          paymentStatus: finalPaymentStatus,
          completedAt: new Date().toISOString(),
          messages: [...(o.messages || []), completeMsg],
        };
      }
      return o;
    });

    // Update assigned driver's earnings & completed run count
    const netDriverCut = Math.max(0, (target.price || 0) - PLATFORM_COMMISSION_FEE);
    const updatedDrivers = driverPartners.map((d) => {
      if (d.id === user.uid || d.id === target.assignedTo) {
        return {
          ...d,
          completedRuns: (d.completedRuns || 0) + 1,
          totalEarnings: (d.totalEarnings || 0) + netDriverCut,
        };
      }
      return d;
    });
    setDriverPartners(updatedDrivers);
    try {
      localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updatedDrivers));
    } catch {
      // ignore
    }

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await setDoc(
        docRef,
        {
          status: 'completed',
          paymentStatus: finalPaymentStatus,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: arrayUnion(completeMsg),
        },
        { merge: true }
      );
    }
  };

  // Send In-App Live Chat Message
  const sendChatMessage = async (orderId: string, text: string) => {
    if (!user || !text.trim()) return;

    const newMsg: ChatMessage = {
      id: 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 5),
      senderId: user.uid,
      senderName: user.name,
      senderRole: user.role,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          messages: [...(o.messages || []), newMsg],
        };
      }
      return o;
    });

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await setDoc(
        docRef,
        {
          messages: arrayUnion(newMsg),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  };

  // Update Service Price (Admin Action)
  const updateServicePrice = async (category: OrderCategory, newPrice: number) => {
    const safePrice = Math.max(10, Number(newPrice) || DEFAULT_PRICES[category]);
    const updated = {
      ...servicePrices,
      [category]: safePrice,
    };
    setServicePrices(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_PRICES_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    if (isFirebaseConfigured && db) {
      try {
        const pricingDocRef = doc(db!, 'config', 'pricing');
        await setDoc(
          pricingDocRef,
          {
            ...updated,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Error syncing pricing to Firestore:', err);
      }
    }
  };

  // Toggle Driver Partner Verification (Admin Action)
  const toggleDriverVerification = async (driverId: string) => {
    const currentDriver = driverPartners.find((d) => d.id === driverId);
    const nextStatus = !(currentDriver?.isVerified ?? false);

    const updated = driverPartners.map((d) =>
      d.id === driverId
        ? {
            ...d,
            isVerified: nextStatus,
            isDriverVerified: nextStatus,
            status: nextStatus ? 'approved' : 'pending',
            verified: nextStatus,
          }
        : d
    );
    setDriverPartners(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    // If current logged-in user is this driver, update their profile immediately
    if (user && user.uid === driverId) {
      const updatedUser: UserProfile = {
        ...user,
        isDriverVerified: nextStatus,
        isVerified: nextStatus,
        status: nextStatus ? 'approved' : 'pending',
        verified: nextStatus,
      };
      setUser(updatedUser);
      try {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updatedUser));
      } catch {
        // ignore
      }
    }

    if (isFirebaseConfigured && db) {
      const targetDriver = updated.find((d) => d.id === driverId);
      const driverDocRef = doc(db!, 'drivers', driverId);
      await setDoc(
        driverDocRef,
        {
          id: driverId,
          name: targetDriver?.name || 'Driver Partner',
          phone: targetDriver?.phone || '',
          isVerified: nextStatus,
          isDriverVerified: nextStatus,
          status: nextStatus ? 'approved' : 'pending',
          verified: nextStatus,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const userDocRef = doc(db!, 'users', driverId);
      await setDoc(
        userDocRef,
        {
          isApproved: nextStatus,
          isDriverVerified: nextStatus,
          isVerified: nextStatus,
          status: nextStatus ? 'approved' : 'pending',
          verified: nextStatus,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  };

  // Fleet Management: Approve Driver (Admin Action)
  const approveDriver = async (driverId: string) => {
    const updated = driverPartners.map((d) => {
      if (d.id === driverId) {
        return {
          ...d,
          isApproved: true,
          isVerified: true,
          isDriverVerified: true,
          status: 'approved',
          verified: true,
        };
      }
      return d;
    });
    setDriverPartners(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updated));
    } catch {}

    if (user?.uid === driverId) {
      const updatedUser: UserProfile = {
        ...user,
        isApproved: true,
        isDriverVerified: true,
        isVerified: true,
        status: 'approved',
        verified: true,
        updatedAt: new Date().toISOString(),
      };
      setUser(updatedUser);
      try {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updatedUser));
      } catch {}
    }

    if (isFirebaseConfigured && db) {
      const targetDriver = updated.find((d) => d.id === driverId);
      await setDoc(
        doc(db!, 'drivers', driverId),
        {
          id: driverId,
          name: targetDriver?.name || 'Driver Partner',
          phone: targetDriver?.phone || '',
          isApproved: true,
          isVerified: true,
          isDriverVerified: true,
          status: 'approved',
          verified: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db!, 'users', driverId),
        {
          isApproved: true,
          isDriverVerified: true,
          isVerified: true,
          status: 'approved',
          verified: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  };

  // Fleet Management: Block Driver (Admin Action - Forces Offline)
  const blockDriver = async (driverId: string) => {
    const updated = driverPartners.map((d) => {
      if (d.id === driverId) {
        return {
          ...d,
          isApproved: false,
          isVerified: false,
          isDriverVerified: false,
          status: 'blocked',
          verified: false,
          isOnline: false,
        };
      }
      return d;
    });
    setDriverPartners(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updated));
    } catch {}

    if (user?.uid === driverId) {
      setIsDriverOnline(false);
      const updatedUser: UserProfile = {
        ...user,
        isApproved: false,
        isDriverVerified: false,
        isVerified: false,
        status: 'blocked',
        verified: false,
        updatedAt: new Date().toISOString(),
      };
      setUser(updatedUser);
      try {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updatedUser));
        localStorage.setItem(LOCAL_STORAGE_DUTY_KEY, 'false');
      } catch {}
    }

    if (isFirebaseConfigured && db) {
      const targetDriver = updated.find((d) => d.id === driverId);
      await setDoc(
        doc(db!, 'drivers', driverId),
        {
          id: driverId,
          name: targetDriver?.name || 'Driver Partner',
          phone: targetDriver?.phone || '',
          isApproved: false,
          isVerified: false,
          isDriverVerified: false,
          status: 'blocked',
          verified: false,
          isOnline: false,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db!, 'users', driverId),
        {
          isApproved: false,
          isDriverVerified: false,
          isVerified: false,
          status: 'blocked',
          verified: false,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  };

  // Fleet Management: Delete Driver (Admin Action)
  const deleteDriver = async (driverId: string) => {
    const updated = driverPartners.filter((d) => d.id !== driverId);
    setDriverPartners(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updated));
    } catch {}

    if (isFirebaseConfigured && db) {
      try {
        await deleteDoc(doc(db!, 'drivers', driverId));
      } catch (err) {
        console.warn('Error deleting driver doc:', err);
      }
    }
  };

  // Settle Driver Weekly Payout (Admin Action)
  const settleDriverPayout = async (data: {
    driverId: string;
    driverName: string;
    payoutUpiId: string;
    amount: number;
    completedRunsCount: number;
    paymentRef?: string;
  }) => {
    const settlementId = 'set_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const newSettlement: PayoutSettlementRecord = {
      id: settlementId,
      driverId: data.driverId,
      driverName: data.driverName,
      payoutUpiId: data.payoutUpiId,
      amount: data.amount,
      completedRunsCount: data.completedRunsCount,
      settledByAdminId: user?.uid || 'admin',
      settledByAdminName: user?.name || 'Super Admin',
      paymentRef: data.paymentRef || 'UPI_WEEKLY_' + Date.now(),
      settledAt: new Date().toISOString(),
      status: 'settled',
    };

    if (isFirebaseConfigured && db) {
      try {
        const settlementDocRef = doc(db!, 'payout_settlements', settlementId);
        await setDoc(settlementDocRef, sanitizeFirestoreData(newSettlement));

        const driverDocRef = doc(db!, 'drivers', data.driverId);
        await setDoc(
          driverDocRef,
          sanitizeFirestoreData({
            lastSettledAt: newSettlement.settledAt,
            lastSettledAmount: data.amount,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      } catch (err) {
        console.error('Error saving settlement to Firestore:', err);
      }
    }

    setDriverPartners((prev) =>
      prev.map((d) =>
        d.id === data.driverId
          ? {
              ...d,
              lastSettledAt: newSettlement.settledAt,
            }
          : d
      )
    );
  };

  // Dual Broadcast Messaging (Admin Action)
  const sendBroadcastNotification = async (target: 'drivers' | 'clients' | 'all', text: string) => {
    if (!text.trim()) return;

    const newNotif: SystemNotification = {
      id: 'notif_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      target,
      text: text.trim(),
      senderName: user?.name || 'Admin Desk',
      createdAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'system_notifications', newNotif.id);
      await setDoc(docRef, newNotif);
    }
  };

  // Delete Broadcast Notification (Admin Action)
  const deleteBroadcastNotification = async (notifId: string) => {
    if (!notifId) return;
    if (isFirebaseConfigured && db) {
      try {
        await deleteDoc(doc(db!, 'system_notifications', notifId));
      } catch (err) {
        console.error('Error deleting broadcast notif:', err);
      }
    }
  };

  // Clear All Broadcast Notifications (Admin Action)
  const clearAllBroadcastNotifications = async () => {
    if (isFirebaseConfigured && db) {
      try {
        const notifsRef = collection(db!, 'system_notifications');
        const snap = await getDocs(notifsRef);
        const delPromises = snap.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(delPromises);
      } catch (err) {
        console.error('Error clearing broadcast notifs:', err);
      }
    }
  };

  // Confirm Order Payment (UPI UTR Submission by Client)
  const confirmOrderPayment = async (orderId: string, transactionRef?: string) => {
    const cleanUtr = transactionRef?.trim() || '';
    const payMsg: ChatMessage = {
      id: 'msg_pay_' + Date.now().toString(36),
      senderId: user?.uid || 'client',
      senderName: user?.name || 'Client',
      senderRole: 'client',
      text: `💳 Online UPI Payment UTR submitted for verification: ${cleanUtr || 'Pending Submission'}`,
      timestamp: new Date().toISOString(),
    };

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          paymentMethod: 'UPI' as PaymentMethod,
          paymentStatus: 'pending_verification' as PaymentStatus,
          transactionRef: cleanUtr,
          utrNumber: cleanUtr,
          messages: [...(o.messages || []), payMsg],
        };
      }
      return o;
    });

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await setDoc(
        docRef,
        {
          paymentMethod: 'UPI',
          paymentStatus: 'pending_verification',
          transactionRef: cleanUtr,
          utrNumber: cleanUtr,
          updatedAt: new Date().toISOString(),
          messages: arrayUnion(payMsg),
        },
        { merge: true }
      );
    }
  };

  // Mark Cash Collected (Driver / Admin Action upon Delivery)
  const markCashCollected = async (orderId: string) => {
    const collectMsg: ChatMessage = {
      id: 'msg_cash_' + Date.now().toString(36),
      senderId: user?.uid || 'driver',
      senderName: user?.name || 'Driver Partner',
      senderRole: user?.role || 'driver',
      text: `💵 Physical cash payment received in full from client upon delivery.`,
      timestamp: new Date().toISOString(),
    };

    const updated = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          paymentStatus: 'collected_cash' as PaymentStatus,
          messages: [...(o.messages || []), collectMsg],
        };
      }
      return o;
    });

    persistLocalOrders(updated);

    if (isFirebaseConfigured && db) {
      const docRef = doc(db!, 'orders', orderId);
      await updateDoc(docRef, {
        paymentStatus: 'collected_cash',
        messages: arrayUnion(collectMsg),
      });
    }
  };

  // Fleet Management: Suspend Driver for Anti-Brute-Force Lockout
  const suspendDriverForBruteForce = async (driverId: string, orderId: string) => {
    if (!driverId) return;

    // 1. Force driver offline and suspended in state
    const updatedDrivers = driverPartners.map((d) =>
      d.id === driverId
        ? {
            ...d,
            isOnline: false,
            isVerified: false,
            isDriverVerified: false,
            isApproved: false,
            status: 'blocked',
            isSuspended: true,
            suspensionReason: `Security lockout: 5 consecutive failed Delivery PIN attempts on order ${orderId}`,
          }
        : d
    );
    setDriverPartners(updatedDrivers);
    try {
      localStorage.setItem(LOCAL_STORAGE_DRIVERS_KEY, JSON.stringify(updatedDrivers));
    } catch {}

    if (user?.uid === driverId) {
      setIsDriverOnline(false);
      const updatedUser: UserProfile = {
        ...user,
        isApproved: false,
        isDriverVerified: false,
        isVerified: false,
        status: 'blocked',
        verified: false,
        isSuspended: true,
        suspensionReason: `Security lockout: 5 consecutive failed Delivery PIN attempts on order ${orderId}`,
        updatedAt: new Date().toISOString(),
      };
      setUser(updatedUser);
      try {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(updatedUser));
        localStorage.setItem(LOCAL_STORAGE_DUTY_KEY, 'false');
      } catch {}
    }

    // 2. Persist to Firestore
    if (isFirebaseConfigured && db) {
      try {
        await setDoc(
          doc(db!, 'drivers', driverId),
          {
            id: driverId,
            isOnline: false,
            isVerified: false,
            isDriverVerified: false,
            isApproved: false,
            status: 'blocked',
            isSuspended: true,
            suspensionReason: `Security lockout: 5 consecutive failed Delivery PIN attempts on order ${orderId}`,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        await setDoc(
          doc(db!, 'users', driverId),
          {
            isApproved: false,
            isDriverVerified: false,
            isVerified: false,
            status: 'blocked',
            isSuspended: true,
            suspensionReason: `Security lockout: 5 consecutive failed Delivery PIN attempts on order ${orderId}`,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        // 3. Post system security alert
        await sendBroadcastNotification(
          'all',
          `🚨 SECURITY LOCKOUT: Driver partner (${user?.name || driverId}) has been suspended after 5 failed Delivery PIN verification attempts on Order #${orderId}.`
        );
      } catch (err) {
        console.error('Error suspending driver for brute force:', err);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isFirstLogin,
        showOnboarding,
        setShowOnboarding,
        signInWithGoogle,
        saveOnboardingProfile,
        switchRole,
        signOut,
        orders,
        createOrder,
        cancelOrder,
        deleteOrder,
        clearAllOrders,
        isDriverOnline,
        toggleDriverDuty,
        driverLocation,
        declineOrderOffer,
        acceptOrder,
        uploadBillPhoto,
        approveDelivery,
        completeOrderWithPin,
        sendChatMessage,
        applyAsDriver,
        registerDriverVehicle,
        servicePrices,
        updateServicePrice,
        driverPartners,
        toggleDriverVerification,
        approveDriver,
        blockDriver,
        deleteDriver,
        suspendDriverForBruteForce,
        sendBroadcastNotification,
        deleteBroadcastNotification,
        clearAllBroadcastNotifications,
        adminAcceptCompanionOrder,
        settleDriverPayout,
        confirmOrderPayment,
        markCashCollected,
        isAdminAuthenticated,
        showAdminPinModal,
        setShowAdminPinModal,
        requestAdminAccess,
        verifyAdminPin,
        supportWhatsAppNumber,
        updateSupportWhatsAppNumber,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
