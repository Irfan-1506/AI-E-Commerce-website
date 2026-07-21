'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

const FlagsContext = createContext<{ flags: Record<string, boolean>; loading: boolean }>({
  flags: {},
  loading: true,
});

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/feature-flags/evaluate', { credentials: 'include' })
      .then((res) => res.json())
      .then(setFlags)
      .catch(() => setFlags({})) // fail closed — an unreachable flags endpoint should mean "no new features," not a broken page
      .finally(() => setLoading(false));
  }, []);

  return <FlagsContext.Provider value={{ flags, loading }}>{children}</FlagsContext.Provider>;
}

/** Usage: const showNewCheckout = useFeatureFlag('new-checkout-flow'); */
export function useFeatureFlag(key: string): boolean {
  const { flags } = useContext(FlagsContext);
  return flags[key] ?? false;
}
