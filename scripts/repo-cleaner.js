// scripts/repo-cleaner.js
// A utility script to purge temporary files, old logs, and test outputs to maintain repository hygiene.

const fs = require('fs');
const path = require('path');

console.log('🧹 Running Repo Cleaner...');

const rootDir = path.join(__dirname, '..');
const logsDir = path.join(rootDir, 'logs');
const tmpDir = path.join(rootDir, 'tmp');
const coverageDir = path.join(rootDir, 'coverage');

const isStartup = process.argv.includes('--startup');

let filesDeleted = 0;
let dirsDeleted = 0;

// 1. Empty the tmp directory (keep .gitkeep if it exists)
if (fs.existsSync(tmpDir)) {
    const tmpFiles = fs.readdirSync(tmpDir);
    tmpFiles.forEach(file => {
        if (file !== '.gitkeep') {
            const filePath = path.join(tmpDir, file);
            try {
                if (fs.lstatSync(filePath).isDirectory()) {
                    fs.rmSync(filePath, { recursive: true, force: true });
                    dirsDeleted++;
                } else {
                    fs.unlinkSync(filePath);
                    filesDeleted++;
                }
            } catch (err) {
                console.warn(`⚠️  Failed to delete ${filePath}: ${err.message}`);
            }
        }
    });
}

// 2. Keep the 5 most recently modified files in the logs directory, and 100 for memory trackers
if (fs.existsSync(logsDir)) {
    const logFiles = fs.readdirSync(logsDir).filter(f => !fs.lstatSync(path.join(logsDir, f)).isDirectory());

    // Separate into memory tracker logs vs other logs
    const memoryLogs = logFiles.filter(f => f.startsWith("memory-tracker-"));
    const otherLogs = logFiles.filter(f => !f.startsWith("memory-tracker-"));

    const processLogs = (files, limit) => {
        if (files.length <= limit) return;
        
        // Sort by modification time, newest first
        const sortedLogs = files
            .map(file => {
                const stat = fs.statSync(path.join(logsDir, file));
                return { file, mtime: stat.mtime.getTime() };
            })
            .sort((a, b) => b.mtime - a.mtime);

        // Delete all but the top X limit
        const toDelete = sortedLogs.slice(limit);
        toDelete.forEach(log => {
            try {
                fs.unlinkSync(path.join(logsDir, log.file));
                filesDeleted++;
            } catch (err) {
                console.warn(`⚠️  Failed to delete ${log.file}: ${err.message}`);
            }
        });
    };

    processLogs(memoryLogs, 100);
    processLogs(otherLogs, 5);
} else {
    // Create it if it doesn't exist
    fs.mkdirSync(logsDir, { recursive: true });
}

// 3. Remove test coverage output directory entirely
const dirsToRemove = [coverageDir];

dirsToRemove.forEach(dir => {
    if (fs.existsSync(dir)) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            dirsDeleted++;
        } catch (err) {
            console.warn(`⚠️  Failed to delete directory ${dir}: ${err.message}`);
        }
    }
});

// 4. Move misconfigured root files to appropriate directories
const rootFiles = fs.readdirSync(rootDir).filter(f => !fs.lstatSync(path.join(rootDir, f)).isDirectory());

rootFiles.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    const filePath = path.join(rootDir, file);

    // Move .log files to logs/
    if (ext === '.log') {
        const targetPath = path.join(logsDir, file);
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
        fs.renameSync(filePath, targetPath);
        console.log(`📦 Moved ${file} to logs/`);
        filesDeleted++; // We'll count these as changes for the log
    }
    // Move testing/temp files to tmp/
    else if (ext === '.tmp' || file.startsWith('temp-')) {
        const targetPath = path.join(tmpDir, file);
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        fs.renameSync(filePath, targetPath);
        console.log(`📦 Moved ${file} to tmp/`);
        filesDeleted++;
    }
});

console.log(`✅  Repo Cleaner finished. Deleted/Moved ${filesDeleted} files and ${dirsDeleted} directories.`);
