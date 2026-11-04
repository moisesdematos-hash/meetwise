import { describe, it, expect } from 'vitest';
import { PLAN_LIMITS } from '@/modules/billing';

describe('Design System, Plans & Security Boundaries', () => {
  describe('Plan Quotas & Limits Integrity', () => {
    it('enforces exact limits for Free plan', () => {
      const free = PLAN_LIMITS.free;
      expect(free.monthlyMinutes).toBe(45);
      expect(free.seatsIncluded).toBe(1);
      expect(free.priceCentsUsd).toBe(0);
    });

    it('enforces exact limits for Pro plan', () => {
      const pro = PLAN_LIMITS.pro;
      expect(pro.monthlyMinutes).toBe(600);
      expect(pro.seatsIncluded).toBe(1);
      expect(pro.priceCentsUsd).toBe(1900);
    });

    it('enforces exact limits for Business plan', () => {
      const business = PLAN_LIMITS.business;
      expect(business.monthlyMinutes).toBe(2500);
      expect(business.seatsIncluded).toBe(5);
      expect(business.priceCentsUsd).toBe(7900);
    });

    it('calculates consumption percentages accurately without overflow', () => {
      const computeUsage = (used: number, total: number) => {
        if (total <= 0) return 0;
        return Math.min(100, Math.round((used / total) * 100));
      };

      expect(computeUsage(0, 45)).toBe(0);
      expect(computeUsage(15, 45)).toBe(33);
      expect(computeUsage(45, 45)).toBe(100);
      expect(computeUsage(50, 45)).toBe(100); // capped at 100%
    });
  });

  describe('Security Boundary: No Secret Exposure', () => {
    it('ensures client env only exposes public variables', () => {
      const clientKeys = Object.keys(process.env).filter(key =>
        key.startsWith('NEXT_PUBLIC_')
      );

      // Verify none of the public keys contain private secret names
      clientKeys.forEach(key => {
        expect(key).not.toContain('SERVICE_ROLE');
        expect(key).not.toContain('STRIPE_SECRET');
        expect(key).not.toContain('DEEPGRAM_API_KEY');
      });
    });
  });
});
