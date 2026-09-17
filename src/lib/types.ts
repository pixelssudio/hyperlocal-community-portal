export type UserRole = 'client' | 'driver' | 'admin';

export const ADMIN_EMAIL_WHITELIST = [
  'admin@rawatbhata.in',
  'the.musafir@gmail.com',
  'priya.sharma.rawatbhata@gmail.com',
  'pankajkalosiya6@gmail.com',
];

export const ADMIN_MASTER_PIN = '7890';

export const PLATFORM_COMMISSION_FEE = 5; // Flat ₹5 per completed delivery run

export const RAWATBHATA_SPOTS = [
  'Sector-1',
  'Sector-2',
  'Sector-3',
  'Sector-4',
  'Main Bazar',
  'RPS Lake Viewpoint',
  'Bhabha Colony',
  'Hospital Road',
] as const;

export type VehicleType = 'bike' | 'scooty' | 'auto' | 'erickshaw';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface UserLocation extends GeoPoint {
  updatedAt?: string;
  heading?: number;
  speed?: number;
  spotName?: string;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phoneNumber: string;
  photoURL?: string;
  role: UserRole;
  isApproved?: boolean;
  isDriverVerified?: boolean;
  isVerified?: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'blocked' | string;
  verified?: boolean;
  isSuspended?: boolean;
  suspensionReason?: string;
  vehicleType?: VehicleType;
  vehicleNumber?: string;
  payoutUpiId?: string;
  location?: UserLocation;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OrderCategory =
  | 'errand'
  | 'food'
  | 'delivery'
  | 'ride'
  | 'companion_listening_ghumna';

export type TargetAudience = 'driver_pool' | 'admin_only';

export type OrderStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'photo_uploaded'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'upi_instant' | 'cod' | 'UPI' | 'COD' | 'razorpay';

export type PaymentStatus = 'pending' | 'pending_verification' | 'paid_online' | 'collected_cash';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  timestamp: string;
}

export interface Order {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  category: OrderCategory;
  categoryLabel: string;
  title: string;
  description: string;
  pickupAddress: string;
  dropAddress: string;
  pickupCoords?: GeoPoint;
  dropCoords?: GeoPoint;
  price: number;
  status: OrderStatus;
  targetAudience: TargetAudience; // 'admin_only' for Companion / Listening / Ghumna
  // Proximity & Cascading Dispatch Fields
  dispatchMode?: 'targeted' | 'broadcast';
  currentOfferDriverId?: string;
  currentOfferDriverName?: string;
  currentOfferDriverDistance?: number;
  currentOfferExpiresAt?: string;
  rejectedDrivers?: string[]; // Driver UIDs who passed / timed out
  // Payment Details
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  transactionRef?: string;
  utrNumber?: string;
  paidAt?: string;
  // Security & Confirmation
  deliveryPin?: string; // 4-digit OTP generated at order creation
  // Driver Details
  assignedTo?: string; // Driver or Admin UID
  driverId?: string; // Driver UID alias
  driverName?: string;
  driverPhone?: string;
  driverPhoto?: string;
  billPhotoURL?: string;
  billUploadedAt?: string;
  completedAt?: string;
  messages?: ChatMessage[];
  createdAt: string;
}

export interface ServiceCategoryOption {
  id: OrderCategory;
  name: string;
  shortDesc: string;
  iconName: string;
  color: string;
  targetAudience: TargetAudience;
  badge?: string;
  startingPrice: number;
}

export interface DriverPartnerRecord {
  id: string;
  name: string;
  phone: string;
  photoURL?: string;
  isOnline: boolean;
  isApproved?: boolean;
  isVerified: boolean;
  isDriverVerified?: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'blocked' | string;
  verified?: boolean;
  isSuspended?: boolean;
  suspensionReason?: string;
  vehicleType?: VehicleType;
  vehicleNumber?: string;
  payoutUpiId?: string;
  location?: UserLocation;
  completedRuns: number;
  totalEarnings: number;
  rating: number;
  joinedDate: string;
}

export interface SystemNotification {
  id: string;
  target: 'drivers' | 'clients' | 'all';
  text: string;
  senderName?: string;
  createdAt: string;
}

export interface ServicePriceConfig {
  categoryId: OrderCategory;
  name: string;
  basePrice: number;
  unitLabel: string;
  description: string;
}

export interface DriverPayoutSummary {
  driverId: string;
  driverName: string;
  driverPhone: string;
  driverPhoto?: string;
  vehicleType?: VehicleType;
  vehicleNumber?: string;
  payoutUpiId?: string;
  totalCompletedRuns: number;
  grossOrderValue: number;
  platformFeeTotal: number;
  driverGrossEarnings: number;
  cashOrdersCount: number;
  cashCollectedByDriver: number;
  cashPlatformFeeOwed: number;
  onlineOrdersCount: number;
  onlinePaidToAdmin: number;
  onlineEarningsOwedToDriver: number;
  netWeeklyPayoutDue: number;
  lastSettledAt?: string;
}

export interface PayoutSettlementRecord {
  id: string;
  driverId: string;
  driverName: string;
  payoutUpiId: string;
  amount: number;
  completedRunsCount: number;
  settledByAdminId: string;
  settledByAdminName: string;
  paymentRef?: string;
  settledAt: string;
  status: 'settled';
}


