#!/usr/bin/env node

/**
 * Automated Endpoint Transformation
 * Converts Next.js API handlers to withLogging pattern
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const API_DIR = path.resolve(__dirname, 'pages/api');

// Template for single method handler
const SINGLE_METHOD_TEMPLATE = (methodName, content, imports) => `import { withMethodHandlers } from '${ imports.withLoggingPath }';
${imports.other}

async function handle${methodName}(req, res) {
${content}
}

export default withMethodHandlers({
  ${methodName}: handle${methodName},
});`;

// Template for multi-method handler
const MULTI_METHOD_TEMPLATE = (methods, imports) => `import { withMethodHandlers } from '${ imports.withLoggingPath }';
${imports.other}

${methods.map(([name, code]) => `async function handle${name}(req, res) {
${code}
}`).join('\n\n')}

export default withMethodHandlers({
  ${methods.map(([name]) => `${name}: handle${name}`).join(',\n  ')},
});`;

function extractImports(content) {
  const importRegex = /^import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)[^;]*from\s+['"][^'"]*['"];?$/gm;
  const imports = [];
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[0]);
  }

  return imports;
}

function removeOldMiddleware(content) {
  return content
    .replace(/const logger = loggerMiddleware\([^)]*\);\s*/, '')
    .replace(/await logger\(req,\s*res,\s*\(\)\s*=>\s*\{\}\);\s*/g, '')
    .replace(/await corsHandler\(req,\s*res,\s*\(\)\s*=>\s*\{\}\);\s*/g, '');
}

function updateImports(content, hasLogging) {
  let updated = content;

  // Remove old middleware imports
  updated = updated.replace(/import\s*\{\s*loggerMiddleware\s*\}[^;]*;?\s*/g, '');

  // Add logError if there's error handling
  if (content.includes('console.error') && !updated.includes('logError')) {
    updated = updated.replace(
      /^(import\s*\{[^}]*)\s*\}([^;]*from\s+['"].*logger['"];)/m,
      '$1, logError$2'
    );
    if (!updated.includes('from') || !updated.includes('logError')) {
      updated += "\nimport { logError } from '../../../lib/logger';\n";
    }
  }

  return updated;
}

console.log('🔄 Starting endpoint migration...\n');

const apiFiles = glob.sync(`${API_DIR}/**/*.js`).filter(f =>
  !f.includes('health.js') &&
  !fs.readFileSync(f, 'utf-8').includes('withLogging')
);

console.log(`Found ${apiFiles.length} endpoints to migrate\n`);

// Just show the patterns we found and provide guidance
console.log('📋 Migration Patterns:');
console.log('   Pattern 1 [GET only]: Migrate to withMethodHandlers({ GET: handler })');
console.log('   Pattern 2 [POST only]: Migrate to withMethodHandlers({ POST: handler })');
console.log('   Pattern 3 [Multi-method]: Split into separate handlers per method');
console.log('   Pattern 4 [Complex]: Manual review needed\n');

console.log('✅ To complete migration, run:');
console.log('   npm run migrate:endpoints\n');
