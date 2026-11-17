import { useState } from 'react';

const KEY = 'mavos_theme';

export function useTheme() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'light');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(KEY, next);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', next === 'dark' ? '#0e1318' : '#14674a');
    setTheme(next);
  };
  return [theme, toggle];
}
