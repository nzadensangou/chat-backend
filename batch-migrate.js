#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const API_DIR = path.resolve(__dirname, 'pages/api');

/**
 * Recursively find all .js files in API directory
 */
function findJsFiles(dir) {
  let files = [];
  try {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.')) {
        files = files.concat(findJsFiles(fullPath));
      } else if (stat.isFile() && item.endsWith('.js')) {
        files.push(fullPath);
      }
    });
  } catch (err) {
    console.error(`Error reading ${dir}: ${err.message}`);
  }
  return files;
}

/**
 * Migrate a single API endpoint file to use withLogging
 */
function migrateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);

    // Skip already migrated files
    if (content.includes('withLogging') || content.includes('withMethodHandlers')) {
      return { status: 'skip', reason: 'already-migrated' };
    }

    // Remove old logger middleware instantiation
    content = content.replace(/const logger = loggerMiddleware\([^)]*\);\s*/g, '');

    // Remove middleware application calls
    content = content.replace(/await logger\(req,\s*res,\s*\(\)\s*=>\s*\{\}\);\s*/g, '');
    content = content.replace(/await corsHandler\(req,\s*res,\s*\(\)\s*=>\s*\{\}\);\s*/g, '');

    // Remove old imports
    content = content.replace(/import\s*\{\s*loggerMiddleware\s*\}[^;]*;\s*/g, '');

    // Add new imports
    const withLoggingImport = "import { withMethodHandlers } from '../../../lib/withLogging';\nimport { logError } from '../../../lib/logger';\n";

    if (!content.includes('withMethodHandlers')) {
      content = withLoggingImport + content;
    }

    // Replace console.error with logError
    content = content.replace(
      /console\.error\s*\(\s*['"`]([^'"`]*)['"` `,]*err\.message\s*\);/g,
      "logError(err, { endpoint: '$1' });"
    );

    // Save migrated file
    fs.writeFileSync(filePath, content, 'utf-8');
    return { status: 'migrated' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// Main execution
const apiFiles = findJsFiles(API_DIR).filter(f => {
  const baseName = path.basename(f);
  return baseName !== 'health.js' && !f.includes('node_modules');
});

console.log(`\n📋 Found ${apiFiles.length} API endpoint files\n`);

const results = { migrated: 0, skipped: 0, errors: 0, errorDetails: [] };

apiFiles.forEach(file => {
  const result = migrateFile(file);
  const relativePath = path.relative(API_DIR, file);

  if (result.status === 'migrated') {
    console.log(`  ✓ ${relativePath}`);
    results.migrated++;
  } else if (result.status === 'skip') {
    // console.log(`  ⊙ ${relativePath}`);
    results.skipped++;
  } else {
    console.log(`  ✗ ${relativePath} - ${result.message}`);
    results.errors++;
    results.errorDetails.push({ file: relativePath, error: result.message });
  }
});

console.log(`\n${'═'.repeat(60)}`);
console.log(`✓ Migrated:  ${results.migrated}`);
console.log(`⊙ Skipped:   ${results.skipped}`);
if (results.errors > 0) console.log(`✗ Errors:    ${results.errors}`);
console.log(`═`.repeat(60));

if (results.errors > 0) {
  console.log(`\nErrors detected:`);
  results.errorDetails.forEach(e => console.log(`  • ${e.file}: ${e.error}`));
}

console.log('\n✅ Batch migration complete!\n');
