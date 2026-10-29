import { prisma } from "./src/database/prisma";
import { MovideskService } from "./src/services/MovideskService";

async function main() {
  try {
    const service = new MovideskService();
    const completed = await service.hasCompletedBaseline();

    const logs = await prisma.auditLog.findMany({
      where: {
        action: {
          contains: "MOVIDESK",
          mode: "insensitive"
        }
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        action: true,
        createdAt: true
      }
    });

    console.log("=== DIAGNÓSTICO MOVIDESK ===");
    console.log(JSON.stringify({
      baselineConcluido: completed,
      ultimasExecucoes: logs
    }, null, 2));

  } catch (error) {
    console.error("ERRO NO DIAGNÓSTICO:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
