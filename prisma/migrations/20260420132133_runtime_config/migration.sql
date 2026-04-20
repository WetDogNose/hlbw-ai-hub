-- Pass 23: RuntimeConfig for UI-editable runtime knobs. DO NOT apply automatically — user runs `npx prisma migrate dev --name runtime_config`.

-- CreateTable
CREATE TABLE "runtime_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "runtime_config_pkey" PRIMARY KEY ("key")
);
