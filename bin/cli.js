#!/usr/bin/env node

const { execSync, exec } = require('child_process');
const path = require('path');
const concurrently = require('concurrently');

const args = process.argv.slice(2);
const command = args[0];

// Helper to open a URL natively on the default browser
function openUrl(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${start} ${url}`);
}

// 1. Helper to check if Docker is installed
function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

if (command === 'start') {
  console.log('🔍 Checking system requirements...');

  if (!checkDocker()) {
    console.error('\n❌ Error: Docker is not installed or not running on your machine.');
    
    if (process.platform === 'win32') {
      console.log('\n👉 WINDOWS DETECTED:');
      console.log('Please download and install Docker Desktop:');
      console.log('🔗 https://www.docker.com/products/docker-desktop/\n');
    } else if (process.platform === 'darwin') {
      console.log('\n👉 MACOS DETECTED:');
      console.log('Please download and install Docker Desktop:');
      console.log('🔗 https://www.docker.com/products/docker-desktop/\n');
    } else {
      console.log('\n👉 LINUX DETECTED:');
      console.log('Please install Docker using your package manager:');
      console.log('💻 Run: curl -fsSL https://get.docker.com | sh\n');
    }
    process.exit(1);
  }

  console.log('✅ Docker is running.');
  console.log('🚀 Booting Torolo System Lab...\n');

  const backendPath = path.join(__dirname, '../backend');
  const frontendPath = path.join(__dirname, '../frontend');

  const { result } = concurrently(
    [
      { 
        command: `node ${path.join(backendPath, 'dist/server.js')}`, 
        name: 'backend', 
        prefixColor: 'blue' 
      },
      { 
        command: `npx vite preview --port 23232`, 
        name: 'frontend', 
        cwd: frontendPath,
        prefixColor: 'green' 
      }
    ],
    {
      prefix: 'name',
      killOthers: ['failure', 'success'],
      silent: true // Hides verbose startup logs so output is clean
    }
  );

  console.log('================================================');
  console.log('🎉 Torolo System Lab is ready!');
  console.log('🔗 Access it here: http://localhost:23232');
  console.log('================================================\n');

  // Automatically open browser tab
  setTimeout(() => {
    openUrl('http://localhost:23232');
  }, 1000);

  result.catch((err) => {
    console.error('Processes terminated:', err);
    process.exit(1);
  });

} else {
  console.log('Usage: torolo start');
  process.exit(0);
}
