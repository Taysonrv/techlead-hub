import { prisma } from "../database/prisma";
import { scopedAzureWhere } from "../domain/OperationalScope";

export class AzureFollowService {
  async get(userId: number, workItemId: number) {
    const item = await prisma.azureWorkItem.findFirst({
      where: scopedAzureWhere({ id: workItemId }), select: { id: true }
    });
    if (!item) return null;
    const follow = await prisma.azureWorkItemFollow.findUnique({
      where: { userId_workItemId: { userId, workItemId } },
    });
    return { following: Boolean(follow), source: follow?.source ?? null };
  }
  async set(userId: number, workItemId: number, following: boolean) {
    const item = await prisma.azureWorkItem.findFirst({
      where: scopedAzureWhere({ id: workItemId }), select: { id: true },
    });
    if (!item) return null;
    if (following) {
      await prisma.azureWorkItemFollow.upsert({
        where: { userId_workItemId: { userId, workItemId } },
        create: { userId, workItemId, source: "HUB" }, update: {},
      });
    } else {
      await prisma.azureWorkItemFollow.deleteMany({ where: { userId, workItemId } });
    }
    return { following };
  }
  async list(userId: number) {
    const follows = await prisma.azureWorkItemFollow.findMany({
      where: { userId, workItem: { AND: [scopedAzureWhere()] } },
      include: { workItem: { select: { id: true, title: true, state: true, workItemType: true, azureChangedAt: true } } },
      orderBy: { followedAt: "desc" }, take: 200,
    });
    return follows.map(f => ({ ...f.workItem, source: f.source, followedAt: f.followedAt }));
  }
}
