import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

/**
 * Initializes an isolated environment for a given Git Worktree branch.
 * Usage: node .agents/scripts/init-agent-worktree.js <branch-name>
 */
async function run() {
  const branchName = process.argv[2];
  if (!branchName) {
    console.error("Please provide a branch name for the worktree.");
    process.exit(1);
  }

  const worktreePath = path.resolve(process.cwd(), `../wot-box-worktrees/${branchName}`);
  const dbName = `wot_box_${branchName.replace(/[^a-zA-Z0-9]/g, "_")}`;

  console.log(`Setting up isolated environment for branch: ${branchName}`);

  // 1. Create the Git Worktree
  try {
    console.log(`Creating Git Worktree at ${worktreePath}...`);
    execSync(`git worktree add ${worktreePath} -b ${branchName}`, { stdio: 'inherit' });
  } catch (error) {
    console.warn(`Worktree might already exist. Proceeding with environment setup.`);
  }

  // 2. Database Partitioning
  console.log(`Provisioning isolated database: ${dbName}...`);
  // Parse existing database URL from .env
  const currentEnvPath = path.join(process.cwd(), ".env");
  let dbUrl = "";
  if (fs.existsSync(currentEnvPath)) {
    const envContent = fs.readFileSync(currentEnvPath, "utf8");
    const match = envContent.match(/DATABASE_URL="([^"]+)"/);
    if (match) dbUrl = match[1];
  }

  if (dbUrl) {
    try {
      // Connect to the base database and execute raw CREATE DATABASE
      const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      
      // PostgreSQL won't allow parameterizing database names in standard queries
      // We catch the error if it already exists to achieve idempotency
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}";`).catch((e) => {
        if (!e.message.includes('already exists')) throw e;
      });
      console.log(`Database isolated successfully.`);
      await prisma.$disconnect();

      // Write isolated .env to the new worktree
      const newDbUrl = dbUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
      const newEnvContent = fs.readFileSync(currentEnvPath, "utf8").replace(dbUrl, newDbUrl);
      fs.writeFileSync(path.join(worktreePath, ".env"), newEnvContent);
      console.log(`Isolated .env created mapped to ${dbName}.`);
    } catch (e) {
      console.error("Failed to provision isolated database:", e);
    }
  } else {
    console.warn("No DATABASE_URL found in .env. Skipping database isolation.");
  }

  // 3. Port Allocation Note
  // Next.js automatically finds available ports (3001, 3002) if 3000 is occupied.
  // We simply inform the Master Agent that the environment is ready.

  console.log("");
  console.log(`✅ Worktree Initialized: ${worktreePath}`);
  console.log(`✅ Database Partition: ${dbName}`);
  console.log(`Ready for Sub-Agent dispatch in isolated Working Directory.`);
}

run().catch(console.error);
