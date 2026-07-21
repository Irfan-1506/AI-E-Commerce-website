'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, Cart } from '@/lib/api';

export default function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const router = useRouter();

  async function load() {
    try {
      setCart(await api.cart.get());
    } catch {
      router.push('/login');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const subtotal = cart?.items.reduce((sum, i) => sum + Number(i.variant.price) * i.quantity, 0) ?? 0;

  async function updateQty(variantId: string, quantity: number) {
    setCart(await api.cart.updateQuantity(variantId, quantity));
  }

  async function remove(variantId: string) {
    setCart(await api.cart.remove(variantId));
  }

  async function checkout() {
    setError(null);
    setPlacing(true);
    try {
      const order = await api.orders.checkout(couponCode || undefined);
      const { gatewayUrl } = await api.payments.initSslcommerz(order.id);
      window.location.href = gatewayUrl; // hand off to SSLCommerz-hosted payment page
    } catch (err: any) {
      setError(err.message ?? 'Checkout failed');
      setPlacing(false);
    }
  }

  if (!cart) return <main className="max-w-2xl mx-auto px-4 py-8">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">Your cart</h1>
      {cart.items.length === 0 ? (
        <p className="text-gray-500">Your cart is empty.</p>
      ) : (
        <div className="space-y-4">
          {cart.items.map((item) => (
            <div key={item.variantId} className="flex justify-between items-center border-b pb-3">
              <div>
                <p className="font-medium">{item.variant.product.name}</p>
                <p className="text-sm text-gray-500">৳{item.variant.price} × {item.quantity}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateQty(item.variantId, Number(e.target.value))}
                  aria-label={`Quantity for ${item.variant.product.name}`}
                  className="w-16 border rounded-md px-2 py-1 text-sm"
                />
                <button onClick={() => remove(item.variantId)} className="text-sm text-red-600">
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="pt-4">
            <input
              placeholder="Coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              aria-label="Coupon code"
              className="border rounded-md px-3 py-2 text-sm mr-2"
            />
          </div>

          <div className="flex justify-between text-lg font-semibold pt-2">
            <span>Subtotal</span>
            <span>৳{subtotal.toFixed(2)}</span>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={checkout}
            disabled={placing}
            className="w-full bg-gray-900 text-white rounded-md py-2.5 disabled:opacity-50"
          >
            {placing ? 'Placing order…' : 'Checkout'}
          </button>
        </div>
      )}
    </main>
  );
}
