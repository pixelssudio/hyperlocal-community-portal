'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/lib/types';
import { 
  Bike, 
  User as UserIcon, 
  Crown, 
  ChevronDown, 
  LogOut,
  Bell,
  BellRing,
  Check
} from 'lucide-react';
import { requestBrowserNotificationPermission, sendBrowserPushNotification, getNotificationPermissionState, playNotificationSound } from '@/lib/audio';

const ADMIN_EMAIL = 'pankajkalosiya6@gmail.com';

export default function Navbar() {
  const auth = useAuth() as any;
  const user = auth?.user;
  const switchRole = auth?.switchRole;
  const logoutFn = auth?.logout || auth?.logOut || auth?.signOutUser || auth?.signOut;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [pushPermission, setPushPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');

  useEffect(() => {
    setPushPermission(getNotificationPermissionState());
  }, []);

  const handleActivatePush = async () => {
    const granted = await requestBrowserNotificationPermission();
    setPushPermission(getNotificationPermissionState());
    if (granted) {
      playNotificationSound('order_accepted');
      sendBrowserPushNotification(
        '🔔 Phone Notifications Active!',
        'You will now receive instant alerts in your notification bar & lock screen even when the app is closed!'
      );
    }
  };

  const isSuperAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const handleRoleSelect = (role: UserRole) => {
    setIsDropdownOpen(false);
    if (role === 'admin' && !isSuperAdmin) {
      return;
    }
    switchRole?.(role);
  };

  const getRoleBadge = () => {
    if (user?.role === 'admin') {
      return {
        label: 'Admin Desk',
        icon: <Crown className="w-3.5 h-3.5 text-purple-600" />,
        color: 'bg-purple-50 text-purple-700 border-purple-200',
      };
    }
    if (user?.role === 'driver') {
      return {
        label: 'Driver Mode',
        icon: <Bike className="w-3.5 h-3.5 text-emerald-600" />,
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    }
    return {
      label: 'Client',
      icon: <UserIcon className="w-3.5 h-3.5 text-amber-600" />,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  };

  const badge = getRoleBadge();

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-amber-500/20">
            R
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                Rawatbhata
              </span>
              <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded">
                DIRECT
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-none">
              📍 Rawatbhata (323303), RJ
            </p>
          </div>
        </div>

        {/* Right Actions */}
        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Partner Quick Link */}
            {user.role === 'client' && (
              <button
                type="button"
                onClick={() => switchRole?.('driver')}
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition"
              >
                <Bike className="w-3.5 h-3.5" />
                Become a Partner
              </button>
            )}

            {/* Phone Push Notification Activator */}
            {pushPermission === 'granted' ? (
              <button
                type="button"
                onClick={handleActivatePush}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-bold transition hover:bg-emerald-100"
                title="Phone System Notifications Active! Click to send test alert."
              >
                <BellRing className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                <span>Push Active</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleActivatePush}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-95 text-slate-950 text-xs font-black shadow-md shadow-amber-500/20 transition animate-pulse"
                title="Click to allow phone notifications on lock screen and top bar"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>🔔 Allow Phone Alerts</span>
              </button>
            )}

            {/* Role Switcher Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-sm ${badge.color}`}
              >
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mr-0.5">
                  Role:
                </span>
                {badge.icon}
                <span>{badge.label}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-70" />
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Switch Role
                  </p>

                  <button
                    type="button"
                    onClick={() => handleRoleSelect('client')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl text-left transition ${
                      user.role === 'client' ? 'bg-amber-50 text-amber-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-amber-500" /> Client User
                    </span>
                    {user.role === 'client' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleSelect('driver')}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl text-left transition ${
                      user.role === 'driver' ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Bike className="w-3.5 h-3.5 text-emerald-500" /> Driver Partner
                    </span>
                    {user.role === 'driver' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  </button>

                  {/* ADMIN DESK ONLY FOR SUPER ADMIN */}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleRoleSelect('admin')}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl text-left transition ${
                        user.role === 'admin' ? 'bg-purple-50 text-purple-900' : 'text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Crown className="w-3.5 h-3.5 text-purple-500" /> Admin Desk
                      </span>
                      {user.role === 'admin' && <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Profile Initial */}
            <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
              {user.name ? user.name.charAt(0) : 'U'}
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => logoutFn?.()}
              className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}