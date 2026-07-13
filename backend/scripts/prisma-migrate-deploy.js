import { spawnSync } from 'node:child_process';
const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.error('npm_execpath is not available; this script must be run through npm.');
  process.exit(1);
}

const command = process.execPath;
const args = [npmExecPath, 'exec', '--', 'prisma', 'migrate', 'deploy'];

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: '1',
  },
  shell: false,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
