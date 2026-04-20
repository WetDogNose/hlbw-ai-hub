-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "ext_expires_in" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isTestUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),
    "oauthProvider" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "AISetting" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pipelineMode" TEXT NOT NULL DEFAULT 'THREE_STAGE',
    "generatedSinglePassPrompt" TEXT NOT NULL DEFAULT '',
    "imageCompressionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imageMaxResolution" INTEGER NOT NULL DEFAULT 2048,
    "imageCompressionQuality" INTEGER NOT NULL DEFAULT 80,
    "deduplicationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deduplicationPromptTemplate" TEXT NOT NULL DEFAULT '',
    "paddingPercentage" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 8192,
    "topP" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "topK" INTEGER NOT NULL DEFAULT 40,
    "stage1Enabled" BOOLEAN NOT NULL DEFAULT false,
    "stage1Model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "stage1SystemInstruction" TEXT NOT NULL DEFAULT '',
    "stage1Prompt" TEXT NOT NULL,
    "stage1Temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "stage2Model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "stage2SystemInstruction" TEXT NOT NULL DEFAULT '',
    "stage2Prompt" TEXT NOT NULL,
    "stage2Temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,

    CONSTRAINT "AISetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppearanceSetting" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bgPrimary" TEXT NOT NULL DEFAULT '#0f172a',
    "bgSecondary" TEXT NOT NULL DEFAULT '#1e293b',
    "bgTertiary" TEXT NOT NULL DEFAULT '#334155',
    "customHtmlBackground" TEXT NOT NULL DEFAULT '',
    "customHtmlBackgroundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "textPrimary" TEXT NOT NULL DEFAULT '#f8fafc',
    "textSecondary" TEXT NOT NULL DEFAULT '#cbd5e1',
    "textMuted" TEXT NOT NULL DEFAULT '#94a3b8',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter, sans-serif',
    "titleGradientStart" TEXT NOT NULL DEFAULT '#60a5fa',
    "titleGradientEnd" TEXT NOT NULL DEFAULT '#c084fc',
    "accentColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "accentHover" TEXT NOT NULL DEFAULT '#2563eb',
    "dangerColor" TEXT NOT NULL DEFAULT '#ef4444',
    "successColor" TEXT NOT NULL DEFAULT '#10b981',
    "warningColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "infoColor" TEXT NOT NULL DEFAULT '#3b82f6',
    "purpleColor" TEXT NOT NULL DEFAULT '#a855f7',
    "borderColor" TEXT NOT NULL DEFAULT '#334155',
    "borderRadiusSm" TEXT NOT NULL DEFAULT '4px',
    "borderRadiusMd" TEXT NOT NULL DEFAULT '8px',
    "borderRadiusLg" TEXT NOT NULL DEFAULT '16px',
    "borderRadiusFull" TEXT NOT NULL DEFAULT '9999px',

    CONSTRAINT "AppearanceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "autoApproveNewUsers" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPersona" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "instruction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agentCategory" TEXT,
    "isolationId" TEXT,
    "assignedAgentLabel" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "threadId" TEXT NOT NULL,
    "assignedAgentId" TEXT,
    "goalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueRelation" (
    "id" TEXT NOT NULL,
    "parentIssueId" TEXT NOT NULL,
    "childIssueId" TEXT NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'BLOCKS',

    CONSTRAINT "IssueRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "taskPayload" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLedger" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "issueId" TEXT,
    "tokensUsed" INTEGER NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPersona" ADD CONSTRAINT "AgentPersona_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "AgentPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRelation" ADD CONSTRAINT "IssueRelation_parentIssueId_fkey" FOREIGN KEY ("parentIssueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueRelation" ADD CONSTRAINT "IssueRelation_childIssueId_fkey" FOREIGN KEY ("childIssueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLedger" ADD CONSTRAINT "BudgetLedger_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLedger" ADD CONSTRAINT "BudgetLedger_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
