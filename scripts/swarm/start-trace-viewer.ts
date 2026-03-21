import { execSync } from "node:child_process";

export function startTraceViewer() {
  console.log("Checking for local Jaeger trace viewer...");
  try {
    const running = execSync("docker ps -q -f name=wot-box-jaeger").toString().trim();
    if (running) {
      console.log("Jaeger is already running at http://localhost:16686");
      return;
    }

    const stopped = execSync("docker ps -a -q -f name=wot-box-jaeger").toString().trim();
    if (stopped) {
      console.log("Starting existing Jaeger container...");
      execSync(`docker start ${stopped}`);
    } else {
      console.log("Deploying ephemeral Jaeger container...");
      execSync("docker run -d --name wot-box-jaeger -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest");
    }
    console.log("Jaeger trace viewer is now available at http://localhost:16686");

  } catch (err: any) {
    console.error("Failed to start Jaeger. Is Docker running?", err.message);
  }
}

// CLI usage
if (require.main === module) {
  startTraceViewer();
}
