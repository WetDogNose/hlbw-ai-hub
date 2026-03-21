// This script synchronizes AI agent configuration files (workflows, project context) between '.agents' (Antigravity IDE) and '.gemini' (Gemini CLI) directories.
// Note: 'skills/' are explicitly excluded from synchronization because the Gemini CLI natively scans both '.agents/skills' and '.gemini/skills' automatically.
// It performs bidirectional updates, handles conflicts by copying the newer file, and uses the Gemini API for semantic merging of conflicting Markdown files.

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch') || global.fetch;

console.log('🔄 Starting Agent Configuration Sync...\n');

// Load environment to get GEMINI_API_KEY if testing locally
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const rootDir = path.join(__dirname, '..');
const antigravityDir = path.join(rootDir, '.agents');
const geminiDir = path.join(rootDir, '.gemini');
const tmpDir = path.join(rootDir, 'tmp');
const statePath = path.join(antigravityDir, '.sync-state.json');

// Ensure necessary directories exist
[antigravityDir, geminiDir, tmpDir,
    path.join(antigravityDir, 'skills'), path.join(antigravityDir, 'workflows'),
    path.join(geminiDir, 'commands'), path.join(geminiDir, 'extensions')
].forEach(d => {
    if (!fs.existsSync(d)) {
        console.log(`Creating directory: ${d}`);
        fs.mkdirSync(d, { recursive: true });
    }
});

let syncState = { lastSync: 0 };
if (fs.existsSync(statePath)) {
    try { syncState = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) { }
}
const currentTime = Date.now();

// Gemini Native Fetch Setup
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

async function aiMerge(contentA, contentB, filename) {
    if (!process.env.GEMINI_API_KEY) {
        console.error(`❌ GEMINI_API_KEY is missing in .env! Cannot perform AI merge for ${filename}. Falling back to manual conflict markers.`);
        return `<<<<<<< Antigravity IDE
${contentA}
=======
${contentB}
>>>>>>> Gemini CLI`;
    }

    console.log(`🤖 Using AI to semantically merge ${filename}...`);

    const prompt = `
You are a development toolchain assistant tasked with semantically merging two conflicting versions of an AI Agent configuration file (Markdown).
File Name: ${filename}

CRITICAL RULES:
1. DO NOT DELETE OR MODIFY ANY YAML FRONTMATTER (e.g., \`---\nname: Skill...\n---\`). If both have different frontmatter, prefer the first one but merge any missing fields.
2. Ensure all executable script instructions and tool execution paths are perfectly retained.
3. Combine the instructions and memories intelligently so no context is lost.
4. If you are entirely uncertain and contradictory instructions exist, emit standard git conflict markers (<<<<<<<, =======, >>>>>>>).
5. Output ONLY the merged file content. Do not wrap in general markdown code blocks (\`\`\`markdown) unless it is part of the file itself. 

--- VERSION A (Antigravity IDE) ---
${contentA}

--- VERSION B (Gemini CLI) ---
${contentB}
`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        const result = await response.json();
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // Clean up if the model wrapped the output in markdown code blocks mistakenly
        if (text.startsWith('```markdown\n') && text.endsWith('\n```')) {
            text = text.substring(12, text.length - 4);
        }
        return text;
    } catch (error) {
        console.error(`❌ AI Merge failed for ${filename}: ${error.message}`);
        return `<<<<<<< Antigravity IDE
${contentA}
=======
${contentB}
>>>>>>> Gemini CLI`;
    }
}

async function syncFileBidirectional(fileA, fileB, filename) {
    const existsA = fs.existsSync(fileA);
    const existsB = fs.existsSync(fileB);

    if (!existsA && !existsB) return;

    if (existsA && !existsB) {
        console.log(`Copying to Gemini CLI: ${filename}`);
        fs.mkdirSync(path.dirname(fileB), { recursive: true });
        fs.copyFileSync(fileA, fileB);
        return;
    }

    if (!existsA && existsB) {
        console.log(`Copying to Antigravity IDE: ${filename}`);
        fs.mkdirSync(path.dirname(fileA), { recursive: true });
        fs.copyFileSync(fileB, fileA);
        return;
    }

    // Both exist. Compare modification times against last sync.
    const statA = fs.statSync(fileA);
    const statB = fs.statSync(fileB);

    const aChanged = statA.mtimeMs > syncState.lastSync;
    const bChanged = statB.mtimeMs > syncState.lastSync;

    // If contents are identical, do nothing (avoids unnecessary touching)
    const contentA = fs.readFileSync(fileA, 'utf8');
    const contentB = fs.readFileSync(fileB, 'utf8');
    if (contentA === contentB) return;

    if (aChanged && !bChanged) {
        console.log(`Updating Gemini CLI with newer ${filename}`);
        fs.copyFileSync(fileA, fileB);
    } else if (!aChanged && bChanged) {
        console.log(`Updating Antigravity IDE with newer ${filename}`);
        fs.copyFileSync(fileB, fileA);
    } else if (aChanged && bChanged) {
        console.log(`⚠️ Conflict detected in ${filename}! Both files were modified.`);

        // Backup originals
        const backupA = path.join(tmpDir, `${path.basename(filename)}.antigravity.bak`);
        const backupB = path.join(tmpDir, `${path.basename(filename)}.gemini.bak`);
        fs.copyFileSync(fileA, backupA);
        fs.copyFileSync(fileB, backupB);
        console.log(`   Backups created in tmp/`);

        if (filename.endsWith('.md')) {
            // Perform AI Merge for markdown
            const mergedContent = await aiMerge(contentA, contentB, filename);
            fs.writeFileSync(fileA, mergedContent);
            fs.writeFileSync(fileB, mergedContent);
            console.log(`✅ AI Merge completed globally for ${filename}.`);
        } else {
            // For scripts/binary, strictly use whichever is absolute newest in time
            if (statA.mtimeMs > statB.mtimeMs) {
                console.log(`   Strict mtime fallback: Antigravity IDE version is newer, overwriting Gemini CLI.`);
                fs.copyFileSync(fileA, fileB);
            } else {
                console.log(`   Strict mtime fallback: Gemini CLI version is newer, overwriting Antigravity IDE.`);
                fs.copyFileSync(fileB, fileA);
            }
        }
    }
}

async function syncDirectory(dirA, dirB, relPath = '') {
    // We need to get all items from both directories
    const itemsA = fs.existsSync(dirA) ? fs.readdirSync(dirA) : [];
    const itemsB = fs.existsSync(dirB) ? fs.readdirSync(dirB) : [];
    const allItems = new Set([...itemsA, ...itemsB]);

    for (const item of allItems) {
        const itemPathA = path.join(dirA, item);
        const itemPathB = path.join(dirB, item);
        const itemRelPath = path.join(relPath, item);

        const isDirA = fs.existsSync(itemPathA) && fs.statSync(itemPathA).isDirectory();
        const isDirB = fs.existsSync(itemPathB) && fs.statSync(itemPathB).isDirectory();

        // If it's a directory in at least one place, recurse
        if (isDirA || isDirB) {
            await syncDirectory(itemPathA, itemPathB, itemRelPath);
        } else {
            await syncFileBidirectional(itemPathA, itemPathB, itemRelPath);
        }
    }
}

async function run() {
    try {
        // 1. Sync Skills (No longer synced to .gemini as Gemini CLI reads .agents/skills natively)
        console.log('--- Skipping Skills Sync (Native Support) ---');

        // 2. Sync Workflows <-> Commands
        console.log('--- Syncing Workflows/Commands ---');
        await syncDirectory(path.join(antigravityDir, 'workflows'), path.join(geminiDir, 'commands'));

        // 3. Sync Main Context / Memories
        console.log('--- Syncing Main Context ---');
        const contextA = path.join(rootDir, '.agent', 'project-context.md');
        const contextB = path.join(rootDir, 'GEMINI.md');
        await syncFileBidirectional(contextA, contextB, 'GEMINI.md');

        // Update state
        syncState.lastSync = currentTime;
        fs.writeFileSync(statePath, JSON.stringify(syncState, null, 2));

        console.log('\n🌟 Agent synchronization complete!');
    } catch (error) {
        console.error('\n❌ Fatal error during sync:', error);
        process.exit(1);
    }
}

run();
