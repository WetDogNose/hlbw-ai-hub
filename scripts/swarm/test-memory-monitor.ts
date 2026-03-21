// Test script to pulse memory for monitoring verification
import { storeEntity, createRelation, addObservations, closeMemoryClient } from "./shared-memory.ts";

async function pulse() {
  console.log("Pulsing memory...");
  
  const taskId = `test-task-${Date.now()}`;
  await storeEntity(taskId, "swarm_task", ["Monitoring verification task", "Status: active"]);
  
  await new Promise(r => setTimeout(r, 1000));
  
  await addObservations(taskId, ["Observation 1: The monitor should see this."]);
  
  await new Promise(r => setTimeout(r, 1000));
  
  const workerId = `worker-${Math.floor(Math.random() * 1000)}`;
  await storeEntity(workerId, "swarm_worker", ["Active worker for monitor test"]);
  await createRelation(workerId, taskId, "ASSIGNED_TO");
  
  console.log("Pulse complete. Check the monitor terminal.");
  await closeMemoryClient();
}

pulse().catch(console.error);
