'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Order } from '@/lib/api';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    api.orders.getById(id).then(setOrder);
  }, [id]);

  if (!order) return <main className="max-w-xl mx-auto px-4 py-8">Loading…</main>;

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-2">Order confirmed</h1>
      <p className="text-sm text-gray-500 mb-6">Order #{order.id.slice(0, 8)} · {order.status}</p>

      <div className="space-y-2 mb-6">
        {order.items.map((item) => (
          <div key={item.variantId} className="flex justify-between text-sm">
            <span>{item.quantity} × ৳{item.unitPrice}</span>
          </div>
        ))}
      </div>

      <div className="border-t pt-3 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>৳{order.subtotal}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>-৳{order.discount}</span></div>
        <div className="flex justify-between"><span>Shipping</span><span>৳{order.shippingFee}</span></div>
        <div className="flex justify-between font-semibold text-base pt-1"><span>Total</span><span>৳{order.total}</span></div>
      </div>
    </main>
  );
}
