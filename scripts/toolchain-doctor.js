// scripts/toolchain-doctor.js
// A comprehensive script to validate project health, skills, workflows, and configs.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🩺 Starting Toolchain Doctor...\n');

const args = process.argv.slice(2);
const isUpdate = args.includes('--update');
const isMcpRefresh = args.includes('--mcp-refresh');
const isAuditDirectives = args.includes('--audit-directives');
const isFixDirectives = args.includes('--fix-directives');
const isGraphDirectives = args.includes('--graph-directives');

if (isUpdate) {
    console.log('🔄 Update flag detected. Launching Toolchain Updater...\n');
    try {
        execSync(`node "${path.join(__dirname, 'update-toolchain.js')}"`, { stdio: 'inherit' });
        process.exit(0);
    } catch (e) {
        console.error(`🚨 Toolchain Updater failed: ${e.message}\n`);
        process.exit(1);
    }
}

if (isAuditDirectives || isFixDirectives || isGraphDirectives) {
    const mode = isGraphDirectives ? 'graph' : (isFixDirectives ? 'fix' : 'identify');
    const verb = mode === 'fix' ? 'Enforcing' : (mode === 'graph' ? 'Mapping' : 'Auditing');
    console.log(`🛡️  ${verb} Agent Directives across workspace [Mode: ${mode}]...\n`);
    try {
        const agentPy = path.join(__dirname, '..', '.agents', 'workers', 'directive-enforcer', 'main.py');
        const pythonCmd = process.platform === 'win32' ? path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe') : path.join(__dirname, '..', '.venv', 'bin', 'python');
        execSync(`"${pythonCmd}" "${agentPy}" --cli-run "${path.join(__dirname, '..')}" --mode ${mode}`, { stdio: 'inherit' });
        process.exit(0); // Only run the enforcement, exit correctly afterward
    } catch (e) {
        console.error(`🚨 Directive Enforcer failed: ${e.message}\n`);
        process.exit(1);
    }
}


let hasErrors = false;

// 0. Run Repo Cleaner to maintain hygiene before diagnostics
console.log('🧹 Triggering Repo Cleaner...');
try {
    execSync(`node ${path.join(__dirname, 'repo-cleaner.js')}`, { stdio: 'inherit' });
    console.log(); // Spacing
} catch (e) {
    console.error(`🚨 Repo Cleaner failed: ${e.message}\n`);
    hasErrors = true;
}

const logError = (msg) => {
    console.error(`❌ ${msg}`);
    hasErrors = true;
};
const logSuccess = (msg) => console.log(`✅ ${msg}`);
const logInfo = (msg) => console.log(`ℹ️  ${msg}`);

const mandatoryServers = {
    "postgres-prod": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, 'mcp-wrapper.mjs')]
    },
    "wot-box-tester": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, 'mcp-tester.mjs')]
    },
    "gcp-trace-mcp": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, 'mcp-trace-server.mjs')]
    },
    "gcp-logging-mcp": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, 'mcp-logging-server.mjs')]
    },
    "task-delegator-mcp": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, '..', '.agents', 'mcp-servers', 'task-delegator', 'dist', 'index.js')]
    },
    "ast-analyzer-mcp": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, '..', '.agents', 'mcp-servers', 'ast-analyzer', 'dist', 'index.js')]
    },
    "infrastructure-analyzer-mcp": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, '..', '.agents', 'mcp-servers', 'infrastructure-analyzer', 'dist', 'index.js')]
    },
    "docker-manager-mcp": {
        "command": process.execPath,
        "args": [path.resolve(__dirname, '..', '.agents', 'mcp-servers', 'docker-manager-mcp', 'build', 'index.js')]
    }
};

// Known broken or legacy packages -> Correct packages
const MCP_PACKAGE_MAP = {
    "@modelcontextprotocol/server-sequentialthinking": "@modelcontextprotocol/server-sequential-thinking",
    "@modelcontextprotocol/server-git": null, // Mark as broken/removed
};

// Duplicates to prune (keep the first one, remove others)
const DUPLICATE_MAP = {
    "MCP_DOCKER": "docker-mcp-gateway",
    "sequentialthinking": "sequential-thinking"
};

/**
 * Strips all metadata keys (starting with $) from an object recursively.
 */
function stripMetadata(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clean = Array.isArray(obj) ? [] : {};
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('$')) continue;
        clean[key] = stripMetadata(value);
    }
    return clean;
}

// 0.1 Handle MCP Refresh
if (isMcpRefresh) {
    console.log('🔄 MCP Refresh flag detected. Re-registering mandatory MCP servers to trigger tool discovery...\n');
    for (const [name, config] of Object.entries(mandatoryServers)) {
        try {
            const argsStr = config.args.map(arg => `"${arg}"`).join(' ');
            console.log(`   Registering ${name}...`);
            execSync(`gemini mcp add --scope project "${name}" "${config.command}" ${argsStr}`, { stdio: 'ignore' });
            logSuccess(`${name} re-registered successfully.`);
        } catch (e) {
            logError(`Failed to re-register ${name}: ${e.message}`);
        }
    }
    console.log('\n🌟 MCP Refresh complete. Please run "/mcp refresh" in your active Gemini CLI session to see the changes.\n');
    process.exit(hasErrors ? 1 : 0);
}

// 1. Validate .env
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');
if (!fs.existsSync(envPath) || !fs.existsSync(envExamplePath)) {
    logError('Missing .env or .env.example file. Run: cp .env.example .env');
} else {
    logSuccess('.env and .env.example exist.');
}

// 2. Validate Skills (.agents/skills)
const skillsPath = path.join(__dirname, '..', '.agents', 'skills');
if (fs.existsSync(skillsPath)) {
    const skills = fs.readdirSync(skillsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    if (skills.length === 0) {
        logInfo('No skills found in .agents/skills.');
    } else {
        skills.forEach(skill => {
            const skillMdPath = path.join(skillsPath, skill, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) {
                logError(`Skill '${skill}' is missing a SKILL.md file. This breaks the AI context!`);
            } else {
                logSuccess(`Skill '${skill}' has a valid SKILL.md.`);
            }
        });
    }
} else {
    logInfo('.agents/skills directory does not exist yet.');
}

// 3. Validate Workflows (.agents/workflows)
const workflowsPath = path.join(__dirname, '..', '.agents', 'workflows');
if (fs.existsSync(workflowsPath)) {
    const workflows = fs.readdirSync(workflowsPath).filter(f => f.endsWith('.md'));
    if (workflows.length === 0) {
        logInfo('No workflows found in .agents/workflows.');
    } else {
        logSuccess(`Found ${workflows.length} workflows. (Ensure they have valid YAML frontmatter!)`);
    }
} else {
    logInfo('.agents/workflows directory does not exist yet.');
}

// 4. Validate script syntax
const scriptsDir = path.join(__dirname, '..', 'scripts');
if (fs.existsSync(scriptsDir)) {
    const jsScripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
    jsScripts.forEach(script => {
        try {
            // Basic syntax check using node --check
            execSync(`node --check ${path.join(scriptsDir, script)}`, { stdio: 'ignore' });
            logSuccess(`Script ${script} passed basic syntax check.`);
        } catch (e) {
            logError(`Script ${script} has syntax errors! Run 'node ${path.join('scripts', script)}' to debug.`);
        }
    });
}

// 5. Validate Agent Config Sync
const syncScriptPath = path.join(__dirname, 'sync-agent-configs.js');
const geminiDir = path.join(__dirname, '..', '.gemini');
if (!fs.existsSync(syncScriptPath)) {
    logError('Missing scripts/sync-agent-configs.js! The AI agents will fall out of sync.');
} else {
    logSuccess('Agent Sync script is present.');
    if (fs.existsSync(geminiDir)) {
        logSuccess('.gemini directory is scaffolded and ready for the Gemini CLI.');
    } else {
        logInfo('.gemini directory is missing. Run `npm run sync-agents` to scaffold it!');
    }
}

console.log('\n--- Toolchain Doctor Report ---');

// 8. TSConfig Vitest Exclusion Self-Healing
console.log('\n--- TSConfig Exclusion Check ---');
try {
    const tsconfigPath = path.join(__dirname, '..', 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
        const excludeArr = tsconfig.exclude || [];
        const swarmTestDir = 'scripts/swarm/__tests__';

        if (!excludeArr.includes(swarmTestDir)) {
            tsconfig.exclude = [...excludeArr, swarmTestDir];
            fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
            logSuccess(`Auto-healed tsconfig.json: added '${swarmTestDir}' to exclude array (vitest files were leaking into tsc).`);
        } else {
            logSuccess(`tsconfig.json already excludes '${swarmTestDir}'.`);
        }
    } else {
        logInfo('tsconfig.json not found — skipping exclusion check.');
    }
} catch (e) {
    logError(`TSConfig exclusion check failed: ${e.message}`);
}

// 8b. Jest Config Swarm Exclusion Check
console.log('\n--- Jest Config Exclusion Check ---');
try {
    const jestConfigPath = path.join(__dirname, '..', 'jest.config.ts');
    if (fs.existsSync(jestConfigPath)) {
        const content = fs.readFileSync(jestConfigPath, 'utf8');
        if (content.includes('scripts/swarm/__tests__')) {
            logSuccess("jest.config.ts already excludes swarm test directory from testPathIgnorePatterns.");
        } else {
            logError("jest.config.ts does NOT exclude 'scripts/swarm/__tests__/' from testPathIgnorePatterns. Swarm vitest tests will crash Jest! Add '<rootDir>/scripts/swarm/__tests__/' to the array.");
        }
    } else {
        logInfo('jest.config.ts not found — skipping Jest exclusion check.');
    }
} catch (e) {
    logError(`Jest config exclusion check failed: ${e.message}`);
}

// 9. Infrastructure Analyzer next.config.* Reference Check
console.log('\n--- Infrastructure Analyzer Config Reference Check ---');
try {
    const infraSrcPath = path.join(__dirname, '..', '.agents', 'mcp-servers', 'infrastructure-analyzer', 'src', 'index.ts');
    if (fs.existsSync(infraSrcPath)) {
        const srcContent = fs.readFileSync(infraSrcPath, 'utf8');
        // Detect which next.config.* file actually exists on disk
        const configCandidates = ['next.config.ts', 'next.config.mjs', 'next.config.js'];
        const repoRoot = path.join(__dirname, '..');
        let actualConfig = null;
        for (const candidate of configCandidates) {
            if (fs.existsSync(path.join(repoRoot, candidate))) {
                actualConfig = candidate;
                break;
            }
        }

        if (actualConfig) {
            // Check if the source contains a hardcoded stale reference (non-auto-detecting pattern)
            const staleRefMatch = srcContent.match(/path\.join\(REPO_ROOT,\s*["']next\.config\.(mjs|js|ts)["']\)/);
            if (staleRefMatch) {
                const referencedExt = staleRefMatch[1];
                const referencedFile = `next.config.${referencedExt}`;
                if (referencedFile !== actualConfig) {
                    logError(`Infrastructure Analyzer source hardcodes '${referencedFile}' but the actual file is '${actualConfig}'. Update the MCP source and rebuild!`);
                } else {
                    logSuccess(`Infrastructure Analyzer references '${referencedFile}' — matches disk.`);
                }
            } else {
                // The source uses auto-detection (nextConfigCandidates pattern) — this is the ideal state
                logSuccess('Infrastructure Analyzer uses auto-detection for next.config.* — resilient to renames.');
            }
        } else {
            logInfo('No next.config.* file found in repo root — skipping reference check.');
        }
    } else {
        logInfo('Infrastructure Analyzer MCP source not found — skipping config reference check.');
    }
} catch (e) {
    logError(`Infrastructure Analyzer config reference check failed: ${e.message}`);
}

console.log('\n-------------------------------');

// 10. Git Worktree Health Validation
console.log('\n--- Git Worktree Health Check ---');
try {
    const worktreesRoot = path.join(__dirname, '..', '..', 'wot-box-worktrees');
    const repoRoot = path.join(__dirname, '..');
    
    // Step 1: Tell Git to prune its internal tracking of deleted worktrees
    execSync('git worktree prune', { cwd: repoRoot, stdio: 'ignore' });
    
    // Step 2: Get the list of currently valid worktrees according to git
    const gitWorktreesOutput = execSync('git worktree list --porcelain', { cwd: repoRoot, encoding: 'utf8' });
    const validWorktreePaths = gitWorktreesOutput
      .split('\n')
      .filter(line => line.startsWith('worktree '))
      .map(line => line.replace('worktree ', '').trim());
      
    // Step 3: Ensure the wot-box-worktrees folder exists to check for orphaned directories
    if (fs.existsSync(worktreesRoot)) {
        const discoveredDirs = fs.readdirSync(worktreesRoot, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => path.join(worktreesRoot, dirent.name));
            
        let orphanedCount = 0;
        for (const dirPath of discoveredDirs) {
            // Because Windows paths vs Git paths might differ slightly in capitalization or slashes,
            // we do a resilient check strictly checking if any git worktree points *into* this physical path.
            const isTracked = validWorktreePaths.some(wpt => path.resolve(wpt).toLowerCase() === path.resolve(dirPath).toLowerCase());
            
            if (!isTracked) {
                try {
                    fs.rmSync(dirPath, { recursive: true, force: true });
                    orphanedCount++;
                } catch (e) {
                    logError(`Failed to delete orphaned worktree directory: ${dirPath} - ${e.message}`);
                }
            }
        }
        
        if (orphanedCount > 0) {
            logSuccess(`Purged ${orphanedCount} orphaned physical worktree directories.`);
        } else {
            logSuccess(`No orphaned worktree directories found.`);
        }
    } else {
        logInfo('No wot-box-worktrees directory found outside the repo — skipping folder check.');
    }
    logSuccess('Git worktree internal tracking pruned.');
} catch (e) {
    logError(`Git Worktree health check failed: ${e.message}`);
}


// 6. Validate & Auto-Configure Gemini CLI MCPs
try {
    const os = require('os');
    const antigravityMcpPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
    const mcpPaths = [
        path.join(os.homedir(), '.gemini', 'mcp.json'),
        antigravityMcpPath,
        path.join(__dirname, '..', '.gemini', 'mcp.json'),
        path.join(__dirname, '..', '.gemini', 'settings.json')
    ];

    // Load discovered servers from Antigravity (the source of truth for new servers)
    let discoveredServers = {};
    if (fs.existsSync(antigravityMcpPath)) {
        try {
            const antigravityConfig = JSON.parse(fs.readFileSync(antigravityMcpPath, 'utf8'));
            if (antigravityConfig.mcpServers) {
                discoveredServers = antigravityConfig.mcpServers;
                
                // Fix known typos, broken servers, and duplicates
                for (const name of Object.keys(discoveredServers)) {
                    const s = discoveredServers[name];
                    
                    // 1. Package Mapper (fix legacy or typo'd npx packages)
                    if (s.args) {
                        for (let i = 0; i < s.args.length; i++) {
                            const arg = s.args[i];
                            if (MCP_PACKAGE_MAP.hasOwnProperty(arg)) {
                                const replacement = MCP_PACKAGE_MAP[arg];
                                if (replacement === null) {
                                    logInfo(`Pruning broken MCP server '${name}' (contains non-existent package: ${arg})`);
                                    delete discoveredServers[name];
                                    break;
                                } else {
                                    s.args[i] = replacement;
                                    logInfo(`Auto-mapped MCP package: ${arg} -> ${replacement}`);
                                }
                            }
                        }
                    }

                    // 2. Duplicate Pruning
                    if (DUPLICATE_MAP.hasOwnProperty(name)) {
                        const canonicalName = DUPLICATE_MAP[name];
                        logInfo(`Pruning duplicate/legacy MCP server name '${name}' in favor of '${canonicalName}'`);
                        delete discoveredServers[name];
                    }
                }
            }
        } catch (e) {
            logInfo('Could not parse Antigravity MCP config for discovery.');
        }
    }

    // Combined desired state: Mandatory servers + anything found in Antigravity
    const expectedServers = { ...discoveredServers, ...mandatoryServers };

    mcpPaths.forEach(mcpConfigPath => {
        let config = {};

        if (fs.existsSync(mcpConfigPath)) {
            try {
                config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
            } catch (parseErr) {
                logInfo(`Existing config at ${mcpConfigPath} was malformed. Recreating...`);
            }
        }
        if (!config.mcpServers) config.mcpServers = {};

        let updated = false;

        // Pruning logic: Remove servers that are NOT mandatory AND NOT in the discovered list
        // ALSO remove known duplicates/legacy names if they exist in the config
        for (const currentName of Object.keys(config.mcpServers)) {
            if (!expectedServers[currentName] || DUPLICATE_MAP.hasOwnProperty(currentName)) {
                delete config.mcpServers[currentName];
                updated = true;
            }
        }

        // Addition/Update logic: Ensure all expected servers are present and mandatory ones have correct paths
        for (const [name, expectedConfig] of Object.entries(expectedServers)) {
            // Create a clean copy of the config to strip metadata keys like $typeName
            const cleanConfig = stripMetadata(expectedConfig);

            const current = config.mcpServers[name];
            
            // For mandatory servers, we strictly enforce command and the first argument (the wrapper path)
            const isMandatory = !!mandatoryServers[name];
            
            if (!current) {
                config.mcpServers[name] = cleanConfig;
                updated = true;
            } else if (isMandatory) {
                // Ensure absolute paths match strictly for mandatory project servers
                if (current.command !== cleanConfig.command || JSON.stringify(current.args) !== JSON.stringify(cleanConfig.args)) {
                    config.mcpServers[name] = cleanConfig;
                    updated = true;
                }
            } else {
                // For non-mandatory servers (from Antigravity), ensure $metadata is stripped
                if (JSON.stringify(current) !== JSON.stringify(cleanConfig)) {
                    config.mcpServers[name] = cleanConfig;
                    updated = true;
                }
            }
        }

        if (updated) {
            if (!fs.existsSync(path.dirname(mcpConfigPath))) {
                fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
            }
            fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 4));
            logSuccess(`Synchronized MCP servers in ${mcpConfigPath}`);
        } else {
            logSuccess(`MCP configuration at ${mcpConfigPath} is up to date.`);
        }
    });
} catch (e) {
    logError(`Failed to sync Gemini MCPs: ${e.message}`);
}

// 7. Validate MCP Server Health (entry-point existence & Auto-Build)
console.log('\n--- MCP Server Health Validation ---');
try {
    const os = require('os');
    const antigravityMcpPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');

    const checkServers = { ...mandatoryServers }; // Always check mandatory servers

    for (const [name, config] of Object.entries(checkServers)) {
        const args = config.args || [];
        const entryPoint = args.find(arg =>
            arg.endsWith('.mjs') || arg.endsWith('.js') || arg.endsWith('.ts')
        );

        if (entryPoint && !entryPoint.startsWith('-')) {
            if (fs.existsSync(entryPoint)) {
                logSuccess(`MCP server '${name}' entry-point exists: ${path.basename(entryPoint)}`);
            } else {
                // Entry point missing. Check if it's a project-local server we can build.
                const serverDir = path.dirname(path.dirname(entryPoint)); // Go up from dist/index.js or build/index.js
                const pkgJsonPath = path.join(serverDir, 'package.json');
                
                if (fs.existsSync(pkgJsonPath)) {
                    logInfo(`MCP server '${name}' entry-point is missing, but source found at ${serverDir}. Attempting auto-build...`);
                    try {
                        execSync('npm install && npm run build', { cwd: serverDir, stdio: 'inherit' });
                        if (fs.existsSync(entryPoint)) {
                            logSuccess(`Auto-built MCP server '${name}' successfully.`);
                        } else {
                            logError(`Auto-build for '${name}' finished but entry-point still missing at ${entryPoint}`);
                        }
                    } catch (buildErr) {
                        logError(`Failed to auto-build MCP server '${name}': ${buildErr.message}`);
                    }
                } else {
                    logError(`MCP server '${name}' entry-point is MISSING: ${entryPoint}`);
                }
            }
        } else {
            logSuccess(`MCP server '${name}' is registered (npx/external).`);
        }
    }
} catch (e) {
    logError(`MCP health validation failed: ${e.message}`);
}

console.log('\n-------------------------------');

// 11. Validate Tooling Configuration (Prettier, CSpell, Husky, Jest, Secretlint)
console.log('\n--- Tooling Configuration Validate ---');
try {
    const pkgJsonPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const devDeps = pkg.devDependencies || {};
        if (!devDeps.prettier) logError("Prettier is missing from devDependencies!");
        if (!devDeps.cspell) logError("cspell is missing from devDependencies!");
        logSuccess("Prettier and CSpell dependencies check passed.");
    }
    
    const secretlintrcPath = path.join(__dirname, '..', '.secretlintrc.json');
    if (!fs.existsSync(secretlintrcPath)) logError("Missing .secretlintrc.json config for security testing.");
    else logSuccess(".secretlintrc.json found.");

    const precommitPath = path.join(__dirname, '..', '.husky', 'pre-commit');
    if (!fs.existsSync(precommitPath)) {
        logError("Missing .husky/pre-commit! Attempting auto-heal...");
        try {
            if (!fs.existsSync(path.join(__dirname, '..', '.husky'))) fs.mkdirSync(path.join(__dirname, '..', '.husky'));
            fs.writeFileSync(precommitPath, '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpx lint-staged\n');
            logSuccess("Auto-healed .husky/pre-commit.");
        } catch(e) { logError("Failed to auto-heal husky: " + e.message); }
    } else {
        logSuccess(".husky/pre-commit hook found.");
    }
} catch (e) {
    logError(`Tooling config validation failed: ${e.message}`);
}

console.log('\n-------------------------------');

// 12. Validate Directive Enforcer Worker
console.log('\n--- Directive Enforcer A2A Worker Validate ---');
try {
    const enforcerPath = path.join(__dirname, '..', '.agents', 'workers', 'directive-enforcer', 'main.py');
    const skillPath = path.join(__dirname, '..', '.agents', 'skills', 'directive-enforcer', 'SKILL.md');
    
    if (!fs.existsSync(enforcerPath)) {
        logError("Missing Directive Enforcer A2A Worker! Run scaffold-agent to restore.");
    } else {
        logSuccess("Directive Enforcer A2A Worker script exists.");
    }
    
    if (!fs.existsSync(skillPath)) {
        logError("Missing Directive Enforcer SKILL.md documentation.");
    } else {
        logSuccess("Directive Enforcer SKILL.md exists.");
    }
} catch (e) {
    logError(`Directive Enforcer validation failed: ${e.message}`);
}


console.log('\n-------------------------------');
if (hasErrors) {
    console.error('\n🚨 The Toolchain Doctor found issues! Please fix them to keep the project self-healing.');
    process.exit(1);
} else {
    console.log('\n🌟 Toolchain is healthy and aligned! You are good to go.');
    process.exit(0);
}
