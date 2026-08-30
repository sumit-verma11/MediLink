'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  // Starts false on every render (server and first client paint agree, avoiding a
  // hydration mismatch) and syncs to the real DOM state -- already set synchronously
  // by the blocking inline script in layout.tsx -- right after mount.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Private browsing / storage disabled: theme just won't persist across reloads.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
