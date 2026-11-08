import { describe, it, expect } from 'vitest';
import {
  generateSlug,
  createOrganizationSchema,
  validateOwnerRemoval,
  completeOnboardingSchema,
} from '@/modules/organizations';
import { AppError } from '@/lib/errors/app-error';

describe('Organizations & Onboarding Modules', () => {
  describe('generateSlug', () => {
    it('normalizes Portuguese accents and spaces correctly', () => {
      const slug = generateSlug('Acrópole Soluções');
      expect(slug).toMatch(/^acropole-solucoes-[a-z0-9]{4}$/);
    });

    it('removes symbols and special characters', () => {
      const slug = generateSlug('Tech & Co., Lda. (Portugal)');
      expect(slug).toMatch(/^tech-co-lda-portugal-[a-z0-9]{4}$/);
    });

    it('falls back to "org-" prefix when name is empty or only symbols', () => {
      const slug = generateSlug('!@#$%');
      expect(slug).toMatch(/^org-[a-z0-9]{4}$/);
    });
  });

  describe('createOrganizationSchema', () => {
    it('accepts valid organization names and defaults language to pt', () => {
      const parsed = createOrganizationSchema.parse({ name: 'Acme Global' });
      expect(parsed.name).toBe('Acme Global');
      expect(parsed.default_language).toBe('pt');
    });

    it('rejects names with less than 2 characters', () => {
      const result = createOrganizationSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });
  });

  describe('validateOwnerRemoval (Last-Owner Guard)', () => {
    it('prevents removing or demoting the last remaining active owner', () => {
      const members = [
        { role: 'owner' as const, status: 'active' },
        { role: 'admin' as const, status: 'active' },
      ];

      expect(() => {
        validateOwnerRemoval(members, 'user-1', 'owner');
      }).toThrowError(AppError);
    });

    it('allows demoting or removing an owner when multiple active owners exist', () => {
      const members = [
        { role: 'owner' as const, status: 'active' },
        { role: 'owner' as const, status: 'active' },
        { role: 'member' as const, status: 'active' },
      ];

      expect(() => {
        validateOwnerRemoval(members, 'user-1', 'owner');
      }).not.toThrow();
    });
  });

  describe('completeOnboardingSchema', () => {
    it('validates comprehensive onboarding payload', () => {
      const input = {
        fullName: 'Dr. Teresa Ferreira',
        locale: 'pt' as const,
        roleTitle: 'Diretor de Tecnologia',
        organizationName: 'Inovação Lda',
        transcriptionDialect: 'pt-PT',
        minuteTemplate: 'executive',
        timezone: 'Europe/Lisbon',
      };

      const result = completeOnboardingSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transcriptionDialect).toBe('pt-PT');
        expect(result.data.timezone).toBe('Europe/Lisbon');
      }
    });

    it('rejects onboarding payload with empty organization name', () => {
      const input = {
        fullName: 'Carlos Ramos',
        organizationName: '',
      };
      const result = completeOnboardingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
