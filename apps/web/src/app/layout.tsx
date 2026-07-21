import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import SearchBox from './search-box';
import AssistantWidget from './assistant-widget';
import { LocaleProvider } from '@/lib/i18n';
import { FeatureFlagsProvider } from '@/lib/feature-flags';
import NavLinks from './nav-links';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'AI Commerce', template: '%s — AI Commerce' },
  description: 'AI-powered e-commerce platform',
  openGraph: { siteName: 'AI Commerce', type: 'website' },
  twitter: { card: 'summary' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <LocaleProvider>
          <FeatureFlagsProvider>
            <header className="border-b">
              <nav className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center gap-4">
                <Link href="/" className="font-semibold shrink-0">AI Commerce</Link>
                <SearchBox />
                <NavLinks />
              </nav>
            </header>
            {children}
            <AssistantWidget />
          </FeatureFlagsProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
