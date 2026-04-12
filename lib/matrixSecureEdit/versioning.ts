import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export class MatrixVersionConflictError extends Error {
  constructor(
    public readonly currentVersion: number,
    message = 'MATRIX_VERSION_CONFLICT'
  ) {
    super(message);
    this.name = 'MatrixVersionConflictError';
  }
}

/**
 * After successful writes: bump optimistic version. `clientVersion` is what the client had when loading.
 */
export async function finalizeMatrixVersionInTx(
  tx: Prisma.TransactionClient,
  boutiqueId: string,
  month: string,
  clientVersion: number
): Promise<number> {
  const updated = await tx.salesMatrixEditVersion.updateMany({
    where: { boutiqueId, month, version: clientVersion },
    data: { version: { increment: 1 } },
  });

  if (updated.count === 1) {
    const row = await tx.salesMatrixEditVersion.findUnique({
      where: { boutiqueId_month: { boutiqueId, month } },
    });
    return row?.version ?? clientVersion + 1;
  }

  if (clientVersion === 0) {
    try {
      const row = await tx.salesMatrixEditVersion.create({
        data: { boutiqueId, month, version: 1 },
      });
      return row.version;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const cur = await tx.salesMatrixEditVersion.findUnique({
          where: { boutiqueId_month: { boutiqueId, month } },
        });
        throw new MatrixVersionConflictError(cur?.version ?? 0);
      }
      const cur = await tx.salesMatrixEditVersion.findUnique({
        where: { boutiqueId_month: { boutiqueId, month } },
      });
      throw new MatrixVersionConflictError(cur?.version ?? 0);
    }
  }

  const cur = await tx.salesMatrixEditVersion.findUnique({
    where: { boutiqueId_month: { boutiqueId, month } },
  });
  throw new MatrixVersionConflictError(cur?.version ?? 0);
}

export async function getMatrixEditVersion(boutiqueId: string, month: string): Promise<number> {
  const row = await prisma.salesMatrixEditVersion.findUnique({
    where: { boutiqueId_month: { boutiqueId, month } },
    select: { version: true },
  });
  return row?.version ?? 0;
}
