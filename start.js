import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 Starting SERC PCB Workspace...\n');

// Start Flask
console.log('📡 Starting Flask server...');
const flask = spawn('python', ['flask_server.py'], {
  stdio: 'inherit',
  cwd: __dirname,
});

// Start Vite
console.log('⚛️  Starting React dev server...\n');
const vite = spawn('npm', ['run', 'dev:vite'], {
  stdio: 'inherit',
  cwd: __dirname,
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down...');
  flask.kill();
  vite.kill();
  process.exit();
});
