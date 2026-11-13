-- Função organizacional independente do perfil de acesso.
ALTER TABLE "User" ADD COLUMN "jobFunction" VARCHAR(40);
CREATE INDEX "User_jobFunction_idx" ON "User"("jobFunction");
