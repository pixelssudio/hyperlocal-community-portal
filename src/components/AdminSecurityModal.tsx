'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  X,
  AlertCircle,
  CheckCircle2,
  Crown,
  Sparkles,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export default function AdminSecurityModal() {
  const { showAdminPinModal, setShowAdminPinModal, verifyAdminPin } = useAuth();
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);

  useEffect(() => {
    let interval: any;
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  if (!showAdminPinModal) return null;

  const isLockedOut = lockoutTimer > 0;

  const handleKeypadPress = (val: string) => {
    if (isLockedOut) return;
    if (pin.length < 4) {
      const nextPin = pin + val;
      setPin(nextPin);
      setErrorMsg(null);
      if (nextPin.length === 4) {
        checkPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (isLockedOut) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    if (isLockedOut) return;
    setPin('');
    setErrorMsg(null);
  };

  const checkPin = (enteredPin: string) => {
    const isValid = verifyAdminPin(enteredPin);
    if (isValid) {
      setIsSuccess(true);
      setErrorMsg(null);
      setFailedAttempts(0);
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setPin('');
      if (nextAttempts >= 5) {
        setLockoutTimer(60);
        setErrorMsg('⚠️ Too many failed attempts. Keypad locked for 60 seconds.');
      } else {
        setErrorMsg(`Incorrect Security PIN. (${5 - nextAttempts} attempts remaining before lockout)`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="max-w-sm w-full bg-slate-900 text-white rounded-3xl shadow-2xl border border-purple-800/50 overflow-hidden flex flex-col relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            setShowAdminPinModal(false);
            setPin('');
            setErrorMsg(null);
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Header */}
        <div className="p-6 text-center space-y-2 border-b border-slate-800/80">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-600/30">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-lg font-black tracking-tight">Admin Passkey Guard</h3>
          <p className="text-xs text-purple-200/70 max-w-xs mx-auto">
            Authorized platform administrator authentication.
          </p>
        </div>

        {/* Body & PIN Dots */}
        <div className="p-6 space-y-5">
          {isLockedOut ? (
            <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-xs text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 animate-pulse" />
              <span>Security Lockout: Please wait <strong>{lockoutTimer}s</strong> to retry.</span>
            </div>
          ) : errorMsg ? (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {isSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Security PIN verified! Unlocking Admin Desk...</span>
            </div>
          )}

          {/* 4 PIN Dots */}
          <div className="flex items-center justify-center gap-4 py-2">
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = pin.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    isFilled
                      ? 'bg-amber-400 scale-125 shadow-md shadow-amber-400/50'
                      : 'bg-slate-700 border border-slate-600'
                  }`}
                />
              );
            })}
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                disabled={isLockedOut}
                onClick={() => handleKeypadPress(num)}
                className="h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-base font-bold text-white transition flex items-center justify-center border border-slate-700 shadow-sm"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={isLockedOut}
              onClick={handleClear}
              className="h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-300 transition flex items-center justify-center border border-slate-700 shadow-sm"
              title="Clear PIN"
            >
              C
            </button>
            <button
              type="button"
              disabled={isLockedOut}
              onClick={() => handleKeypadPress('0')}
              className="h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-base font-bold text-white transition flex items-center justify-center border border-slate-700 shadow-sm"
            >
              0
            </button>
            <button
              type="button"
              disabled={isLockedOut}
              onClick={handleBackspace}
              className="h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-xs font-bold text-slate-300 transition flex items-center justify-center border border-slate-700 shadow-sm"
            >
              ⌫
            </button>
          </div>

          {/* Shield Footer */}
          <div className="text-center pt-2 border-t border-slate-800/80">
            <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>Cryptographic Session & Anti-Brute-Force Active</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
