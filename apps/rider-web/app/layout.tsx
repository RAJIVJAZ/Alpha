import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeScript } from '@foodgrid/ui';
import { AppProviders } from '@foodgrid/ui/client';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'FoodGrid Rider', template: '%s · FoodGrid Rider' },
  description: 'Deliveries, earnings and incentives',
};

export const viewport: Viewport = {
  // Night whatever the OS says: the page defaults to dark (ThemeScript below), so the
  // browser bar matches it for every rider who has not picked a theme
  themeColor: '#100d17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* riders ride at night and glance in traffic: dark ("night") unless they choose */}
        <ThemeScript defaultTheme="dark" />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
