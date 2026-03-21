// Generates comprehensive test coverage reports (unit, database, security, toolchain) by executing various test commands and logging their output.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs/coverage');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

console.log('Generating comprehensive test coverage reports. This may take several minutes...\n');

const runTask = (name, command, args, outputFile, customEnv = {}) => {
    console.log(`[${name}] Running tests...`);
    const outputPath = path.join(LOG_DIR, outputFile);

    const result = spawnSync(command, args, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        shell: true,
        env: { ...process.env, ...customEnv }
    });

    const output = `=== ${name} Coverage ===\n\n--- stdout ---\n${result.stdout || ''}\n--- stderr ---\n${result.stderr || ''}\n--- Exit Code: ${result.status} ---\n`;
    fs.writeFileSync(outputPath, output);
    console.log(`[${name}] Completed (Exit Code: ${result.status}). Log: logs/coverage/${outputFile}\n`);
};

// 1. Unit Tests (Jest) with coverage directory override
runTask('Unit Tests', 'npx', ['jest', '--coverage', '--passWithNoTests', '--coverageDirectory=logs/coverage/unit'], 'unit-coverage.txt');

// 2. Database Tests
runTask('Database Tests', 'npm', ['run', 'test:db'], 'db-coverage.txt');

// 3. Security Tests
runTask('Security Tests', 'npm', ['run', 'test:security'], 'security-coverage.txt');

// 4. Toolchain Doctor
runTask('Toolchain Doctor', 'npm', ['run', 'toolchain-doctor'], 'toolchain-coverage.txt');

console.log('All coverage reports generated successfully in logs/coverage/');
