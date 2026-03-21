import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getTracer } from "./tracing";
import { SWARM_POLICY } from "./policy";
import { appendAudit } from "./audit";

const WORKTREES_ROOT = path.resolve(process.cwd(), "..", "wot-box-worktrees");

// --- Gap 1: Full Isolation Lifecycle ---

export interface WorktreeInfo {
  branch: string;
  path: string;
  head: string;
  status: "active" | "prunable";
}

export interface WorktreeStatus {
  branch: string;
  ahead: number;
  behind: number;
  filesChanged: number;
  hasConflicts: boolean;
}

export function createWorktree(branchName: string): string {
  const tracer = getTracer();
  return tracer.startActiveSpan("Git:createWorktree", (span) => {
    try {
      span.setAttribute("branch.name", branchName);
      if (!branchName || !/^[a-zA-Z0-9-_]+$/.test(branchName)) {
        throw new Error(`Invalid branch name: ${branchName}`);
      }

      // Capacity check (Gap 5)
      const active = listWorktrees().filter((w) => w.status === "active");
      if (active.length >= SWARM_POLICY.maxActiveIsolation) {
        throw new Error(`Isolation capacity exceeded: ${active.length}/${SWARM_POLICY.maxActiveIsolation} active worktrees.`);
      }

      if (!fs.existsSync(WORKTREES_ROOT)) {
        fs.mkdirSync(WORKTREES_ROOT, { recursive: true });
      }

      const worktreePath = path.join(WORKTREES_ROOT, branchName);
      if (fs.existsSync(worktreePath)) {
        try { execSync(`git worktree remove "${worktreePath}" --force`, { stdio: "ignore" }); } catch (e) {}
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
      try { execSync(`git branch -D "${branchName}"`, { stdio: "ignore" }); } catch (e) {}
      execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, { stdio: "inherit" });
      execSync(`git config branch.${branchName}.active true`, { stdio: "inherit" });

      appendAudit({ actor: "isolation", action: "isolation.created", entityType: "isolation", entityId: branchName, newState: "active" }).catch(() => {});

      span.end();
      return worktreePath;
    } catch (err: any) {
      span.recordException(err);
      span.end();
      throw err;
    }
  });
}

export function removeWorktree(branchName: string, force: boolean = false): void {
  const tracer = getTracer();
  tracer.startActiveSpan("Git:removeWorktree", (span) => {
    span.setAttribute("branch.name", branchName);
    span.setAttribute("force", force);

    const worktreePath = path.join(WORKTREES_ROOT, branchName);

    if (fs.existsSync(worktreePath)) {
      execSync(`git worktree remove "${worktreePath}" --force`, { stdio: "inherit" });
    }

    try {
      execSync(`git config --unset branch.${branchName}.active`, { stdio: "ignore" });
    } catch (e) {
      // Ignore if not set
    }

    if (force) {
      try {
        execSync(`git branch -D "${branchName}"`, { stdio: "inherit" });
      } catch (e) {
        // Ignore if branch doesn't exist
      }
    }

    appendAudit({ actor: "isolation", action: "isolation.removed", entityType: "isolation", entityId: branchName, newState: force ? "force-removed" : "removed" }).catch(() => {});
    span.end();
  });
}

export function listWorktrees(): WorktreeInfo[] {
  const tracer = getTracer();
  return tracer.startActiveSpan("Git:listWorktrees", (span) => {
    try {
      const output = execSync("git worktree list --porcelain", { encoding: "utf-8" });
      const worktrees: WorktreeInfo[] = [];
      const blocks = output.split("\n\n").filter(Boolean);

      for (const block of blocks) {
        const lines = block.trim().split("\n");
        const wtPath = lines.find((l) => l.startsWith("worktree "))?.replace("worktree ", "") || "";
        const head = lines.find((l) => l.startsWith("HEAD "))?.replace("HEAD ", "") || "";
        const branchLine = lines.find((l) => l.startsWith("branch "));
        const branch = branchLine ? branchLine.replace("branch refs/heads/", "") : "";
        const prunable = lines.some((l) => l.includes("prunable"));

        // Only include worktrees under our managed root
        if (wtPath.startsWith(WORKTREES_ROOT) || wtPath.includes("wot-box-worktrees")) {
          worktrees.push({
            branch,
            path: wtPath,
            head,
            status: prunable ? "prunable" : "active",
          });
        }
      }

      span.setAttribute("worktree.count", worktrees.length);
      span.end();
      return worktrees;
    } catch (err: any) {
      span.recordException(err);
      span.end();
      return [];
    }
  });
}

export function getWorktreeStatus(branchName: string): WorktreeStatus {
  const tracer = getTracer();
  return tracer.startActiveSpan("Git:getWorktreeStatus", (span) => {
    span.setAttribute("branch.name", branchName);
    const worktreePath = path.join(WORKTREES_ROOT, branchName);

    try {
      // Get ahead/behind relative to main
      let ahead = 0;
      let behind = 0;
      try {
        const revList = execSync(`git rev-list --left-right --count main...${branchName}`, { encoding: "utf-8", cwd: worktreePath }).trim();
        const parts = revList.split(/\s+/);
        behind = parseInt(parts[0], 10) || 0;
        ahead = parseInt(parts[1], 10) || 0;
      } catch (e) {
        // Branch or main may not exist
      }

      // Count changed files
      let filesChanged = 0;
      try {
        const diff = execSync(`git diff --name-only main...${branchName}`, { encoding: "utf-8", cwd: worktreePath }).trim();
        filesChanged = diff ? diff.split("\n").length : 0;
      } catch (e) {}

      // Check for conflicts
      let hasConflicts = false;
      try {
        const status = execSync("git status --porcelain", { encoding: "utf-8", cwd: worktreePath });
        hasConflicts = status.includes("UU ") || status.includes("AA ") || status.includes("DD ");
      } catch (e) {}

      const result: WorktreeStatus = { branch: branchName, ahead, behind, filesChanged, hasConflicts };
      span.end();
      return result;
    } catch (err: any) {
      span.recordException(err);
      span.end();
      return { branch: branchName, ahead: 0, behind: 0, filesChanged: 0, hasConflicts: false };
    }
  });
}

export function syncWorktree(branchName: string): void {
  const tracer = getTracer();
  tracer.startActiveSpan("Git:syncWorktree", (span) => {
    span.setAttribute("branch.name", branchName);
    const worktreePath = path.join(WORKTREES_ROOT, branchName);

    try {
      execSync("git fetch origin", { cwd: worktreePath, stdio: "inherit" });
      execSync("git rebase origin/main", { cwd: worktreePath, stdio: "inherit" });
      appendAudit({ actor: "isolation", action: "isolation.synced", entityType: "isolation", entityId: branchName }).catch(() => {});
    } catch (err: any) {
      console.error(`Sync failed for ${branchName}: ${err.message}. May have conflicts.`);
      span.recordException(err);
    }
    span.end();
  });
}

export interface MergeConflict {
  file: string;
  status: "resolved" | "unresolved";
  strategy?: string;
}

export interface MergeResult {
  success: boolean;
  conflicts: boolean;
  conflictFiles: MergeConflict[];
  strategy: string;
}

export type MergeStrategy = "theirs" | "ours" | "union" | "manual";

/**
 * Merge a worktree branch into its mainline with interactive conflict resolution.
 * 
 * Strategies:
 * - "theirs": Accept all incoming changes from the branch being merged (default for swarm — workers produce the authoritative output)
 * - "ours": Keep the current branch's version for all conflicting files  
 * - "union": Attempt to merge both sides line-by-line (best for additive changes like docs/configs)
 * - "manual": Detect conflicts but don't auto-resolve — leaves them for human resolution
 */
export function mergeWorktree(branchName: string, strategy: MergeStrategy = "theirs"): MergeResult {
  const tracer = getTracer();
  return tracer.startActiveSpan("Git:mergeWorktree", (span) => {
    span.setAttribute("branch.name", branchName);
    span.setAttribute("merge.strategy", strategy);

    const result: MergeResult = {
      success: false,
      conflicts: false,
      conflictFiles: [],
      strategy,
    };

    try {
      // Attempt the merge
      execSync(`git merge ${branchName} --no-ff -m "Merge swarm branch ${branchName}"`, { stdio: "pipe" });
      result.success = true;
      appendAudit({ actor: "isolation", action: "isolation.merged", entityType: "isolation", entityId: branchName, newState: "merged" }).catch(() => {});
      span.end();
      return result;
    } catch (mergeErr: any) {
      // Merge failed — check for conflicts
      try {
        const status = execSync("git status --porcelain", { encoding: "utf-8" });
        const conflictLines = status.split("\n").filter((l) => l.startsWith("UU ") || l.startsWith("AA ") || l.startsWith("DD "));

        if (conflictLines.length === 0) {
          // Not a conflict — some other merge error
          execSync("git merge --abort", { stdio: "ignore" });
          span.recordException(mergeErr);
          span.end();
          return result;
        }

        result.conflicts = true;
        const conflictedFiles = conflictLines.map((l) => l.slice(3).trim());

        console.log(`Merge conflict detected in ${conflictedFiles.length} file(s). Strategy: ${strategy}`);
        console.log(`Conflicted files: ${conflictedFiles.join(", ")}`);

        if (strategy === "manual") {
          // Leave conflicts in place for human resolution
          result.conflictFiles = conflictedFiles.map((f) => ({ file: f, status: "unresolved" as const }));
          appendAudit({
            actor: "isolation",
            action: "isolation.merge_conflict",
            entityType: "isolation",
            entityId: branchName,
            newState: "conflict-manual",
            metadata: { files: conflictedFiles, strategy },
          }).catch(() => {});
          span.end();
          return result;
        }

        // Auto-resolve each conflicted file
        for (const file of conflictedFiles) {
          try {
            resolveConflict(file, branchName, strategy);
            result.conflictFiles.push({ file, status: "resolved", strategy });
            console.log(`  ✅ Resolved: ${file} (${strategy})`);
          } catch (resolveErr: any) {
            result.conflictFiles.push({ file, status: "unresolved" });
            console.error(`  ❌ Failed to resolve: ${file} — ${resolveErr.message}`);
          }
        }

        // Stage all resolved files and commit
        const allResolved = result.conflictFiles.every((f) => f.status === "resolved");
        if (allResolved) {
          execSync("git add -A", { stdio: "pipe" });
          execSync(`git commit --no-edit`, { stdio: "pipe" });
          result.success = true;
          console.log(`Merge completed with ${strategy} strategy. All ${conflictedFiles.length} conflict(s) resolved.`);

          appendAudit({
            actor: "isolation",
            action: "isolation.merge_auto_resolved",
            entityType: "isolation",
            entityId: branchName,
            newState: "merged",
            metadata: { files: conflictedFiles, strategy, resolvedCount: conflictedFiles.length },
          }).catch(() => {});
        } else {
          const unresolvedCount = result.conflictFiles.filter((f) => f.status === "unresolved").length;
          console.error(`${unresolvedCount} file(s) could not be auto-resolved. Manual intervention required.`);

          appendAudit({
            actor: "isolation",
            action: "isolation.merge_partial_resolve",
            entityType: "isolation",
            entityId: branchName,
            newState: "conflict-partial",
            metadata: {
              strategy,
              resolvedCount: result.conflictFiles.filter((f) => f.status === "resolved").length,
              unresolvedCount,
            },
          }).catch(() => {});
        }
      } catch (statusErr: any) {
        // Could not even check status — abort and report
        try { execSync("git merge --abort", { stdio: "ignore" }); } catch (e) {}
        span.recordException(statusErr);
      }

      span.end();
      return result;
    }
  });
}

/**
 * Resolve a single conflicted file using the given strategy.
 */
function resolveConflict(file: string, branchName: string, strategy: MergeStrategy): void {
  switch (strategy) {
    case "theirs":
      // Accept the incoming branch's version
      execSync(`git checkout --theirs "${file}"`, { stdio: "pipe" });
      execSync(`git add "${file}"`, { stdio: "pipe" });
      break;

    case "ours":
      // Keep the current branch's version
      execSync(`git checkout --ours "${file}"`, { stdio: "pipe" });
      execSync(`git add "${file}"`, { stdio: "pipe" });
      break;

    case "union": {
      // Attempt union merge — works well for line-additive files (configs, docs)
      // Read the file content, strip conflict markers, keep both sides
      const content = fs.readFileSync(file, "utf-8");
      const resolved = content
        .replace(/^<<<<<<< .*$/gm, "")
        .replace(/^=======$/gm, "")
        .replace(/^>>>>>>> .*$/gm, "");
      fs.writeFileSync(file, resolved, "utf-8");
      execSync(`git add "${file}"`, { stdio: "pipe" });
      break;
    }

    default:
      throw new Error(`Unknown resolve strategy: ${strategy}`);
  }
}

// CLI usage
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === "list") {
    console.log(JSON.stringify(listWorktrees(), null, 2));
  } else if (cmd === "status" && process.argv[3]) {
    console.log(JSON.stringify(getWorktreeStatus(process.argv[3]), null, 2));
  } else if (cmd === "sync" && process.argv[3]) {
    syncWorktree(process.argv[3]);
  } else if (cmd === "merge" && process.argv[3]) {
    const strategy = (process.argv[4] || "theirs") as import("./manage-worktree").MergeStrategy;
    const result = mergeWorktree(process.argv[3], strategy);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Usage: tsx manage-worktree.ts [list | status <branch> | sync <branch> | merge <branch> [theirs|ours|union|manual]]");
  }
}
