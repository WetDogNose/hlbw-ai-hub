import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function runCommand(command, errorMessage) {
    try {
        console.log(`\x1b[36mRunning:\x1b[0m ${command}`);
        // Use stdio: 'inherit' to preserve colors and allow interactive prompts if necessary
        execSync(command, { stdio: 'inherit' });
    } catch (error) {
        console.error(`\x1b[31mError:\x1b[0m ${errorMessage}`);
        console.error(error.message);
        process.exit(1);
    }
}

async function checkGitConfig() {
    console.log('\n\x1b[33m--- Checking Git Configuration ---\x1b[0m');
    try {
        // Suppress output when just checking
        const name = execSync('git config --global user.name', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
        const email = execSync('git config --global user.email', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
        console.log(`\x1b[32mGit properly configured as ${name} <${email}>\x1b[0m`);
    } catch (error) {
        console.log('\x1b[31mGit user.name or user.email not configured.\x1b[0m');
        const name = await question('Enter your Git Full Name (leave empty to skip): ');
        if (!name) {
            console.log('\x1b[33mSkipping Git configuration.\x1b[0m');
            return;
        }
        const email = await question('Enter your Git Email: ');
        if (email) {
            runCommand(`git config --global user.name "${name}"`, 'Failed to set git user.name');
            runCommand(`git config --global user.email "${email}"`, 'Failed to set git user.email');
            console.log('\x1b[32mGit configuration updated successfully.\x1b[0m');
        } else {
            console.log('\x1b[33mSkipping Git configuration.\x1b[0m');
        }
    }
}

async function checkPwsh() {
    console.log('\n\x1b[33m--- Checking PowerShell 7 ---\x1b[0m');
    try {
        execSync('pwsh --version', { stdio: 'ignore' });
        console.log('\x1b[32mPowerShell 7 is installed.\x1b[0m');
    } catch (error) {
        console.log('\x1b[31mPowerShell 7 (pwsh) is not installed.\x1b[0m');
        const answer = await question('Would you like to install PowerShell 7? (y/N) ');
        if (answer.toLowerCase() === 'y') {
            if (process.platform === 'win32') {
                runCommand('winget install --id Microsoft.Powershell --source winget', 'Failed to install PowerShell 7');
            } else if (process.platform === 'darwin') {
                runCommand('brew install --cask powershell', 'Failed to install PowerShell 7 via Homebrew');
            } else {
                console.log('Please install PowerShell 7 manually for your Linux distribution.');
            }
        } else {
            console.log('\x1b[33mSkipping PowerShell 7 installation.\x1b[0m');
        }
    }
}

async function checkGsudo() {
    console.log('\n\x1b[33m--- Checking gsudo ---\x1b[0m');
    try {
        execSync('gsudo --version', { stdio: 'ignore' });
        console.log('\x1b[32mgsudo is installed.\x1b[0m');
    } catch (error) {
        console.log('\x1b[31mgsudo is not installed.\x1b[0m');
        const answer = await question('Would you like to install gsudo? (y/N) ');
        if (answer.toLowerCase() === 'y') {
            if (process.platform === 'win32') {
                runCommand('winget install --id gerardog.gsudo --source winget --accept-package-agreements --accept-source-agreements', 'Failed to install gsudo');
            } else {
                console.log('gsudo is Windows-only. Skipping.');
            }
        } else {
            console.log('\x1b[33mSkipping gsudo installation.\x1b[0m');
        }
    }
}

async function checkGeminiCli() {
    console.log('\n\x1b[33m--- Checking Gemini CLI ---\x1b[0m');
    try {
        execSync('npm list -g @google/gemini-cli', { stdio: 'ignore' });
        console.log('\x1b[32mGemini CLI (@google/gemini-cli) is installed globally.\x1b[0m');
    } catch (error) {
        console.log('\x1b[31mGemini CLI is not installed globally.\x1b[0m');
        const answer = await question('Would you like to install the Gemini CLI (@google/gemini-cli) globally? (Y/n) ');
        if (answer.toLowerCase() !== 'n') {
            runCommand('npm install -g @google/gemini-cli', 'Failed to install @google/gemini-cli');
        } else {
            console.log('\x1b[33mSkipping Gemini CLI installation.\x1b[0m');
        }
    }
}

async function installVSCodeExtensions() {
    console.log('\n\x1b[33m--- Checking VS Code Extensions ---\x1b[0m');
    try {
        execSync('code --version', { stdio: 'ignore' });
        const extensionsFile = path.resolve(process.cwd(), '.vscode', 'extensions.json');
        if (fs.existsSync(extensionsFile)) {
            const data = JSON.parse(fs.readFileSync(extensionsFile, 'utf8'));
            if (data.recommendations && data.recommendations.length > 0) {
                const answer = await question('Would you like to install the recommended VS Code extensions? (Y/n) ');
                if (answer.toLowerCase() !== 'n') {
                    for (const ext of data.recommendations) {
                        runCommand(`code --install-extension ${ext} --force`, `Failed to install extension ${ext}`);
                    }
                } else {
                    console.log('\x1b[33mSkipping VS Code extensions installation.\x1b[0m');
                }
            } else {
                console.log('No extensions to install.');
            }
        } else {
            console.log('.vscode/extensions.json not found.');
        }
    } catch (error) {
        console.log('\x1b[33mVS Code command line (`code`) not found. Skipping extensions installation.\x1b[0m');
    }
}

async function checkPythonEnv() {
    console.log('\n\x1b[33m--- Checking Python Environment ---\x1b[0m');
    try {
        execSync('python --version', { stdio: 'ignore' });
        
        if (!fs.existsSync(path.resolve(process.cwd(), '.venv'))) {
            console.log('Creating virtual environment (.venv)...');
            runCommand('python -m venv .venv', 'Failed to create virtual environment');
        }

        console.log('Syncing Python dependencies...');
        const pipCmd = process.platform === 'win32' ? '.venv\\Scripts\\pip' : '.venv/bin/pip';
        
        if (fs.existsSync('scripts/swarm/requirements.txt')) {
             runCommand(`${pipCmd} install -r scripts/swarm/requirements.txt`, 'Failed to install swarm python requirements');
        }
        if (fs.existsSync('wrappers/a2a/requirements.txt')) {
             runCommand(`${pipCmd} install -r wrappers/a2a/requirements.txt`, 'Failed to install wrappers python requirements');
        }
        if (fs.existsSync('.agents/workers/directive-enforcer/requirements.txt')) {
             runCommand(`${pipCmd} install -r .agents/workers/directive-enforcer/requirements.txt`, 'Failed to install directive-enforcer requirements');
        }
        
        console.log('\x1b[32mPython environment initialized.\x1b[0m');
    } catch (error) {
        console.log('\x1b[31mPython 3 is not installed or not in PATH.\x1b[0m');
        console.log('\x1b[33mSkipping Python environment setup.\x1b[0m');
    }
}

async function checkGCloudAuth() {
    console.log('\n\x1b[33m--- Checking Google Cloud SDK & Auth ---\x1b[0m');

    // Check if gcloud is installed
    try {
        execSync('gcloud --version', { stdio: 'ignore' });
    } catch (error) {
        console.log('\x1b[31mGoogle Cloud SDK (gcloud) is not installed.\x1b[0m');
        const answer = await question('Would you like to install the Google Cloud SDK? (y/N) ');
        if (answer.toLowerCase() === 'y') {
            if (process.platform === 'win32') {
                console.log('Downloading and running the Google Cloud SDK installer...');
                runCommand('powershell -Command "(New-Object Net.WebClient).DownloadFile(\'https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe\', \'GoogleCloudSDKInstaller.exe\'); Start-Process -Wait -FilePath \'GoogleCloudSDKInstaller.exe\' -ArgumentList \'/S\'; Remove-Item \'GoogleCloudSDKInstaller.exe\'"', 'Failed to install Google Cloud SDK');
                console.log('\x1b[33mPlease restart your terminal after installation to use gcloud.\x1b[0m');
                return;
            } else {
                runCommand('curl https://sdk.cloud.google.com | bash', 'Failed to install Google Cloud SDK');
                console.log('\x1b[33mPlease restart your terminal and run the bootstrap script again to authenticate.\x1b[0m');
                return;
            }
        } else {
            console.log('\x1b[33mSkipping GCloud installation and authentication.\x1b[0m');
            return;
        }
    }

    try {
        const authList = execSync('gcloud auth list --format="value(account)"', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
        if (authList) {
            console.log(`\x1b[32mGCloud properly authenticated as ${authList.split('\n')[0]}\x1b[0m`);
        } else {
            throw new Error('Not authenticated');
        }
    } catch (error) {
        console.log('\x1b[31mGoogle Cloud not authenticated.\x1b[0m');
        const answer = await question('Would you like to run `gcloud auth login` now? (y/N) ');
        if (answer.toLowerCase() === 'y') {
            runCommand('gcloud auth login', 'Failed to authenticate with gcloud');

            const setProject = await question('Would you like to set the default project to `wot-box`? (Y/n) ');
            if (setProject.toLowerCase() !== 'n') {
                runCommand('gcloud config set project wot-box', 'Failed to set gcloud project to wot-box');
            }
        } else {
            console.log('\x1b[33mSkipping GCloud authentication.\x1b[0m');
        }
    }
}

async function bootstrap() {
    console.log('\x1b[1m\x1b[34m=======================================\x1b[0m');
    console.log('\x1b[1m\x1b[34m   Starting Toolchain Bootstrap...\x1b[0m');
    console.log('\x1b[1m\x1b[34m=======================================\x1b[0m\n');

    console.log('\x1b[33m--- Installing Dependencies ---\x1b[0m');
    runCommand('npm install --legacy-peer-deps', 'Failed to install npm dependencies');
    runCommand('npx husky install', 'Failed to install husky hooks');

    console.log('\n\x1b[33m--- Setting up .env ---\x1b[0m');
    const envPath = path.resolve(process.cwd(), '.env');
    const envExamplePath = path.resolve(process.cwd(), '.env.example');

    if (!fs.existsSync(envPath)) {
        if (fs.existsSync(envExamplePath)) {
            console.log('Copying .env.example to .env...');
            fs.copyFileSync(envExamplePath, envPath);
            console.log('\x1b[32mCreated .env File. Please review and update variables.\x1b[0m');
        } else {
            console.log('\x1b[31mWarning: .env.example not found. Cannot create .env automatically.\x1b[0m');
        }
    } else {
        console.log('.env already exists. Skipping...');
    }

    console.log('\n\x1b[33m--- Generating Prisma Client ---\x1b[0m');
    runCommand('npx prisma generate', 'Failed to generate Prisma client');

    await checkGsudo();
    await checkPwsh();
    await checkGeminiCli();
    await checkGitConfig();
    await checkPythonEnv();
    await checkGCloudAuth();
    await installVSCodeExtensions();

    console.log('\n\x1b[1m\x1b[32m✔ Bootstrap Complete! Your workspace is ready.\x1b[0m');
    rl.close();
}

bootstrap().catch((error) => {
    console.error('\x1b[31mBootstrap failed:\x1b[0m', error);
    process.exit(1);
});
