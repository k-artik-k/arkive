#!/usr/bin/env node
/**
 * Reset or set a user's password in Cloudflare D1 (local or remote).
 *
 * Usage:
 *   node scripts/reset-password.mjs user@example.com MyNewPassword123 --remote
 *   node scripts/reset-password.mjs user@example.com MyNewPassword123 --local
 */

import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const crypto = webcrypto;
const [, , emailArg, newPassword, targetFlag = '--remote'] = process.argv;

if (!emailArg || !newPassword || !['--local', '--remote'].includes(targetFlag)) {
  console.error('Usage: node scripts/reset-password.mjs <email> <new-password> [--remote|--local]');
  process.exit(1);
}

if (newPassword.length < 6 || newPassword.length > 128) {
  console.error('Password must be between 6 and 128 characters.');
  process.exit(1);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `${Buffer.from(salt).toString('base64')}:${Buffer.from(derivedBits).toString('base64')}`;
}

async function main() {
  const email = emailArg.trim().toLowerCase();
  const hash = await hashPassword(newPassword);
  const tmpFile = '.tmp-reset-password.sql';
  writeFileSync(
    tmpFile,
    `UPDATE users SET password_hash = '${hash}' WHERE LOWER(email) = LOWER('${email.replace(/'/g, "''")}');\n`
  );

  try {
    const localWrangler = resolve('node_modules/wrangler/bin/wrangler.js');
    if (existsSync(localWrangler)) {
      execFileSync(process.execPath, [localWrangler, 'd1', 'execute', 'arkive-db', targetFlag, `--file=${tmpFile}`], {
        stdio: 'inherit',
      });
    } else {
      execFileSync('npx', ['wrangler', 'd1', 'execute', 'arkive-db', targetFlag, `--file=${tmpFile}`], {
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });
    }
    console.log(`\nPassword updated for ${email} (${targetFlag.slice(2)}).`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore cleanup failure
    }
  }
}

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
