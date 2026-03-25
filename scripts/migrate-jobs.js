#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { JOBS_DIR } = require('../lib/config');

const LOCAL_JOBS_DIR = path.join(__dirname, '..', 'jobs');

console.log('📦 HTML2MD Storage Migration Script');
console.log('===================================');

if (!fs.existsSync(LOCAL_JOBS_DIR)) {
  console.log('✅ No local ./jobs directory found. Nothing to migrate.');
  process.exit(0);
}

const migratedFlag = path.join(LOCAL_JOBS_DIR, '.migrated');
if (fs.existsSync(migratedFlag)) {
  console.log('✅ Local ./jobs directory has already been migrated.');
  console.log(`   Data now lives in: ${JOBS_DIR}`);
  process.exit(0);
}

// Make sure target exists
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

console.log(`Moving data from:\n  Source: ${LOCAL_JOBS_DIR}\n  Target: ${JOBS_DIR}\n`);

// Read all items in local jobs dir
const items = fs.readdirSync(LOCAL_JOBS_DIR);
let movedCount = 0;

for (const item of items) {
  if (item === '.migrated') continue; // Skip if somehow we missed it

  const sourcePath = path.join(LOCAL_JOBS_DIR, item);
  const targetPath = path.join(JOBS_DIR, item);

  try {
    // If target already exists and it's _registry, we need to merge intelligently
    if (item === '_registry' && fs.existsSync(targetPath)) {
      console.log(`  Merging _registry...`);
      const regItems = fs.readdirSync(sourcePath);
      for (const regItem of regItems) {
        const sourceRegPath = path.join(sourcePath, regItem);
        const targetRegPath = path.join(targetPath, regItem);
        // Don't overwrite if it already exists in target
        if (!fs.existsSync(targetRegPath)) {
          fs.renameSync(sourceRegPath, targetRegPath);
        }
      }
      // Try to clean up empty source _registry
      try { fs.rmdirSync(sourcePath); } catch (e) {}
    } else {
      // Just move it
      console.log(`  Moving ${item}...`);
      try {
        fs.renameSync(sourcePath, targetPath);
      } catch (err) {
        if (err.code === 'EXDEV') {
            // Cross-device link not permitted, use copy + delete
            console.log(`  (Cross-device move needed for ${item})`);
            fs.cpSync(sourcePath, targetPath, { recursive: true });
            fs.rmSync(sourcePath, { recursive: true, force: true });
        } else {
            throw err;
        }
      }
    }
    movedCount++;
  } catch (error) {
    console.error(`❌ Failed to move ${item}:`, error.message);
  }
}

// Create the migrated marker
const readmeContent = `# Migrated

The job data that formerly lived in this directory has been migrated to the new centralized storage location.

**New Location:** \`${JOBS_DIR}\`

You can safely delete this \`jobs\` folder, but we left this marker to prevent confusion.
`;

fs.writeFileSync(migratedFlag, readmeContent);
fs.writeFileSync(path.join(LOCAL_JOBS_DIR, 'README.md'), readmeContent);

console.log(`\n🎉 Migration complete! Moved ${movedCount} top-level items.`);
console.log(`   You can now safely delete the local ./jobs folder if you want, or leave the .migrated marker.`);
