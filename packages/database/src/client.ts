import { Prisma, PrismaClient } from '../generated/client';

export interface CreatePrismaClientOptions {
  /** Overrides DATABASE_URL. */
  url?: string;
  log?: Prisma.LogLevel[];
}

export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  return new PrismaClient({
    datasourceUrl: options.url,
    log: options.log ?? ['warn', 'error'],
  });
}

/** Client or interactive-transaction client — accepted by helpers that work in both. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
