#!/usr/bin/env node

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
// concurrently removed

const args = process.argv.slice(2);
const command = args[0];

// Helper to open a URL natively on the default browser
function openUrl(url) {
  const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${start} ${url}`);
}

// Helper to check if a port is free on both IPv4 and IPv6 loopbacks
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        // Double check on IPv6 localhost to ensure Vite can bind to it
        const v6Server = net.createServer();
        v6Server.once('error', () => resolve(false));
        v6Server.once('listening', () => {
          v6Server.close(() => resolve(true));
        });
        v6Server.listen(port, '::1');
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

// Helper to find the next available TCP port
async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await checkPort(port))) {
    port++;
  }
  return port;
}

// Helper to check if Docker is installed
function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// ANSI Colors
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  bold: "\x1b[1m"
};

if (command === 'start') {
  console.log(`${colors.cyan}[i] Checking system requirements...${colors.reset}`);

  if (!checkDocker()) {
    console.error(`\n${colors.red}${colors.bold}[x] Error: Docker is not installed or not running on your machine.${colors.reset}`);
    
    if (process.platform === 'win32') {
      console.log(`\n${colors.yellow}[!] WINDOWS DETECTED:${colors.reset}`);
      console.log('Please download and install Docker Desktop:');
      console.log(`${colors.cyan}[>] https://www.docker.com/products/docker-desktop/\n${colors.reset}`);
    } else if (process.platform === 'darwin') {
      console.log(`\n${colors.yellow}[!] MACOS DETECTED:${colors.reset}`);
      console.log('Please download and install Docker Desktop:');
      console.log(`${colors.cyan}[>] https://www.docker.com/products/docker-desktop/\n${colors.reset}`);
    } else {
      console.log(`\n${colors.yellow}[!] LINUX DETECTED:${colors.reset}`);
      console.log('Please install Docker using your package manager:');
      console.log(`${colors.cyan}[>] Run: curl -fsSL https://get.docker.com | sh\n${colors.reset}`);
    }
    process.exit(1);
  }

  console.log(`${colors.green}[v] Docker is running.${colors.reset}`);
  console.log(`${colors.magenta}🚀 Booting Torollo System Lab...${colors.reset}\n`);

  const backendPath = path.join(__dirname, '../backend');
  const frontendPath = path.join(__dirname, '../frontend');

  (async () => {
    try {
      const frontendPort = await findAvailablePort(23232);
      const backendPort = await findAvailablePort(frontendPort + 1);

      const envContent = `window.TOROLLO_BACKEND_PORT = ${backendPort};`;

      // Ensure directory structures exist before writing env.js
      const publicPath = path.join(frontendPath, 'public');
      if (fs.existsSync(publicPath)) {
        fs.writeFileSync(path.join(publicPath, 'env.js'), envContent);
      }

      const distPath = path.join(frontendPath, 'dist');
      if (fs.existsSync(distPath)) {
        fs.writeFileSync(path.join(distPath, 'env.js'), envContent);
      }

      const { spawn } = require('child_process');

      const backendProcess = spawn('node', [path.join(backendPath, 'dist/server.js')], {
        env: { ...process.env, PORT: backendPort },
        stdio: 'ignore'
      });

      const servePath = require.resolve('serve/build/main.js');
      const frontendProcess = spawn('node', [servePath, '-s', 'dist', '-l', frontendPort], {
        cwd: frontendPath,
        stdio: 'ignore'
      });

      console.log(`${colors.cyan}================================================${colors.reset}`);
      console.log(`${colors.green}${colors.bold}[*] Torollo System Lab is ready!${colors.reset}`);
      console.log(`${colors.cyan}[>] Access it here: ${colors.reset}${colors.bold}http://localhost:${frontendPort}${colors.reset}`);
      console.log(`${colors.cyan}================================================${colors.reset}\n`);

      // Automatically open browser tab
      setTimeout(() => {
        openUrl(`http://localhost:${frontendPort}`);
      }, 1200);

      // Clean shutdown on Ctrl+C (avoids logs printing after Windows batch prompt)
      process.on('SIGINT', () => {
        try {
          backendProcess.kill('SIGKILL');
          frontendProcess.kill('SIGKILL');
        } catch (e) {}
        process.exit(0);
      });

    } catch (err) {
      console.error('Failed to start Torollo:', err);
      process.exit(1);
    }
  })();

} else {
  console.log('Usage: torollo start');
  process.exit(0);
}
