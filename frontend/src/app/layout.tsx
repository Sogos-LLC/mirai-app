'use client';

import './globals.css';
import { AuthProvider, ThemeProvider } from '@/contexts';
import { ConnectProvider } from '@/components/providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ConnectProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ConnectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
