/*
  Warnings:

  - You are about to drop the column `closedAt` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `created` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `resolvedAt` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `updated` on the `Ticket` table. All the data in the column will be lost.
  - Added the required column `createdDate` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "closedAt",
DROP COLUMN "created",
DROP COLUMN "resolvedAt",
DROP COLUMN "updated",
ADD COLUMN     "closedDate" TIMESTAMP(3),
ADD COLUMN     "createdDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "resolvedDate" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
