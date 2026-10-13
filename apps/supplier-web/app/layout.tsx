import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeScript } from '@foodgrid/ui';
import { AppProviders } from '@foodgrid/ui/client';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'FoodGrid for Suppliers', template: '%s · FoodGrid for Suppliers' },
  description: 'Sell to restaurants on the FoodGrid marketplace',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#100d17' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
