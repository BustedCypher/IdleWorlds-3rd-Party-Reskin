import { spawnSync } from 'node:child_process';

const scriptArgs = process.argv.slice(2);
if (!scriptArgs.length) {
  console.error('Usage: node build-tools/run-python.mjs <script.py> [args...]');
  process.exit(2);
}

const candidates = process.platform === 'win32'
  ? [['python', []], ['py', ['-3']]]
  : [['python3', []], ['python', []]];

for (const [command, prefix] of candidates) {
  const result = spawnSync(command, [...prefix, ...scriptArgs], { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.error('Python 3 was not found. Install Python 3 and reopen the terminal.');
process.exit(127);
