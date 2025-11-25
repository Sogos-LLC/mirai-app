'use client';

import React from 'react';
import Navbar from '@/components/landing/Navbar';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import PricingCards from '@/components/landing/PricingCards';
import Footer from '@/components/landing/Footer';

/**
 * Public landing page for get-mirai.sogos.io
 */
export default function LandingPage() {
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
