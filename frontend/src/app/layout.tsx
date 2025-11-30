'use client';

import './globals.css';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { ConnectProvider } from '@/components/providers';
import BuildInfo from '@/components/BuildInfo';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Provider store={store}>
          <ConnectProvider>
            {children}
            <BuildInfo />
          </ConnectProvider>
        </Provider>
      </body>
    </html>
  );
}
