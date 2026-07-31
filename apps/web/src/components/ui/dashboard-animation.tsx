'use client';

import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';

export function DashboardAnimation({ path, size = 96 }: { path: string; size?: number }) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(path)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!animationData) {
    return <div style={{ height: size, width: size }} aria-hidden="true" />;
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <Lottie
      animationData={animationData}
      loop={!prefersReducedMotion}
      autoplay={!prefersReducedMotion}
      style={{ height: size, width: size }}
      aria-hidden="true"
    />
  );
}
