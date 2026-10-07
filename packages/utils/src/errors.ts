/**
 * Domain error carrying a stable machine-readable code. The server-side
 * exception filter maps it to an HTTP response.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (entity: string, id?: string) =>
  new AppError('NOT_FOUND', id ? `${entity} ${id} not found` : `${entity} not found`, 404);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(code, message, 409);
export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN') =>
  new AppError(code, message, 403);
export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  new AppError(code, message, 400, details);
export const unprocessable = (message: string, code = 'UNPROCESSABLE', details?: unknown) =>
  new AppError(code, message, 422, details);
