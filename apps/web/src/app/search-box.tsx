'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function SearchBox() {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<{ name: string; slug: string }[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api.search.autocomplete(q).then(setSuggestions);
    }, 200); // debounce — avoid firing a request on every keystroke
    return () => clearTimeout(debounceRef.current);
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={submit} className="relative flex-1 max-w-md">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // let click on a suggestion register first
        placeholder="Search products…"
        aria-label="Search products"
        className="w-full border rounded-md px-3 py-1.5 text-sm"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 bg-white border rounded-md mt-1 shadow-sm z-10">
          {suggestions.map((s) => (
            <li key={s.slug}>
              <button
                type="button"
                onClick={() => router.push(`/products/${s.slug}`)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
