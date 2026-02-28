import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// In production, warn only when DATABASE_URL is missing (localhost is valid when DB runs on same server).
if (process.env.NODE_ENV === 'production') {
  const u = (process.env.DATABASE_URL ?? '').trim();
  if (!u) {
    console.error(
      '[db] PRODUCTION ERROR: DATABASE_URL is missing. Set .env on the server and restart the app.'
    );
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
