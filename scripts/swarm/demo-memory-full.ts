// Comprehensive Memory Demo
import { shareTaskContext, shareDiscovery, shareDecision, markTaskComplete, closeMemoryClient } from "./shared-memory.ts";

async function runDemo() {
  console.log("Starting Comprehensive Swarm Memory Demo...");
  
  const taskId = `demo-task-${Date.now()}`;
  
  // 1. [CREATED] via Delegation
  console.log("Delegating task...");
  await shareTaskContext(taskId, "Intensive System Audit", "Audit all GCP resources and Neo4j graph integrity", "feature/audit-swarm");
  
  await new Promise(r => setTimeout(r, 1500));
  
  // 2. [CREATED] + [LINKED] via Discovery
  console.log("Sharing discovery...");
  await shareDiscovery("worker-001", taskId, "Discovered unauthorized root access attempt in logs");
  
  await new Promise(r => setTimeout(r, 1500));
  
  // 3. [CREATED] + [LINKED] via Decision
  console.log("Sharing decision...");
  await shareDecision(taskId, "Enable strict IP whitelisting for Neo4j", "Security audit revealed potential for local bridge bypass");
  
  await new Promise(r => setTimeout(r, 1500));
  
  // 4. [UPDATED] via Completion
  console.log("Completing task...");
  await markTaskComplete(taskId, "Audit complete. 1 critical discovery, 1 architectural decision made.");
  
  console.log("Demo pulse complete.");
  await closeMemoryClient();
}

runDemo().catch(console.error);
