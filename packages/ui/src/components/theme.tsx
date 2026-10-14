'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './menu';

const KEY = 'fg-theme';
type Theme = 'light' | 'dark' | 'system';

/**
 * Inline in <head>: applies the saved theme, else the app's default (riders: dark), else the
 * OS preference, before first paint (no flash). The default is kept on <html> for ThemeToggle.
 */
export const themeScriptFor = (fallback: Theme = 'system') =>
  `(function(){var e=document.documentElement,t=null;e.dataset.themeDefault='${fallback}';try{t=localStorage.getItem('${KEY}')}catch(x){}t=t||'${fallback}';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);e.classList.toggle('dark',d);e.dataset.theme=d?'dark':'light'})();`;

export const themeScript = themeScriptFor();

export function ThemeScript({ defaultTheme = 'system' }: { defaultTheme?: Theme }) {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptFor(defaultTheme) }} />;
}

/** The app's default when nothing is saved (set on <html> by ThemeScript). */
const appDefault = (): Theme =>
  (document.documentElement.dataset.themeDefault as Theme | undefined) ?? 'system';

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
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      /* storage unavailable: show the app's default */
    }
    setTheme((saved as Theme | null) ?? appDefault());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      if ((saved ?? appDefault()) === 'system') apply('system');
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
