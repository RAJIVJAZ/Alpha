import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@foodgrid/database';
import { TenantScopeViolationError } from '@foodgrid/database';
import type { ApiErrorBody } from '@foodgrid/types';
import { AppError } from '../errors';
import { UnitConversionError } from '../units';

/**
 * Normalises every error into the platform's ApiErrorBody shape and maps
 * well-known Prisma errors to HTTP semantics.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const { status, message, code, details } = this.describe(exception);
    if (status >= 500) {
      this.logger.error(
        { err: exception, path: req.url, method: req.method },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      code,
      details,
      requestId: req.id,
      timestamp: new Date().toISOString(),
      path: req.url,
    };
    res.status(status).json(body);
  }

  private describe(e: unknown): { status: number; message: string | string[]; code?: string; details?: unknown } {
    if (e instanceof AppError) return { status: e.status, message: e.message, code: e.code, details: e.details };
    if (e instanceof TenantScopeViolationError) return { status: 403, message: e.message, code: 'TENANT_SCOPE' };
    if (e instanceof UnitConversionError) return { status: 422, message: e.message, code: 'UNIT_MISMATCH' };
    if (e instanceof HttpException) {
      const r = e.getResponse();
      if (typeof r === 'string') return { status: e.getStatus(), message: r };
      const obj = r as Record<string, unknown>;
      return {
        status: e.getStatus(),
        message: (obj.message as string | string[]) ?? e.message,
        code: obj.code as string | undefined,
        details: obj.details,
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      switch (e.code) {
        case 'P2002':
          return { status: 409, message: 'Resource already exists', code: 'DUPLICATE', details: e.meta };
        case 'P2025':
          return { status: 404, message: 'Resource not found', code: 'NOT_FOUND' };
        case 'P2003':
          return { status: 409, message: 'Related resource missing', code: 'FK_VIOLATION', details: e.meta };
        case 'P2034':
          return { status: 409, message: 'Concurrent update, please retry', code: 'WRITE_CONFLICT' };
        default:
          return { status: 500, message: 'Database error', code: e.code };
      }
    }
    if (e instanceof Prisma.PrismaClientValidationError) {
      return { status: 400, message: 'Invalid query', code: 'VALIDATION' };
    }
    return { status: 500, message: 'Internal server error', code: 'INTERNAL' };
  }
}
