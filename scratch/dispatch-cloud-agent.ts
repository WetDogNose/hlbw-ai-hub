import { spawnDockerWorker } from '../scripts/swarm/docker-worker';

async function main() {
  console.log("Orchestrating Cloud Ops Sub-Agent (3_cloud)...");
  
  const result = await spawnDockerWorker(
    'investigate-build-be4307aa',
    'Execute the gcp-logging-mcp server to read the Google Cloud build logs for the failed build ID: be4307aa-7753-465d-a0f2-6bbcb67b839d. Analyze the output and summarize exactly why the build crashed.',
    'hotfix-cloud-build',
    '3_cloud'
  );
  
  console.log("Sub-Agent Investigation Completed. Results:");
  console.log(result.logs);
}

main().catch(console.error);
