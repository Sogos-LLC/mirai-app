'use client';

import React, { useEffect } from 'react';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import PricingCards from '@/components/landing/PricingCards';
import Footer from '@/components/landing/Footer';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://mirai.sogos.io';

/**
 * Public landing page for get-mirai.sogos.io
 */
export default function LandingPage() {
  // Add prefetch hint for cross-domain navigation to main app
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = `${APP_URL}/auth/registration`;
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <PricingCards />
      </main>
      <Footer />
    </>
  );
}
