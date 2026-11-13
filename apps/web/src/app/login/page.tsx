'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';

const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);
  const router = useRouter();
  const { t } = useLocale();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api.auth.login(email, password, captchaToken ?? undefined);
      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken); // session isn't established yet — cookies aren't set until the code is verified
        return;
      }
      router.push('/');
      router.refresh();
    } catch (err: any) {
      // The backend requires CAPTCHA after repeated failed attempts on this
      // account specifically (see LockoutService.requiresCaptcha) — a 400
      // with this message is the signal to reveal the widget rather than
      // showing it to everyone on every login.
      if (err.status === 400 && err.message?.includes('CAPTCHA')) {
        setNeedsCaptcha(true);
        setError('Please complete the CAPTCHA to continue.');
        return;
      }
      setError(err.message ?? 'Login failed');
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.auth.mfaLoginVerify(mfaToken!, code);
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Invalid code');
    }
  }

  if (mfaToken) {
    return (
      <main className="max-w-sm mx-auto px-4 py-16">
        <h1 className="text-xl font-semibold mb-2">Enter your 6-digit code</h1>
        <p className="text-sm text-gray-500 mb-6">From your authenticator app.</p>
        <form onSubmit={handleMfaSubmit} className="space-y-4">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            className="w-full border rounded-md px-3 py-2 text-center tracking-widest text-lg"
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full bg-gray-900 text-white rounded-md py-2">Verify</button>
        </form>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto px-4 py-16">
      <h1 className="text-xl font-semibold mb-6">{t('login_title')}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder={t('login_email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-md px-3 py-2"
          required
        />
        <input
          type="password"
          placeholder={t('login_password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-md px-3 py-2"
          required
        />
        {needsCaptcha && HCAPTCHA_SITE_KEY && (
          <HCaptcha ref={captchaRef} sitekey={HCAPTCHA_SITE_KEY} onVerify={setCaptchaToken} />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={needsCaptcha && !!HCAPTCHA_SITE_KEY && !captchaToken}
          className="w-full bg-gray-900 text-white rounded-md py-2 disabled:opacity-50"
        >
          {t('login_submit')}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        No account? <Link href="/register" className="underline text-gray-900">Sign up</Link>
      </p>
      <p className="text-sm text-gray-500 mt-2">
        Demo seller: seller@example.com / SellerPass123 (from the seed script)
      </p>
    </main>
  );
}
