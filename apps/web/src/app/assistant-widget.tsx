'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { api, Product } from '@/lib/api';

type Message = { role: 'user' | 'assistant'; text: string; products?: Product[] };

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const { reply, products } = await api.assistant.chat(text);
      setMessages((m) => [...m, { role: 'assistant', text: reply, products }]);
    } catch (err: any) {
      const msg = err.status === 401
        ? 'Log in to chat with the shopping assistant.'
        : "Sorry, something went wrong — try again in a moment.";
      setMessages((m) => [...m, { role: 'assistant', text: msg }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 bg-gray-900 text-white rounded-full px-5 py-3 shadow-lg text-sm"
      >
        Ask AI 💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 w-80 h-[28rem] bg-white border rounded-lg shadow-xl flex flex-col">
      <div className="flex justify-between items-center px-4 py-3 border-b">
        <span className="text-sm font-medium">Shopping assistant</span>
        <button onClick={() => setOpen(false)} aria-label="Close chat" className="text-gray-400 text-sm">✕</button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">Ask me things like "something for a rainy commute" or "what's good under ৳3000?"</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <p
              className={`inline-block text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'
              }`}
            >
              {m.text}
            </p>
            {m.products && m.products.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {m.products.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/products/${p.slug}`} className="text-xs text-blue-600 underline">
                    {p.name} — ৳{p.basePrice}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-sm text-gray-400">Thinking…</p>}
      </div>

      <form onSubmit={send} className="flex gap-2 p-3 border-t">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about products…"
          aria-label="Message the shopping assistant"
          className="flex-1 border rounded-md px-3 py-1.5 text-sm"
        />
        <button type="submit" className="bg-gray-900 text-white rounded-md px-3 text-sm">Send</button>
      </form>
    </div>
  );
}
