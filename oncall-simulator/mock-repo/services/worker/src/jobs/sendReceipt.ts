import { formatCents } from '../../../../packages/shared/src/money.ts';

export function renderReceipt(orderId: string, totalCents: number): string {
  return `Thanks for shopping with ShopFast!\nOrder ${orderId}\nTotal: ${formatCents(totalCents)}`;
}
