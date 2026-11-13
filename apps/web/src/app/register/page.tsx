'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';

const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);
  const router = useRouter();
  const { t } = useLocale();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.auth.register(email, name, password, captchaToken ?? undefined);
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
    }
  }

  return (
    <main className="max-w-sm mx-auto px-4 py-16">
      <h1 className="text-xl font-semibold mb-6">{t('register_title')}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-md px-3 py-2" required />
        <input type="password" placeholder="Password (8+ chars, upper/lower/number)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-md px-3 py-2" required />

        {HCAPTCHA_SITE_KEY && (
          <HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} onVerify={setCaptchaToken} />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!!HCAPTCHA_SITE_KEY && !captchaToken}
          className="w-full bg-gray-900 text-white rounded-md py-2 disabled:opacity-50"
        >
          {t('register_submit')}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        Already have an account? <Link href="/login" className="underline text-gray-900">Log in</Link>
      </p>
    </main>
  );
}
