'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Snapshot = { orderCount: number; revenue: number; date: string };
type LiveEvent = { type: string; at: string; [key: string]: any };

export default function AnalyticsDashboardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [revenueHistory, setRevenueHistory] = useState<{ time: string; revenue: number }[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // REST fallback so the dashboard shows numbers immediately, before the
    // WebSocket handshake completes — a live dashboard that's blank for a
    // second on load feels broken even though it isn't.
    fetch('/api/v1/analytics/snapshot', { credentials: 'include' })
      .then((res) => res.json())
      .then(setSnapshot)
      .catch(() => setError('Could not load analytics — are you logged in as an admin or seller?'));

    // Socket.IO connects to the SAME origin as everything else (the /api
    // rewrite doesn't cover WebSocket upgrades, so this points at the API
    // origin directly — see next.config.js's rewrite for the HTTP-only
    // equivalent). Cookies are sent automatically since this is same-site.
    const socket = io(`${window.location.protocol}//${window.location.hostname}:4000/analytics`, {
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setError('Live connection failed — showing last known snapshot only.'));

    socket.on('snapshot', (s: Snapshot) => {
      setSnapshot(s);
      setRevenueHistory((prev) => [...prev.slice(-29), { time: new Date().toLocaleTimeString(), revenue: s.revenue }]);
    });

    socket.on('event', (e: LiveEvent) => {
      setEvents((prev) => [e, ...prev.slice(0, 19)]); // keep the last 20 — this is a live feed, not an archive
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Live analytics</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {connected ? '● Live' : '○ Reconnecting…'}
        </span>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {snapshot && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">Orders today</p>
            <p className="text-2xl font-semibold">{snapshot.orderCount}</p>
          </div>
          <div className="border rounded-lg p-4">
            <p className="text-sm text-gray-500">Revenue today</p>
            <p className="text-2xl font-semibold">৳{snapshot.revenue.toFixed(2)}</p>
          </div>
        </div>
      )}

      {revenueHistory.length > 1 && (
        <div className="mb-8 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueHistory}>
              <XAxis dataKey="time" hide />
              <YAxis width={50} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <h2 className="text-sm font-medium text-gray-500 mb-2">Live event feed</h2>
      <div className="space-y-1 text-sm font-mono">
        {events.length === 0 && <p className="text-gray-400">Waiting for events…</p>}
        {events.map((e, i) => (
          <div key={i} className="border-b py-1.5 text-gray-700">
            <span className="text-gray-400">{new Date(e.at).toLocaleTimeString()}</span>{' '}
            <span className="font-semibold">{e.type}</span>{' '}
            {e.type === 'order.created' && <span>— ৳{e.total} ({e.itemCount} items)</span>}
            {e.type === 'inventory.low_stock' && <span>— {e.productName} ({e.sku}): {e.quantity} left</span>}
            {e.type === 'order.status_changed' && <span>— {e.from} → {e.to}</span>}
          </div>
        ))}
      </div>
    </main>
  );
}
