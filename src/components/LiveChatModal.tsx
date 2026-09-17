'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Order, ChatMessage, UserRole } from '@/lib/types';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { playOrderBellNotification } from '@/lib/audio';
import {
  Send,
  X,
  MessageSquare,
  ShieldCheck,
  User,
  Bike,
  Sparkles,
  Phone
} from 'lucide-react';

interface LiveChatModalProps {
  order: Order;
  onClose: () => void;
}

export default function LiveChatModal({ order, onClose }: LiveChatModalProps) {
  const { user, orders, sendChatMessage } = useAuth();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(order.messages || []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(order.messages?.length || 0);

  // Derive the latest live order object from AuthContext
  const liveOrder = orders.find((o) => o.id === order.id) || order;
  const isCurrentDriver = user?.uid === liveOrder.assignedTo;
  const counterpartName = isCurrentDriver ? liveOrder.clientName : (liveOrder.driverName || 'Assigned Driver');
  const counterpartPhone = isCurrentDriver ? liveOrder.clientPhone : liveOrder.driverPhone;

  // Real-Time Reactive Listener on Firestore Order Document
  useEffect(() => {
    // 1. Immediate sync from AuthContext
    if (liveOrder.messages && liveOrder.messages.length > 0) {
      setMessages(liveOrder.messages);
    }

    // 2. Direct Firestore onSnapshot for sub-second live chat synchronization
    if (!isFirebaseConfigured || !db) return;

    const orderDocRef = doc(db, 'orders', order.id);
    const unsub = onSnapshot(
      orderDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<Order>;
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(data.messages);

            // Play notification chime if a new message arrived from the other party
            if (data.messages.length > prevMsgCountRef.current) {
              const latestMsg = data.messages[data.messages.length - 1];
              if (latestMsg && latestMsg.senderId !== user?.uid && latestMsg.senderId !== 'system') {
                playOrderBellNotification();
              }
            }
            prevMsgCountRef.current = data.messages.length;
          }
        }
      },
      (err) => {
        console.warn('Live chat onSnapshot notice:', err);
      }
    );

    return () => unsub();
  }, [order.id, liveOrder.messages, user?.uid]);

  // Auto-scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');

    // Instant Optimistic Message in UI
    const optimisticMsg: ChatMessage = {
      id: 'msg_opt_' + Date.now(),
      senderId: user?.uid || 'user',
      senderName: user?.name || (isCurrentDriver ? 'Driver Partner' : 'Client User'),
      senderRole: (user?.role || (isCurrentDriver ? 'driver' : 'client')) as UserRole,
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setIsSending(true);

    try {
      await sendChatMessage(order.id, textToSend);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickSend = async (text: string) => {
    const optimisticMsg: ChatMessage = {
      id: 'msg_opt_' + Date.now(),
      senderId: user?.uid || 'user',
      senderName: user?.name || (isCurrentDriver ? 'Driver Partner' : 'Client User'),
      senderRole: (user?.role || (isCurrentDriver ? 'driver' : 'client')) as UserRole,
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    await sendChatMessage(order.id, text);
  };

  const quickReplies = isCurrentDriver
    ? [
        '🛵 On the way to pickup location!',
        '🛒 Purchasing the requested items now.',
        '📍 Arrived at delivery point. Coming up!',
      ]
    : [
        '👍 Please check expiry date on items.',
        '🏠 I am at the main gate.',
        '💵 Cash / UPI payment ready.',
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-w-lg w-full bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col h-[600px] max-h-[90vh]">
        {/* Chat Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              {isCurrentDriver ? <User className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold">{counterpartName}</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {isCurrentDriver ? 'Client' : 'Driver Partner'}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Run: <strong className="text-slate-200">{liveOrder.title}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {counterpartPhone && (
              <a
                href={`tel:${counterpartPhone}`}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                title={`Call ${counterpartPhone}`}
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {(!messages || messages.length === 0) ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
              <p>No messages yet. Send a message to coordinate your run.</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMine = msg.senderId === user?.uid;
              const isSystem = msg.senderId === 'system';

              if (isSystem) {
                return (
                  <div key={msg.id || `sys_${index}`} className="text-center my-2">
                    <span className="inline-block px-3 py-1 rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id || `msg_${index}`}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] font-bold text-slate-400 mb-0.5 px-1">
                    {msg.senderName} ({msg.senderRole?.toUpperCase() || 'USER'})
                  </span>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                      isMine
                        ? 'bg-amber-500 text-slate-950 font-medium rounded-br-none'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    <span className={`block text-[9px] mt-1 text-right ${isMine ? 'text-slate-800/70' : 'text-slate-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies */}
        <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap pl-1">Quick:</span>
          {quickReplies.map((qr, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleQuickSend(qr)}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-700 whitespace-nowrap transition"
            >
              {qr}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message or instruction..."
            className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-amber-500 focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-amber-500/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
