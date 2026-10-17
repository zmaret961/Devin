// All monetary amounts are integer cents.

export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function sumCents(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/** Returns the subtotal with sales tax applied, in cents. */
export function applyTax(subtotalCents: number, rate: number): number {
  return Math.floor(subtotalCents * (1 + rate));
}

export function applyDiscount(subtotalCents: number, percentOff: number): number {
  return Math.round(subtotalCents * (1 - percentOff / 100));
}
