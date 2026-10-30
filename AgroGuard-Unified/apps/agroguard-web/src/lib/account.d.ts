export type AccountType = 'farmer' | 'buyer' | 'dev';
export type BuyerKind = 'household' | 'retail' | 'restaurant' | 'cooperative' | 'processor' | 'factory' | 'msme';

export const ACCOUNT_KEY: string;
export const BUYER_KINDS: readonly { value: BuyerKind; label: string }[];
export function saveAccount(body: { account_type?: string; buyer_kind?: string | null } | null | undefined): void;
export function clearAccount(): void;
export function accountType(): AccountType;
export function buyerKind(): BuyerKind | null;
