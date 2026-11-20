/**
 * hooks/useReveal.js - Scroll animations: elements with class "reveal" fade up when
 * they enter the viewport (IntersectionObserver). Re-scans when `deps` change, so
 * content loaded later from the API animates too.
 */
import { useEffect } from 'react';

export function useReveal(deps = []) {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal:not(.is-visible)')];
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-visible')); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
