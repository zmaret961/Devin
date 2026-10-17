export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class OrderTotalMismatch extends Error {
  constructor(public readonly computed: number, public readonly charged: number, orderId: string) {
    super(`computed ${computed} != charged ${charged} (order ${orderId})`);
    this.name = 'OrderTotalMismatch';
  }
}
