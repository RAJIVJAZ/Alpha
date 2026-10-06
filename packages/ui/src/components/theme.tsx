'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './menu';

const KEY = 'fg-theme';
type Theme = 'light' | 'dark' | 'system';

/** Inline in <head>: applies the saved/OS theme before first paint (no flash). */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}

function apply(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>('system');
  React.useEffect(() => {
    try {
      setTheme((localStorage.getItem(KEY) as Theme | null) ?? 'system');
    } catch {
      /* storage unavailable */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      if (!saved || saved === 'system') apply('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    apply(t);
  };
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem onSelect={() => choose('light')}>
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose('dark')}>
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => choose('system')}>
          <Monitor /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
