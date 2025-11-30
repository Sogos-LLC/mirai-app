'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();

  // Preload the registration page immediately for instant navigation
  useEffect(() => {
    // Prefetch the registration route (Next.js internal navigation)
    router.prefetch('/auth/registration');

    // Add prefetch hint for cross-domain navigation (Navbar links)
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = `${APP_URL}/auth/registration`;
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, [router]);

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
