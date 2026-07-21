'use client';

import Link from 'next/link';
import { useLocale } from '@/lib/i18n';

export default function NavLinks() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="flex gap-4 text-sm shrink-0 items-center">
      <Link href="/cart">{t('nav_cart')}</Link>
      <Link href="/orders">{t('nav_orders')}</Link>
      <Link href="/login">{t('nav_login')}</Link>
      <button
        onClick={() => setLocale(locale === 'en' ? 'bn' : 'en')}
        aria-label="Switch language"
        className="text-gray-500 border rounded px-1.5 py-0.5 text-xs"
      >
        {locale === 'en' ? 'বাং' : 'EN'}
      </button>
    </div>
  );
}
