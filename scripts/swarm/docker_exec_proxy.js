const { execSync } = require("child_process");
const fs = require("fs");

const targetHost = process.argv[2];
const taskId = process.argv[3];
const b64Payload = process.argv[4];

// IMPROVED: Write an immediate 'in_progress' status to the log so the Hub doesn't think we are stuck.
// Alpine's base64 and curl are standard.
const innerCmd = `
echo '{"status":"in_progress","taskId":"${taskId}"}' > /tmp/${taskId}.log
echo "${b64Payload}" | base64 -d | curl -s --max-time 180 -X POST -H "Content-Type: application/json" -d @- http://localhost:8000/a2a >> /tmp/${taskId}.log 2>&1
`;

try {
  const tmpCmdFile = `tmp_cmd_${taskId}.sh`;
  fs.writeFileSync(tmpCmdFile, innerCmd);

  // Copy the command file to the container and run it
  execSync(`docker cp ${tmpCmdFile} ${targetHost}:/tmp/run_task.sh`);
  execSync(`docker exec -d ${targetHost} sh /tmp/run_task.sh`);

  // Cleanup host side
  fs.unlinkSync(tmpCmdFile);
  console.log(`Successfully proxied task ${taskId} to ${targetHost}`);
} catch (err) {
  console.error(`Proxy script failed: ${err.message}`);
  process.exit(1);
}
