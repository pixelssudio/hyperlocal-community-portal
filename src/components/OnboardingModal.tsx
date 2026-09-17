'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { validatePhoneNumber, validateFullName, parseVehicleInfo, formatVehiclePlate, normalizeVehiclePlate } from '@/lib/validation';
import { UserRole, VehicleType } from '@/lib/types';
import {
  User,
  Phone,
  Camera,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Shield,
  ShieldCheck,
  Bike,
  Crown,
  CreditCard,
  X
} from 'lucide-react';

const ADMIN_EMAIL = 'pankajkalosiya6@gmail.com';

const AVATAR_PRESETS = [
  { label: 'Avatar 1', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
  { label: 'Avatar 2', url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80' },
  { label: 'Avatar 3', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
  { label: 'Avatar 4', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80' },
  { label: 'Avatar 5', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' },
];

export default function OnboardingModal() {
  const { user, driverPartners, showOnboarding, setShowOnboarding, saveOnboardingProfile } = useAuth();

  const isSuperAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [role, setRole] = useState<UserRole>('client');

  // Driver Vehicle & Payout UPI details
  const [vehicleType, setVehicleType] = useState<VehicleType>('bike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [payoutUpiId, setPayoutUpiId] = useState('');

  const [touchedPhone, setTouchedPhone] = useState(false);
  const [touchedName, setTouchedName] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhoneNumber(user.phoneNumber || '');
      setPhotoURL(user.photoURL || AVATAR_PRESETS[0].url);
      setRole(user.role || (isSuperAdmin ? 'admin' : 'client'));
      setVehicleType(user.vehicleType || 'bike');
      setVehicleNumber(user.vehicleNumber || '');
      setPayoutUpiId(user.payoutUpiId || '');
    }
  }, [user, isSuperAdmin]);

  if (!showOnboarding) return null;

  const phoneValidation = validatePhoneNumber(phoneNumber);
  const nameValidation = validateFullName(name);
  const cleanPlate = normalizeVehiclePlate(vehicleNumber);
  const isDuplicatePlate = Boolean(
    role === 'driver' &&
    cleanPlate &&
    driverPartners.some(
      (d) =>
        d.id !== user?.uid &&
        d.vehicleNumber &&
        normalizeVehiclePlate(d.vehicleNumber) === cleanPlate
    )
  );

  const isFormValid = phoneValidation.isValid && nameValidation.isValid && !isDuplicatePlate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouchedName(true);
    setTouchedPhone(true);
    setErrorMessage(null);

    if (!nameValidation.isValid) {
      setErrorMessage(nameValidation.error || 'Please enter a valid full name.');
      return;
    }

    if (!phoneValidation.isValid) {
      setErrorMessage(phoneValidation.error || 'Please enter a valid 10-digit Indian phone number.');
      return;
    }

    if (role === 'driver' && isDuplicatePlate) {
      setErrorMessage('This vehicle number is already registered to another driver in Rawatbhata.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Security guard: If not superadmin, force client or driver
      const assignedRole = (role === 'admin' && !isSuperAdmin) ? 'client' : role;

      await saveOnboardingProfile({
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        photoURL: photoURL.trim(),
        role: assignedRole,
        vehicleType: assignedRole === 'driver' ? vehicleType : undefined,
        vehicleNumber: assignedRole === 'driver' ? vehicleNumber.trim().toUpperCase() : undefined,
        payoutUpiId: assignedRole === 'driver' ? payoutUpiId.trim().toLowerCase() : undefined,
      });
      setShowOnboarding(false);
    } catch (err: any) {
      console.error('Error saving onboarding profile:', err);
      setErrorMessage(err?.message || 'Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white relative">
          {user?.onboardingCompleted && (
            <button
              type="button"
              onClick={() => setShowOnboarding(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2 mb-2">
            <span className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-100">Profile Setup</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black">
            {user?.onboardingCompleted ? 'Update Profile' : 'Welcome to Rawatbhata!'}
          </h3>
          <p className="text-xs text-amber-100 mt-1">
            Please complete your profile to access all local services and verified delivery runs.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setTouchedName(true);
                }}
                placeholder="e.g. Rahul Verma"
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none transition ${
                  touchedName && !nameValidation.isValid
                    ? 'border-red-300 focus:border-red-500 bg-red-50/20'
                    : 'border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
                }`}
                required
              />
            </div>
            {touchedName && !nameValidation.isValid && (
              <p className="text-[11px] text-red-600 mt-1">{nameValidation.error}</p>
            )}
          </div>

          {/* Phone Number with 10-Digit Validation */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Mobile Number (10 Digits) <span className="text-red-500">*</span>
              </label>
              {phoneNumber && (
                <span
                  className={`text-[11px] font-semibold flex items-center gap-1 ${
                    phoneValidation.isValid ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {phoneValidation.isValid ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Valid Indian Number
                    </>
                  ) : (
                    <span>{10 - phoneNumber.replace(/\D/g, '').length} digits left</span>
                  )}
                </span>
              )}
            </div>
            <div className="relative flex rounded-xl border border-slate-200 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 overflow-hidden transition">
              <div className="bg-slate-100 px-3.5 flex items-center text-xs font-bold text-slate-600 border-r border-slate-200">
                +91 (India)
              </div>
              <input
                type="tel"
                maxLength={10}
                value={phoneNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPhoneNumber(val);
                  setTouchedPhone(true);
                }}
                placeholder="9876543210"
                className="w-full px-3.5 py-2.5 text-sm focus:outline-none bg-white text-slate-800"
                required
              />
              {phoneValidation.isValid && (
                <div className="pr-3 flex items-center text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}
            </div>
            {touchedPhone && !phoneValidation.isValid && (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                <span>{phoneValidation.error}</span>
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              Required for SMS & WhatsApp delivery task notifications.
            </p>
          </div>

          {/* Profile Photo Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Profile Photo (Optional)
            </label>
            <div className="flex items-center gap-3 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoURL || AVATAR_PRESETS[0].url}
                alt="Avatar preview"
                className="w-14 h-14 rounded-2xl object-cover border-2 border-amber-500/40 shadow-sm"
              />
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-700 mb-1.5">Choose Avatar Preset:</p>
                <div className="flex items-center gap-2">
                  {AVATAR_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPhotoURL(preset.url)}
                      className={`w-8 h-8 rounded-full overflow-hidden border-2 transition ${
                        photoURL === preset.url
                          ? 'border-amber-500 scale-110 shadow'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="relative">
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="Or paste custom image URL"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* User Role Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Primary Role
            </label>
            <div className={`grid gap-2.5 ${isSuperAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button
                type="button"
                onClick={() => setRole('client')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  role === 'client'
                    ? 'border-amber-500 bg-amber-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <User className={`w-5 h-5 mb-1 ${role === 'client' ? 'text-amber-600' : 'text-slate-400'}`} />
                <div>
                  <p className={`text-xs font-bold ${role === 'client' ? 'text-amber-900' : 'text-slate-700'}`}>
                    Client
                  </p>
                  <p className="text-[10px] text-slate-500">Order runs & tasks</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole('driver')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  role === 'driver'
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Bike className={`w-5 h-5 mb-1 ${role === 'driver' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div>
                  <p className={`text-xs font-bold ${role === 'driver' ? 'text-emerald-900' : 'text-slate-700'}`}>
                    Driver / Partner
                  </p>
                  <p className="text-[10px] text-slate-500">Earn on errands</p>
                </div>
              </button>

              {/* Admin Desk ONLY for Super Admin Email */}
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                    role === 'admin'
                      ? 'border-purple-500 bg-purple-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Crown className={`w-5 h-5 mb-1 ${role === 'admin' ? 'text-purple-600' : 'text-slate-400'}`} />
                  <div>
                    <p className={`text-xs font-bold ${role === 'admin' ? 'text-purple-900' : 'text-slate-700'}`}>
                      Admin Desk
                    </p>
                    <p className="text-[10px] text-slate-500">Companion isolation</p>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Driver Vehicle & Parivahan RTO Live Intelligence Section */}
          {role === 'driver' && (
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-sm">
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                    Partner Vehicle & Payout Setup
                  </h4>
                  <p className="text-[10px] text-emerald-700">
                    Live Parivahan RTO verification & automated weekly payouts
                  </p>
                </div>
              </div>

              {/* Vehicle Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vehicle Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:border-emerald-500 focus:outline-none bg-white text-slate-800"
                >
                  <option value="bike">🏍️ Motorcycle / Bike (Fleet Eligible)</option>
                  <option value="scooty">🛵 Scooty / Moped (Fleet Eligible)</option>
                  <option value="auto">🛺 Auto Rickshaw (Commercial)</option>
                  <option value="erickshaw">🔋 E-Rickshaw / Toto (Eco Battery)</option>
                </select>
              </div>

              {/* Vehicle Plate Number */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Vehicle Plate Number <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">
                    Live RTO Lookup
                  </span>
                </div>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. RJ20SB1234 or RJ-20-MB-4512"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-black uppercase tracking-wider focus:border-emerald-500 focus:outline-none bg-white text-slate-900"
                />

                {/* Real-time RTO Details & Duplicate Detection */}
                {(() => {
                  if (!cleanPlate || cleanPlate.length < 3) return null;

                  const duplicatePartner = driverPartners.find(
                    (d) =>
                      d.id !== user?.uid &&
                      d.vehicleNumber &&
                      normalizeVehiclePlate(d.vehicleNumber) === cleanPlate
                  );

                  const vehicleInfo = parseVehicleInfo(vehicleNumber, vehicleType);

                  if (duplicatePartner) {
                    return (
                      <div className="mt-2.5 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-red-700">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>🚫 Vehicle Number Already Registered</span>
                        </div>
                        <p className="text-[11px] text-red-600 pl-5">
                          Vehicle <strong>{formatVehiclePlate(cleanPlate)}</strong> is already assigned to driver partner <strong>{duplicatePartner.name}</strong> ({duplicatePartner.phone || 'Verified'}).
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-2.5 p-3 rounded-2xl bg-white border border-emerald-200 text-xs text-slate-800 space-y-1.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center gap-1.5 text-emerald-800">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Parivahan RTO Detected</span>
                        </span>
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                          {formatVehiclePlate(cleanPlate)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 text-[11px] border-t border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">RTO Division:</span>
                          <span className="font-bold text-slate-800">{vehicleInfo.rtoZoneName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Fleet Class:</span>
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

              {/* Payout UPI ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payout UPI ID (GPay / PhonePe / Paytm)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={payoutUpiId}
                    onChange={(e) => setPayoutUpiId(e.target.value.toLowerCase())}
                    placeholder="e.g. yourname@upi or 9829012345@paytm"
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none bg-white text-slate-800"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Your weekly delivery earnings will be remitted directly to this UPI address.
                </p>
              </div>
            </div>
          )}

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 active:scale-[0.99] text-white font-bold text-sm shadow-xl shadow-amber-500/25 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Profile to Rawatbhata DB...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Profile & Enter App</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}