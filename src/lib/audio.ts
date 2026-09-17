/**
 * Synthesizes audible chimes using HTML5 Web Audio API
 * and handles HTML5 Native Browser Push Notifications.
 * 100% Free, zero external asset dependencies, zero network requests.
 */

let sharedAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!sharedAudioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioCtx = new AudioContextClass();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (e) {
    return null;
  }
}

/**
 * Call on first user click/touch to unlock Web Audio on mobile browsers (iOS / Android Chrome)
 */
export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

export type NotificationSoundType =
  | 'order_created'
  | 'order_accepted'
  | 'order_completed'
  | 'photo_uploaded'
  | 'companion_alert'
  | 'bell';

/**
 * Plays high-fidelity synthesized musical notifications tailored to each event type
 */
export function playNotificationSound(type: NotificationSoundType = 'order_created'): void {
  if (typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === 'order_created' || type === 'bell') {
      // 2-tone doorbell chime: A5 (880Hz) -> E6 (1318.5Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.5, now + 0.15);
      gain2.gain.setValueAtTime(0.4, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.8);
    } else if (type === 'order_accepted') {
      // 3-tone cheerful triad: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.35, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });
    } else if (type === 'order_completed') {
      // Triumphant fanfare: D5 (587.33Hz) -> A5 (880Hz) -> D6 (1174.66Hz)
      const notes = [587.33, 880, 1174.66];
      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + (idx === 2 ? 0.9 : 0.45));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + (idx === 2 ? 0.9 : 0.45));
      });
    } else if (type === 'companion_alert' || type === 'photo_uploaded') {
      // Urgent Attention: Double high ping
      [1046.5, 1318.5].forEach((freq, idx) => {
        const startTime = now + idx * 0.1;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.35);
      });
    }
  } catch (err) {
    console.warn('Notification audio notice:', err);
  }
}

/**
 * Backward compatibility alias
 */
export function playOrderBellNotification(): void {
  playNotificationSound('order_created');
}

/**
 * Requests HTML5 Web Notification permissions from the browser
 */
export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Dispatches a true OS-level system push notification (Lock Screen / Notification Bar)
 * via the registered Service Worker, with fallback to standard browser Notification.
 */
export async function sendBrowserPushNotification(
  title: string,
  body: string,
  icon: string = '/icon-192.svg'
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const options: any = {
      body,
      icon: icon || '/icon-192.svg',
      badge: '/icon-192.svg',
      vibrate: [300, 150, 300],
      tag: 'rawatbhata-alert-' + Date.now(),
      renotify: true,
      data: { url: '/' },
    };

    // Primary: Service Worker showNotification (Works in Background / Lock Screen)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, options);
          return;
        }
      } catch (swErr) {
        console.warn('SW showNotification notice:', swErr);
      }
    }

    // Fallback: Standard Window Notification
    new Notification(title, options);
  } catch (e) {
    console.warn('Browser push notification notice:', e);
  }
}

/**
 * Returns current Notification permission state ('granted' | 'denied' | 'default' | 'unsupported')
 */
export function getNotificationPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}
