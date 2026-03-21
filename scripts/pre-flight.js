// pre-flight.js
// Runs before `npm run dev` to ensure environment is sane.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('✈️  Running pre-flight checks...');

const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envExamplePath)) {
    console.warn('⚠️  No .env.example found. Skipping environment check.');
} else {
    if (!fs.existsSync(envPath)) {
        console.error('❌  No .env file found. Please copy .env.example to .env and fill in the required values.');
        process.exit(1);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');

    const getKeys = (content) => {
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.split('=')[0]);
    };

    const expectedKeys = getKeys(envExampleContent);
    const actualKeys = getKeys(envContent);

    const missingKeys = expectedKeys.filter(key => !actualKeys.includes(key));

    if (missingKeys.length > 0) {
        console.error('\n❌  Missing the following keys in your .env file:');
        missingKeys.forEach(key => console.error(`    - ${key}`));
        console.error('\nPlease update your .env file to match .env.example.\n');
        process.exit(1);
    }
}

// Quick check for node_modules
if (!fs.existsSync(path.join(__dirname, '..', 'node_modules'))) {
    console.error('❌  node_modules missing. Did you forget to run `npm install`?');
    process.exit(1);
}

// Run Repo Cleaner
console.log('🧹 Running Repo Cleaner (Startup Mode)...');
try {
    execSync(`node ${path.join(__dirname, 'repo-cleaner.js')} --startup`, { stdio: 'inherit' });
} catch (e) {
    console.warn(`⚠️  Repo Cleaner encountered an issue: ${e.message}`);
}

console.log('✅  Pre-flight checks passed! Entering warp speed...');
