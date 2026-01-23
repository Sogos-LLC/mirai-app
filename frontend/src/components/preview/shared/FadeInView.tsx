'use client';

import { useEffect, useRef, useState } from 'react';

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function FadeInView({ children, delay = 0, className = '' }: FadeInViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Add delay before triggering animation
          setTimeout(() => setIsVisible(true), delay);
          // Only animate once - disconnect after triggering
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4'
      } ${className}`}
    >
      {children}
    </div>
  );
}
