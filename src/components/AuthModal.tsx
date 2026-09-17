'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Sparkles,
  ShieldCheck,
  Zap,
  MapPin,
  HeartHandshake,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function AuthModal() {
  const { signInWithGoogle } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign-in failed:', err);
      setErrorMsg(err?.message || 'Unable to sign in. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative">
        {/* Top decorative banner */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 p-8 text-white text-center relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm mb-3">
            <MapPin className="w-3.5 h-3.5" />
            <span>Rawatbhata Community Platform</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Rawatbhata Direct</h2>
          <p className="text-amber-100 text-xs sm:text-sm mt-1 max-w-xs mx-auto">
            Hyperlocal delivery, daily errands, companion assistance & rides in Rawatbhata.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Features Highlights */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="p-2 rounded-xl bg-amber-100 text-amber-700 mt-0.5">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Ultra-Fast Local Errands</h4>
                <p className="text-[11px] text-slate-500">Pick up medicines, groceries, or market parcels anywhere in Rawatbhata.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Direct Role Access</h4>
                <p className="text-[11px] text-slate-500">Seamlessly switch between Client, Driver, and Admin workspaces.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="p-2 rounded-xl bg-purple-100 text-purple-700 mt-0.5">
                <HeartHandshake className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">Private Companion Services</h4>
                <p className="text-[11px] text-slate-500">Safe, isolated companion and listening requests routed strictly to Admin.</p>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1-Click Google Sign In Action */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold text-sm shadow-xl shadow-slate-900/10 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed group"
            >
              {isLoggingIn ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Connecting to Google...</span>
                </div>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.02 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with 1-Click Google Sign-In</span>
                </>
              )}
            </button>

            <p className="text-[11px] text-center text-slate-400 mt-3 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Instant access. No password needed.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
