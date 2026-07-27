import { describe, it, expect } from 'vitest';
import { RegisterInput, LoginInput } from './user';
import { VerificationDecisionInput } from './admin';

describe('RegisterInput', () => {
  it('rejects a password shorter than 8 chars', () => {
    const result = RegisterInput.safeParse({
      email: 'a@b.com', password: 'short', name: 'A', phone: '9999999999', role: 'patient',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid patient registration', () => {
    const result = RegisterInput.safeParse({
      email: 'a@b.com', password: 'longenough1', name: 'A', phone: '9999999999', role: 'patient',
    });
    expect(result.success).toBe(true);
  });
});

describe('LoginInput', () => {
  it('rejects an invalid email', () => {
    expect(LoginInput.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });
});

describe('VerificationDecisionInput', () => {
  it('requires a reason when rejecting', () => {
    const result = VerificationDecisionInput.safeParse({ decision: 'rejected' });
    expect(result.success).toBe(false);
  });

  it('allows approval with no reason', () => {
    const result = VerificationDecisionInput.safeParse({ decision: 'approved' });
    expect(result.success).toBe(true);
  });
});
