import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '@/modules/auth/service';

describe('Auth & Form Schemas Validation', () => {
  describe('registerSchema', () => {
    it('accepts valid registration input', () => {
      const valid = {
        fullName: 'Ana Silva',
        email: 'ana.silva@empresa.com',
        password: 'Password123!',
      };
      const result = registerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const invalid = {
        fullName: 'Ana Silva',
        email: 'not-an-email',
        password: 'Password123!',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Email inválido');
      }
    });

    it('rejects password shorter than 8 characters', () => {
      const invalid = {
        fullName: 'Ana Silva',
        email: 'ana.silva@empresa.com',
        password: 'Pass1',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('8 caracteres'))).toBe(true);
      }
    });

    it('rejects password without uppercase letter', () => {
      const invalid = {
        fullName: 'Ana Silva',
        email: 'ana.silva@empresa.com',
        password: 'password123',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('maiúscula'))).toBe(true);
      }
    });

    it('rejects password without number', () => {
      const invalid = {
        fullName: 'Ana Silva',
        email: 'ana.silva@empresa.com',
        password: 'PasswordSecret',
      };
      const result = registerSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(i => i.message.includes('número'))).toBe(true);
      }
    });

    it('trims whitespace from full name and email', () => {
      const input = {
        fullName: '  Pedro Santos  ',
        email: '  pedro@empresa.pt  ',
        password: 'StrongPassword99',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fullName).toBe('Pedro Santos');
        expect(result.data.email).toBe('pedro@empresa.pt');
      }
    });
  });

  describe('loginSchema', () => {
    it('accepts valid login credentials', () => {
      const valid = {
        email: 'user@corp.pt',
        password: 'anyPassword',
      };
      const result = loginSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects empty password', () => {
      const invalid = {
        email: 'user@corp.pt',
        password: '',
      };
      const result = loginSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('forgotPasswordSchema & resetPasswordSchema', () => {
    it('validates email for forgot password', () => {
      expect(forgotPasswordSchema.safeParse({ email: 'test@meetwise.ai' }).success).toBe(true);
      expect(forgotPasswordSchema.safeParse({ email: 'invalid-email' }).success).toBe(false);
    });

    it('validates matching passwords on reset', () => {
      const valid = {
        password: 'NewStrongPassword1',
        confirmPassword: 'NewStrongPassword1',
      };
      const result = resetPasswordSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects mismatched passwords on reset', () => {
      const invalid = {
        password: 'NewStrongPassword1',
        confirmPassword: 'DifferentPassword2',
      };
      const result = resetPasswordSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('As palavras-passe não coincidem');
      }
    });
  });
});
