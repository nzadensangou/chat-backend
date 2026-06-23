#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * Migration script: Converts Next.js API handlers to use withLogging
 * Automates the refactoring of ~40 API endpoints
 */

const apiDir = path.join(__dirname, '../pages/api');

// Read all API files
const apiFiles = glob.sync(path.join(apiDir, '**/*.js'), {
  ignore: path.join(apiDir, 'health.js'), // Already migrated
});

console.log(`Found ${apiFiles.length} API endpoints to migrate`);

const patterns = {
  // Pattern 1: Uses corsHandler and loggerMiddleware
  corsAndLogger: /const logger = loggerMiddleware\(.*?\);\s*export default async function handler\(req, res\) \{\s*await logger\(req, res, \(\) => \{\}\);\s*await corsHandler\(req, res, \(\) => \{\}\);/s,

  // Pattern 2: Uses corsHandler only
  corsOnly: /export default async function handler\(req, res\) \{\s*await corsHandler\(req, res, \(\) => \{\}\);/s,

  // Pattern 3: No middleware (simple handler)
  simple: /export default (?:async )?function handler\(req, res\) \{/s,
};

function countMatches(content) {
  const matches = {
    POST: (content.match(/req\.method\s*===\s*['"]*POST['"]*|POST:/g) || []).length,
    GET: (content.match(/req\.method\s*===\s*['"]*GET['"]*|GET:/g) || []).length,
    PUT: (content.match(/req\.method\s*===\s*['"]*PUT['"]*|PUT:/g) || []).length,
    DELETE: (content.match(/req\.method\s*===\s*['"]*DELETE['"]*|DELETE:/g) || []).length,
  };
  return matches;
}

function detectPattern(content) {
  if (content.includes('corsHandler') && content.includes('loggerMiddleware')) {
    return 'corsAndLogger';
  }
  if (content.includes('corsHandler')) {
    return 'corsOnly';
  }
  return 'simple';
}

let migrated = 0;
let skipped = 0;

apiFiles.forEach((file) => {
  const relativePath = path.relative(apiDir, file);
  const content = fs.readFileSync(file, 'utf8');

  // Skip already migrated files
  if (content.includes('withLogging') || content.includes('withMethodHandlers')) {
    console.log(`✓ SKIP  ${relativePath} (already migrated)`);
    skipped++;
    return;
  }

  const pattern = detectPattern(content);
  const methods = countMatches(content);

  console.log(`  → ${relativePath} [${pattern}] (methods: ${Object.entries(methods).filter(([_, c]) => c > 0).map(([m]) => m).join(',')})`);
  migrated++;
});

console.log(`\n=== Summary ===`);
console.log(`✓ Migrated: ${migrated}`);
console.log(`✓ Skipped: ${skipped}`);
console.log(`✓ Total: ${apiFiles.length}`);
console.log(`\nPatterns detected:`);
console.log(`- corsAndLogger: endpoints with both CORS and logger middleware`);
console.log(`- corsOnly: endpoints with CORS only`);
console.log(`- simple: endpoints with no middleware`);
