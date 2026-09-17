# 🏙️ Hyperlocal Community & On-Demand Marketplace Platform

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFA611?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Mobile_Hybrid-119EFF?style=for-the-badge&logo=capacitor)](https://capacitorjs.com/)

> **A turnkey, production-ready Hyperlocal On-Demand Services, Local Business Directory, and Community Marketplace platform.** Built with Next.js 14, Tailwind CSS glassmorphism, Firebase Firestore, and Capacitor for seamless Web, PWA, and Native Android deployment.

---

## 🌟 Key Highlights & Architecture

- **Multi-Role Portal**: Seamless role-switching between **Client / Consumer**, **Delivery Partner / Driver**, and **Admin Control Desk**.
- **1-Click Firebase Authentication**: Integrated Google Authentication with persistent session storage, profile sync, and dev-mode fallback.
- **Dynamic Onboarding & Mobile Verification**: Validates Indian 10-digit mobile numbers (`^[6-9]\d{9}$`) with custom avatar selection and instant database commits.
- **WhatsApp 1-Click Ordering**: Instant conversion bridge enabling customers to place direct orders and bookings to local vendors via pre-filled WhatsApp messages.
- **Strict Privacy & Isolation Protocol**: Specialized tasks (e.g. Companion / Confidential Services) are isolated from public feeds and routed directly to the Admin Control Desk.
- **PWA + Android Hybrid**: Full offline PWA manifest, service workers, and automated Capacitor scripts to compile native `.apk` packages.

---

## 🏗️ Tech Stack Breakdown

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 14 (App Router) & React 18 |
| **Language** | TypeScript (Strict Typing) |
| **Styling** | Tailwind CSS with custom Glassmorphism & Lucide Icons |
| **Backend & Realtime DB**| Firebase Authentication & Cloud Firestore |
| **Mobile Integration** | Capacitor 5 (Android Native Bridge + PWA Manifest) |
| **Payments Integration**| Razorpay SDK Ready (`src/lib/razorpay.ts`) |

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js 18.x or higher
- npm or yarn

### 1. Installation
```bash
git clone https://github.com/pixelssudio/hyperlocal-community-portal.git
cd hyperlocal-community-portal
npm install
```

### 2. Environment Variables
Copy the `.env.local.example` file to `.env.local`:
```bash
cp .env.local.example .env.local
```
Add your Firebase configuration keys:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Run Development Server
```bash
npm run dev
# Or double-click start_app.bat
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📱 Mobile (Android APK) Build

To compile a native Android application using Capacitor:
```bash
npm run build
npx cap sync android
npx cap open android
```
Or execute the automated scripts in `scripts/`:
```bash
node scripts/compile_capacitor.mjs
```

---

## 📂 Project Structure

```text
├── android/            # Capacitor Android native project files
├── public/             # PWA icons, manifest.json, sw.js
├── scripts/            # Build automation & verification suites
├── src/
│   ├── app/            # Next.js 14 App Router (layout, globals.css, page)
│   ├── components/     # UI Modals, Dashboards (Client, Driver, Admin)
│   ├── context/        # Global Auth & Role state provider
│   └── lib/            # Firebase, Razorpay, WhatsApp, Audio utilities
├── capacitor.config.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 💼 Customization & Freelance Inquiries

Need to customize this platform for your city, business, or launch a white-label delivery / directory app?

- 🌐 **Custom Branding & Localization** (Any city/region)
- 💳 **Custom Payment Gateway Integration** (Stripe, Razorpay, UPI)
- 🚀 **Cloud Deployment & Play Store Publishing**

**Available for freelance contracts and customized deployments:**
- 📧 **Email**: Contact via GitHub profile
- 💬 **Telegram**: [@the_musafir](https://t.me/the_musafir)
- 💼 **Upwork / Fiverr**: Available upon request

---

## 📄 License
This project is licensed under the MIT License - feel free to use it for personal or commercial projects.
