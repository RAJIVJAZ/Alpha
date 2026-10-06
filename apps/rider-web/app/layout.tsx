import type { Metadata, Viewport } from 'next';
import { ThemeScript } from '@foodgrid/ui';
import { AppProviders } from '@foodgrid/ui/client';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'FoodGrid Rider', template: '%s · FoodGrid Rider' },
  description: 'Deliveries, earnings and incentives',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
