import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
import OnboardingModal from '@/components/OnboardingModal';
import AdminSecurityModal from '@/components/AdminSecurityModal';

export const metadata: Metadata = {
  title: 'Rawatbhata Direct - Hyperlocal On-Demand Platform',
  description: 'Instant errands, food pickups, rides, and companion services in Rawatbhata (323303), Rajasthan.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Rawatbhata',
  },
};

export const viewport: Viewport = {
  themeColor: '#f59e0b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col antialiased">
        <Script
          id="razorpay-checkout"
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
        <AuthProvider>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            {children}
          </main>
          <OnboardingModal />
          <AdminSecurityModal />
          <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p>© {new Date().getFullYear()} Rawatbhata Direct. Hyperlocal Community Network.</p>
              <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-400">
                <span>📍 Rajasthan PIN 323303</span>
                <span>•</span>
                <span>🔒 Strict Task Isolation Active</span>
                <span>•</span>
                <span>📱 PWA & Android APK Ready</span>
              </div>
            </div>
          </footer>
        </AuthProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 1. Auto-update Service Worker and Purge Stale Caches
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(reg) {
                    if (reg) reg.update();
                  }).catch(function(err) {
                    console.log('SW registration notice:', err);
                  });
                });
              }

              // 2. Mobile App-Like Anti-Zoom Gestures
              document.addEventListener('touchstart', function(e) {
                if (e.touches && e.touches.length > 1) {
                  e.preventDefault();
                }
              }, { passive: false });

              document.addEventListener('touchmove', function(e) {
                if (e.touches && e.touches.length > 1) {
                  e.preventDefault();
                }
              }, { passive: false });

              var lastTouchEnd = 0;
              document.addEventListener('touchend', function(e) {
                var now = Date.now();
                if (now - lastTouchEnd <= 300) {
                  e.preventDefault();
                }
                lastTouchEnd = now;
              }, { passive: false });

              document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
              document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
              document.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });
            `,
          }}
        />
      </body>
    </html>
  );
}
