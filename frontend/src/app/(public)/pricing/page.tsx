'use client';

import React from 'react';
import Navbar from '@/components/landing/Navbar';
import PricingCards from '@/components/landing/PricingCards';
import Footer from '@/components/landing/Footer';

/**
 * Dedicated pricing page
 */
export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <PricingCards />
      </main>
      <Footer />
    </>
  );
}
