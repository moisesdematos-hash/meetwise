'use client';

import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const isDark =
      localStorage.getItem('meetwise-theme') === 'dark' ||
      (!('meetwise-theme' in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);

    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('meetwise-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('meetwise-theme', 'light');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      aria-label="Alternar tema claro/escuro"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
