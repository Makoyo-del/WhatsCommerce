const fs = require('fs');
const { spawnSync } = require('child_process');

const env = fs.readFileSync('.env.local', 'utf-8');
const lines = env.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

for (const line of lines) {
  const parts = line.split('=');
  const key = parts[0];
  const value = parts.slice(1).join('=');
  
  if (key === 'VERCEL_OIDC_TOKEN') continue;

  console.log(`Adding ${key}...`);
  // Use Vercel CLI to add it
  const child = spawnSync('npx.cmd', ['vercel', 'env', 'add', key, 'production'], {
    input: value,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (child.error) {
    console.error(`Failed to spawn: ${child.error}`);
  } else if (child.status !== 0) {
    if (child.stderr.includes('already exists')) {
      console.log(`  Already exists. Skipping.`);
    } else {
      console.error(`  Error: ${child.stderr}`);
    }
  } else {
    console.log(`  Done.`);
  }
}
