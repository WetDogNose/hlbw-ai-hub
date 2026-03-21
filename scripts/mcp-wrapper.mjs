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
let proxyInstance = process.env.MCP_CLOUD_SQL_INSTANCE;

if ((!dbUrl || proxyInstance === undefined) && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    if (!dbUrl) {
        const urlMatch = envContent.match(/MCP_DATABASE_URL=(["']?)([^\r\n]+)\1/);
        if (urlMatch) dbUrl = urlMatch[2];
    }
    
    if (proxyInstance === undefined) {
        const proxyMatch = envContent.match(/MCP_CLOUD_SQL_INSTANCE=(["']?)([^\r\n]+)\1/);
        if (proxyMatch) proxyInstance = proxyMatch[2];
    }
}

if (!dbUrl) {
    console.error("Error: MCP_DATABASE_URL missing from .env");
    process.exit(1);
}

let proxy = null;

if (proxyInstance) {
    const proxyPath = path.resolve(__dirname, '..', 'bin', 'cloud-sql-proxy.x64.exe');
    proxy = spawn(proxyPath, [proxyInstance, '--port=15432', '-g'], {
        stdio: 'ignore',
        shell: process.platform === 'win32'
    });

    process.on('exit', () => { if (proxy) proxy.kill(); });
    process.on('SIGINT', () => { if (proxy) proxy.kill(); process.exit(); });
    process.on('SIGTERM', () => { if (proxy) proxy.kill(); process.exit(); });
}

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
        if (proxy) proxy.kill();
        process.exit();
    });
}, proxyInstance ? 1500 : 0);
