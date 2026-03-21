// This script automates documentation for various project files (scripts, workflows, AI skills).
// It uses the Google Gemini API to generate comments, frontmatter, or `SKILL.md` files where missing.

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const rootDir = path.join(__dirname, '..');
const scriptsDir = path.join(rootDir, 'scripts');
const workflowsDir = path.join(rootDir, '.agents', 'workflows');
const skillsDir = path.join(rootDir, '.agents', 'skills');

console.log('📚 Starting Auto-Documenting Toolchain...\n');

if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY is missing! Skipping auto-documentation.');
    process.exit(0);
}

const fetch = require('node-fetch') || global.fetch;

/**
 * Uses Gemini to generate code comments or markdown frontmatter
 */
async function generateDocumentation(promptText) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        const result = await response.json();
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.trim();
        
        if (text.startsWith('```markdown')) text = text.substring(11, text.length - 3).trim();
        if (text.startsWith('```javascript')) text = text.substring(13, text.length - 3).trim();
        if (text.startsWith('```')) text = text.substring(3, text.length - 3).trim();
        return text;
    } catch (error) {
        console.error(`❌ AI Generation failed: ${error.message}`);
        return null;
    }
}

async function documentScripts() {
    if (!fs.existsSync(scriptsDir)) return;
    const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js') || f.endsWith('.sh'));

    for (const file of files) {
        const filePath = path.join(scriptsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if it already has a top-level JSDoc or standard comment block
        if (content.trim().startsWith('//') || content.trim().startsWith('/*') || content.trim().startsWith('#')) {
            // If it starts with a shebang, check the first non-empty line after it.
            if (content.trim().startsWith('#!/')) {
                const lines = content.trim().split('\n');
                // Skip the shebang (index 0) and any immediately following empty lines
                let firstCodeLineIndex = 1;
                while (firstCodeLineIndex < lines.length && lines[firstCodeLineIndex].trim() === '') {
                    firstCodeLineIndex++;
                }
                if (firstCodeLineIndex < lines.length && (lines[firstCodeLineIndex].trim().startsWith('//') || lines[firstCodeLineIndex].trim().startsWith('#'))) {
                    continue; // Documented
                }
            } else {
                continue; // Documented
            }
        }

        console.log(`🤖 Generating documentation comment for script: ${file}`);
        const prompt = `
You are documenting a script file named '${file}'.
Read the code below and write a concise, 1-2 line comment explaining what the script does.
If it is a JS file, use \`//\` syntax. If it is a bash file, use \`#\` syntax.
Return ONLY the comment block, nothing else.

CODE:
${content}
`;
        const doc = await generateDocumentation(prompt);
        if (doc) {
            if (content.startsWith('#!/')) {
                const parts = content.split('\n');
                const shebang = parts.shift();
                fs.writeFileSync(filePath, `${shebang}\n${doc}\n\n${parts.join('\n')}`);
            } else {
                fs.writeFileSync(filePath, `${doc}\n\n${content}`);
            }
            console.log(`✅ Documented ${file}`);
        }
    }
}

async function documentWorkflows() {
    if (!fs.existsSync(workflowsDir)) return;
    const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
        const filePath = path.join(workflowsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if it already has YAML frontmatter
        if (content.trim().startsWith('---')) {
            continue; // Documented
        }

        console.log(`🤖 Generating YAML frontmatter for workflow: ${file}`);
        const prompt = `
You are documenting an AI Workflow named '${file}'.
Read the markdown instructions below and generate standard YAML frontmatter containing a 'description' field.
Return ONLY the frontmatter (including the --- boundaries). DO NOT return the original instructions.

WORKFLOW:
${content}
`;
        const frontmatter = await generateDocumentation(prompt);
        if (frontmatter) {
            fs.writeFileSync(filePath, `${frontmatter}\n\n${content}`);
            console.log(`✅ Documented workflow ${file}`);
        }
    }
}

async function documentSkills() {
    if (!fs.existsSync(skillsDir)) return;
    const skills = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const skill of skills) {
        const skillDirPath = path.join(skillsDir, skill);
        const skillMdPath = path.join(skillDirPath, 'SKILL.md');

        if (fs.existsSync(skillMdPath)) {
            continue; // Documented
        }

        console.log(`🤖 Generating SKILL.md for missing knowledge in folder: ${skill}`);

        let context = `This skill folder is named '${skill}'. It currently lacks a SKILL.md file. `;
        const scriptsPath = path.join(skillDirPath, 'scripts');

        if (fs.existsSync(scriptsPath)) {
            const innerScripts = fs.readdirSync(scriptsPath);
            context += `It contains the following scripts: ${innerScripts.join(', ')}. `;
        }

        const prompt = `
You are writing a standard \`SKILL.md\` file for an AI Agent.
Context about the skill: ${context}

Generate a valid \`SKILL.md\` file containing:
1. YAML frontmatter with 'name' and 'description'
2. A markdown section titled '# Instructions' explaining exactly how the AI agent should use this skill or its scripts.
Do not output anything except the file content.
`;
        const skillContent = await generateDocumentation(prompt);
        if (skillContent) {
            fs.writeFileSync(skillMdPath, skillContent);
            console.log(`✅ Scaffolded SKILL.md for ${skill}`);
        }
    }
}

async function run() {
    await documentScripts();
    await documentWorkflows();
    await documentSkills();
    console.log('\n🌟 Auto-Documentation complete!');
}

run();
