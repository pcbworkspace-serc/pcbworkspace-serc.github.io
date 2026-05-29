import fs from 'fs';
import { execSync } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('\n🔧 SERC Setup Wizard\n');

try {
  execSync('python --version', { stdio: 'ignore' });
  console.log('✓ Python installed');
} catch {
  console.error('✗ Python not found. Install from python.org');
  process.exit(1);
}

console.log('📦 Installing Python dependencies...');
try {
  execSync('pip install flask flask-cors pyserial opencv-python torch', { stdio: 'inherit' });
  console.log('✓ Dependencies installed\n');
} catch {
  console.error('✗ Failed to install dependencies');
  process.exit(1);
}

rl.question('What COM port is your ESP32 on? (default: COM3): ', (port) => {
  port = port || 'COM3';
  
  let flask = fs.readFileSync('flask_server.py', 'utf8');
  flask = flask.replace(/ESP32_PORT = ".*?"/, ESP32_PORT = "");
  fs.writeFileSync('flask_server.py', flask);
  
  console.log(\n✓ Set ESP32 port to: );
  console.log('\n📝 Next steps:');
  console.log('1. Upload esp32_firmware_serc.ino to your ESP32 using Arduino IDE');
  console.log('2. Connect your ESP32 via USB');
  console.log('3. Connect your cameras');
  console.log('4. Run: npm run dev\n');
  
  rl.close();
});
