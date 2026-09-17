'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import AuthModal from '@/components/AuthModal';
import ClientHomeScreen from '@/components/ClientHomeScreen';
import DriverPortal from '@/components/DriverPortal';
import AdminDashboard from '@/components/AdminDashboard';
import { Sparkles } from 'lucide-react';

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white animate-spin">
          <Sparkles className="w-6 h-6" />
        </div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Connecting to Rawatbhata Hyperlocal Network...
        </p>
      </div>
    );
  }

  // Not Logged In -> Show 1-Click Google Auth Screen
  if (!user) {
    return <AuthModal />;
  }

  // Driver Role -> Show dedicated Driver Portal
  if (user.role === 'driver') {
    return <DriverPortal />;
  }

  // Admin Role -> Show dedicated Admin Control Dashboard
  if (user.role === 'admin') {
    return <AdminDashboard />;
  }

  // Default: Client Role -> Client Home Screen
  return <ClientHomeScreen />;
}
