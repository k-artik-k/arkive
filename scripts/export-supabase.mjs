#!/usr/bin/env node
/**
 * Export ALL tables, users, and post images from Supabase using Node's built-in fetch().
 * Zero external packages required.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
 *   $env:SUPABASE_SERVICE_KEY="eyJ..."
 *   node scripts/export-supabase.mjs
 *
 * Where to find those in Supabase Dashboard:
 *   Project Settings -> API -> Project URL & service_role (secret) key
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`
Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.

PowerShell example:
  $env:SUPABASE_URL="https://your-project.supabase.co"
  $env:SUPABASE_SERVICE_KEY="your-service-role-key"
  node scripts/export-supabase.mjs

Find both in Supabase Dashboard -> Project Settings -> API.
`);
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

async function fetchTable(table, orderCol = 'created_at') {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&order=${encodeURIComponent(orderCol)}.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 404 || text.includes('does not exist')) {
        console.log(`  - ${table}: skipped (not present)`);
        return [];
      }
      throw new Error(`Failed to fetch ${table} (${res.status}): ${text}`);
    }

    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`  ✓ ${table}: ${rows.length} rows`);
  return rows;
}

async function fetchAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers,
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`  ⚠ auth.users export warning (${res.status}): ${text}`);
      break;
    }
    const data = await res.json();
    const batch = data?.users || [];
    for (const u of batch) {
      users.push({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        user_metadata: u.user_metadata || {},
      });
    }
    if (batch.length < perPage) break;
    page += 1;
  }

  console.log(`  ✓ auth.users: ${users.length} rows`);
  return users;
}

async function listBucketPrefix(bucket, prefix = '') {
  const files = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) break;

    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        const nested = await listBucketPrefix(bucket, itemPath);
        files.push(...nested);
      } else {
        files.push({
          key: itemPath,
          mimeType: item.metadata?.mimetype || 'application/octet-stream',
          size: item.metadata?.size || 0,
        });
      }
    }

    if (items.length < limit) break;
    offset += limit;
  }

  return files;
}

async function exportImages() {
  const bucket = 'post-images';
  const entries = await listBucketPrefix(bucket);
  const downloaded = [];

  for (const entry of entries) {
    const encodedKey = entry.key.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${encodedKey}`, {
      headers,
    });
    if (!res.ok) {
      console.warn(`  ⚠ Could not download image ${entry.key} (${res.status})`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const localPath = join('supabase-export', 'images', entry.key);
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, buf);
    downloaded.push({
      key: entry.key,
      localPath,
      mimeType: res.headers.get('content-type') || entry.mimeType,
      size: buf.byteLength,
    });
  }

  console.log(`  ✓ storage (${bucket}): ${downloaded.length} files saved to supabase-export/images/`);
  return downloaded;
}

async function main() {
  console.log(`\nExporting Supabase project: ${SUPABASE_URL}\n`);

  const [users, profiles, tags, spaces, space_members, posts, post_tags] = await Promise.all([
    fetchAuthUsers(),
    fetchTable('profiles'),
    fetchTable('tags'),
    fetchTable('spaces'),
    fetchTable('space_members'),
    fetchTable('posts'),
    fetchTable('post_tags', 'post_id'),
  ]);

  const images = await exportImages();

  const payload = {
    version: 2,
    exported_at: new Date().toISOString(),
    source_supabase_url: SUPABASE_URL,
    users,
    profiles,
    tags,
    spaces,
    space_members,
    posts,
    post_tags,
    images,
  };

  writeFileSync('supabase-export.json', JSON.stringify(payload, null, 2));

  console.log('\nDone! Saved supabase-export.json');
  console.log('\nNext step:');
  console.log('  $env:MIGRATION_PASSWORD="ChooseATempPassword123"');
  console.log('  node scripts/import-to-d1.mjs');
}

main().catch((err) => {
  console.error('\nExport failed:', err.message);
  process.exit(1);
});
