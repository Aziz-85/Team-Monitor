#!/usr/bin/env node
/**
 * Check that messages/en.json and messages/ar.json have identical flattened key sets.
 * Exit 0 if parity; exit 1 and print diff if not.
 * Usage: node scripts/check-translation-keys.js
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const enPath = path.join(root, 'messages', 'en.json');
const arPath = path.join(root, 'messages', 'ar.json');

function loadJson(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const en = loadJson(enPath);
const ar = loadJson(arPath);
const enKeys = new Set(flattenKeys(en));
const arKeys = new Set(flattenKeys(ar));

const missingInAr = [...enKeys].filter((k) => !arKeys.has(k)).sort();
const missingInEn = [...arKeys].filter((k) => !enKeys.has(k)).sort();

if (missingInAr.length === 0 && missingInEn.length === 0) {
  console.log('OK: en.json and ar.json have identical key sets.');
  process.exit(0);
}

console.error('Translation key parity check FAILED.');
if (missingInAr.length) {
  console.error('\nMissing in ar.json:', missingInAr.length);
  missingInAr.slice(0, 30).forEach((k) => console.error('  -', k));
  if (missingInAr.length > 30) console.error('  ... and', missingInAr.length - 30, 'more');
}
if (missingInEn.length) {
  console.error('\nMissing in en.json (orphan in ar.json):', missingInEn.length);
  missingInEn.slice(0, 30).forEach((k) => console.error('  -', k));
  if (missingInEn.length > 30) console.error('  ... and', missingInEn.length - 30, 'more');
}
process.exit(1);
