import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

const { accountType, buyerKind, clearAccount, saveAccount, BUYER_KINDS } = await import('../../src/lib/account.js');

test('Account: defaults to farmer when nothing is saved', () => {
  clearAccount();
  assert.equal(accountType(), 'farmer');
  assert.equal(buyerKind(), null);
});

test('Account: keeps the buyer kind from the sign-in response', () => {
  saveAccount({ account_type: 'buyer', buyer_kind: 'factory' });
  assert.equal(accountType(), 'buyer');
  assert.equal(buyerKind(), 'factory');
  clearAccount();
  assert.equal(accountType(), 'farmer');
});

test('Account: unknown values fall back to farmer', () => {
  saveAccount({ account_type: 'admin', buyer_kind: 'x' });
  assert.equal(accountType(), 'farmer');
});

test('Account: every buyer kind the API accepts is offered', () => {
  assert.deepEqual(BUYER_KINDS.map((k: { value: string }) => k.value), ['household', 'retail', 'restaurant', 'cooperative', 'processor', 'factory', 'msme']);
});

test('Account: a dev account is kept as dev', () => {
  saveAccount({ account_type: 'dev' });
  assert.equal(accountType(), 'dev');
  assert.equal(buyerKind(), null);
  clearAccount();
});
