/*
  Warnings:

  - You are about to alter the column `name` on the `doctors` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "doctors" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedBy" UUID,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(255);
