import { prisma } from "../src/database/prisma";

/** Operational cleanup: retain delivery cursors for seven days by default. */
async function main() {
  const days = Number(process.env.CHAT_EVENT_RETENTION_DAYS ?? "7");
  if (!Number.isSafeInteger(days) || days < 1 || days > 90) {
    throw new Error("CHAT_EVENT_RETENTION_DAYS deve estar entre 1 e 90.");
  }
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const result = await prisma.chatDeliveryEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  console.log(`ChatDeliveryEvent: ${result.count} registros anteriores a ${cutoff.toISOString()} removidos.`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
