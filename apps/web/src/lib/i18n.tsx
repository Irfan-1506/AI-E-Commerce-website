'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

// Deliberately NOT next-intl's [locale] route segment pattern — that would
// mean restructuring every route built across six phases under app/[locale]/
// and rewriting every internal Link. That's the *correct* long-term
// architecture for real i18n (locale-specific URLs, proper SSR translation,
// SEO hreflang tags) but it's a large, deliberate migration that deserves
// its own focused pass, not something to bolt on as a side effect of a
// broader hardening sweep. This is the honest starting point: a real
// dictionary and a working switcher, covering the highest-traffic strings
// (nav, auth pages), with the rest of the UI still in English. See
// AUDIT.md for what's NOT covered yet.

export type Locale = 'en' | 'bn';

const dictionary = {
  en: {
    nav_cart: 'Cart',
    nav_orders: 'Orders',
    nav_login: 'Log in',
    login_title: 'Log in',
    login_email: 'Email',
    login_password: 'Password',
    login_submit: 'Log in',
    register_title: 'Create account',
    register_submit: 'Sign up',
    search_placeholder: 'Search products…',
  },
  bn: {
    nav_cart: 'কার্ট',
    nav_orders: 'অর্ডার',
    nav_login: 'লগইন',
    login_title: 'লগইন করুন',
    login_email: 'ইমেইল',
    login_password: 'পাসওয়ার্ড',
    login_submit: 'লগইন',
    register_title: 'অ্যাকাউন্ট তৈরি করুন',
    register_submit: 'সাইন আপ',
    search_placeholder: 'পণ্য খুঁজুন…',
  },
} as const;

type MessageKey = keyof typeof dictionary.en;

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: (key: MessageKey) => string }>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => dictionary.en[key],
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const t = (key: MessageKey) => dictionary[locale][key];
  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
