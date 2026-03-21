// Wraps the Model Context Protocol (MCP) server. It starts a Cloud SQL proxy, retrieves the database URL,
// then launches the MCP server, passing the URL to it, and manages both processes' lifecycles.

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '..', '.env');

let dbUrl = process.env.MCP_DATABASE_URL;
if (!dbUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/MCP_DATABASE_URL=(["']?)([^\r\n]+)\1/);
    if (match) {
        dbUrl = match[2];
    }
}

if (!dbUrl) {
    console.error("Error: MCP_DATABASE_URL missing from .env");
    process.exit(1);
}

const proxyPath = path.resolve(__dirname, '..', 'bin', 'cloud-sql-proxy.x64.exe');
const proxy = spawn(proxyPath, ['wot-box:asia-southeast1:wot-box-db-instance', '--port=15432', '-g'], {
    stdio: 'ignore',
    shell: process.platform === 'win32'
});

process.on('exit', () => proxy.kill());
process.on('SIGINT', () => { proxy.kill(); process.exit(); });
process.on('SIGTERM', () => { proxy.kill(); process.exit(); });

setTimeout(() => {
    const child = spawn(process.execPath, [
        path.resolve(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'server-postgres', 'dist', 'index.js'),
        dbUrl
    ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
    });

    child.stdout.on('data', d => process.stdout.write(d));

    // Do NOT write non-JSON-RPC valid warnings to stdout or the MCP client will crash
    child.stderr.on('data', d => {
        process.stderr.write(d);
    });

    process.stdin.pipe(child.stdin);

    child.on('error', (err) => {
        console.error('Failed to start the MCP Server natively via Node:', err);
    });

    child.on('exit', (code) => {
        proxy.kill();
        process.exit();
    });
}, 1500);
