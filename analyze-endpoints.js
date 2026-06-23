#!/usr/bin/env node

/**
 * Automated Migration Script: Convert API endpoints to use withLogging
 * Transforms Next.js API routes from old pattern to new withLogging pattern
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SKIP_FILES = ['health.js'];
const API_DIR = path.resolve(__dirname, 'pages/api');

// Read file and detect current pattern
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(API_DIR, filePath);

  if (content.includes('withLogging') || content.includes('withMethodHandlers')) {
    return { status: 'migrated', relativePath };
  }

  const hasCors = content.includes('corsHandler');
  const hasLogger = content.includes('loggerMiddleware');
  const isAsync = content.includes('async function handler');

  // Count HTTP methods
  const methods = {
    GET: content.match(/req\.method\s*===\s*['"]?GET['"]?/g) ? true : false,
    POST: content.match(/req\.method\s*===\s*['"]?POST['"]?/g) ? true : false,
    PUT: content.match(/req\.method\s*===\s*['"]?PUT['"]?/g) ? true : false,
    DELETE: content.match(/req\.method\s*===\s*['"]?DELETE['"]?/g) ? true : false,
  };

  const methodsUsed = Object.entries(methods).filter(([_, v]) => v).map(([k]) => k);

  return {
    status: 'needs-migration',
    relativePath,
    hasCors,
    hasLogger,
    isAsync,
    methods: methodsUsed,
    content
  };
}

// Recursively find all API files
function findApiFiles(dir = API_DIR) {
  let files = [];
  const items = fs.readdirSync(dir);

  items.forEach(item => {
    if (SKIP_FILES.includes(item)) return;

    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files = files.concat(findApiFiles(fullPath));
    } else if (item.endsWith('.js')) {
      files.push(fullPath);
    }
  });

  return files;
}

// Scan and report
const apiFiles = findApiFiles();
let stats = { migrated: 0, pending: 0, total: apiFiles.length };

console.log('\n📊 API Endpoint Migration Analysis');
console.log('═'.repeat(60));

const pendingFiles = [];

apiFiles.forEach(file => {
  const analysis = analyzeFile(file);

  if (analysis.status === 'migrated') {
    console.log(`  ✓ ${analysis.relativePath}`);
    stats.migrated++;
  } else {
    console.log(`  ⚠ ${analysis.relativePath}`);
    stats.pending++;
    pendingFiles.push(analysis);
  }
});

console.log('\n' + '═'.repeat(60));
console.log(`✓ Migrated: ${stats.migrated}/${stats.total}`);
console.log(`⚠ Pending:  ${stats.pending}/${stats.total}`);
console.log(`\n📝 Detailed breakdown:\n`);

// Group by method pattern
const byMethodCount = {};
pendingFiles.forEach(f => {
  const methodKey = f.methods.join('+');
  if (!byMethodCount[methodKey]) byMethodCount[methodKey] = [];
  byMethodCount[methodKey].push(f.relativePath);
});

Object.entries(byMethodCount).forEach(([methods, files]) => {
  console.log(`  [${methods}] - ${files.length} files`);
  files.slice(0, 3).forEach(f => console.log(`    • ${f}`));
  if (files.length > 3) console.log(`    ... and ${files.length - 3} more`);
});

console.log('\n💡 Next steps:');
console.log('   1. Review migration patterns');
console.log('   2. Create template generators');
console.log('   3. Run automated transformation');
console.log('   4. Test all endpoints\n');
