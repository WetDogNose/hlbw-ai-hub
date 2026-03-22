const fs = require('fs');
const path = require('path');

const ignoreDirs = ['node_modules', '.venv', '.next', '.git', 'dist', 'build'];

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (!ignoreDirs.includes(file)) {
                results = results.concat(walk(filePath));
            }
        } else {
            if (filePath.endsWith('.md') || filePath.endsWith('.ts') || filePath.endsWith('.js') || filePath.endsWith('.py')) {
                results.push(filePath);
            }
        }
    });
    return results;
}

async function run() {
    const files = walk(process.cwd());
    const targetFiles = [];

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.toLowerCase().includes('<agent_') || content.toLowerCase().includes('**[agent ')) {
            if (content.includes('<agent_directive') || content.includes('<agent_instruction') || content.includes('<agent_hint')) {
                targetFiles.push(file);
            }
        }
    }

    console.log(`Found ${targetFiles.length} files with legacy tags.`);
    for (const file of targetFiles) {
        console.log(`Validating and fixing: ${file}`);
        try {
            // The container mounts the workspace at /workspace
            let absolutePath = file.replace(/\\/g, '/');
            let cwd = process.cwd().replace(/\\/g, '/');
            let containerPath = absolutePath.replace(cwd, '/workspace');
            
            const resp = await fetch('http://localhost:8080/a2a/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sender_id: 'batch-audit',
                    target_id: 'directive-enforcer',
                    payload: { action: 'validate_file', filepath: containerPath }
                })
            });
            const data = await resp.json();
            console.log(`Result for ${file}:`, data);
        } catch (e) {
            console.error(`Failed on ${file}:`, e);
        }
    }
}

run();