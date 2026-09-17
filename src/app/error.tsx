'use client';

import React, { useEffect } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Captured Next.js App Error:', error);
  }, [error]);

  const handleHardReload = () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
        sessionStorage.clear();
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name));
          });
        }
      } catch (e) {}
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-16 h-16 rounded-3xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mb-5 shadow-sm">
        <AlertCircle className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-black text-slate-900 mb-2">
        Something unexpected happened
      </h2>
      <p className="text-xs text-slate-500 max-w-sm mb-6 leading-relaxed">
        {error?.message || 'A temporary browser error occurred. Tap below to reload fresh.'}
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
        <button
          onClick={() => reset()}
          className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
        <button
          onClick={handleHardReload}
          className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Home className="w-4 h-4" />
          <span>Clear Cache & Reload</span>
        </button>
      </div>
    </div>
  );
}
