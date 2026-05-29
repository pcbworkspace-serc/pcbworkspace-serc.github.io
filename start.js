import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = platform() === 'win32';

console.log('🚀 Starting SERC PCB Workspace...\n');

// Start Flask
console.log('📡 Starting Flask server...');
const flask = spawn('python', ['flask_server.py'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true,
});

// Start Vite
console.log('⚛️  Starting React dev server...\n');
const vite = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev:vite'], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true,
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down...');
  flask.kill();
  vite.kill();
  process.exit();
});
