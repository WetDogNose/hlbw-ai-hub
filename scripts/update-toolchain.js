// scripts/update-toolchain.js
// A comprehensive script to aggressively update all toolchain dependencies to their latest releases.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🚀 Starting Toolchain Agresive Updater...\n');

const runCommand = (command, errorMessage, ignoreErrors = false) => {
    try {
        console.log(`\x1b[36mRunning:\x1b[0m ${command}`);
        execSync(command, { stdio: 'inherit' });
        console.log(); // spacing
    } catch (error) {
        if (!ignoreErrors) {
            console.error(`\x1b[31mError:\x1b[0m ${errorMessage}`);
            console.error(error.message);
        } else {
            console.warn(`\x1b[33mWarning (Ignored):\x1b[0m ${errorMessage}`);
        }
    }
};

// 1. Update Repo Indexes
console.log('\n\x1b[33m--- Updating Repository Indexes ---\x1b[0m');
runCommand('git fetch --all', 'Failed to fetch git repo from remotes.');
runCommand('git pull', 'Failed to pull latest changes from git.', true);

// 3. Upgrade Global Node Tools
console.log('\n\x1b[33m--- Upgrading Global Node Tools ---\x1b[0m');
runCommand('npm install -g npm@latest', 'Failed to upgrade npm to latest.');
runCommand('npm install -g npm-check-updates@latest', 'Failed to upgrade/install npm-check-updates.');

// 3. Upgrade Project Npm Packages
console.log('\n\x1b[33m--- Upgrading Project Dependencies (Latest Majors) ---\x1b[0m');
runCommand('npx npm-check-updates -u', 'Failed to update package.json with latest dependency versions.');
runCommand('npm install', 'Failed to install updated npm packages.');

// 4. Upgrade VS Code and Extensions
console.log('\n\x1b[33m--- Upgrading VS Code Extensions ---\x1b[0m');
const extensionsFile = path.resolve(process.cwd(), '.vscode', 'extensions.json');
if (fs.existsSync(extensionsFile)) {
    try {
        const data = JSON.parse(fs.readFileSync(extensionsFile, 'utf8'));
        if (data.recommendations && data.recommendations.length > 0) {
            for (const ext of data.recommendations) {
                runCommand(`code --install-extension ${ext} --force`, `Failed to force update extension ${ext}`, true);
            }
        }
    } catch (e) {
        console.error('\x1b[31mError reading .vscode/extensions.json\x1b[0m', e.message);
    }
} else {
    console.log('\x1b[33mNo .vscode/extensions.json found. Skipping VS Code extensions update.\x1b[0m');
}

// 5. Upgrade System wide dependencies via winget (Windows only)
if (process.platform === 'win32') {
    console.log('\n\x1b[33m--- Upgrading System Packages (Node.js & VS Code via winget) ---\x1b[0m');
    console.warn('\x1b[33mNote: winget upgrade might require administrator privileges or popping up a UAC prompt.\x1b[0m');
    runCommand('winget upgrade OpenJS.NodeJS --source winget --accept-package-agreements --accept-source-agreements', 'Failed to upgrade Node.JS via winget.', true);
    runCommand('winget upgrade Microsoft.VisualStudioCode --source winget --accept-package-agreements --accept-source-agreements', 'Failed to upgrade VS Code via winget.', true);
} else {
    console.log('\n\x1b[33mNote: Non-Windows OS detected, skipping winget-based Node/VSCode upgrades. Please upgrade via your native package manager.\x1b[0m');
}

console.log('\n\x1b[1m\x1b[32m✔ Toolchain upgrade complete!\x1b[0m\n');
console.warn('\x1b[33mImportant: If Node.js was upgraded, you may need to restart your terminal and run `npm install` again to rebuild native modules.\x1b[0m');
process.exit(0);
