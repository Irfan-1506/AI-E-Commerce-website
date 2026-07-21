'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Order } from '@/lib/api';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    api.orders.mine().then(setOrders).catch(() => setOrders([]));
  }, []);

  if (!orders) return <main className="max-w-2xl mx-auto px-4 py-8">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">Your orders</h1>
      {orders.length === 0 ? (
        <p className="text-gray-500">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between border rounded-md px-4 py-3 hover:bg-gray-50">
              <span>#{o.id.slice(0, 8)} · {o.status}</span>
              <span>৳{o.total}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
