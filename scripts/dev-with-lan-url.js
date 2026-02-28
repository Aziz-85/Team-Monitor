#!/usr/bin/env node
/**
 * Runs Next.js dev server and prints the LAN URL so you can open the app
 * from another device on the same network (e.g. phone/tablet).
 * Usage: PORT=3001 node scripts/dev-with-lan-url.js
 *    or: PORT=3001 npm run dev
 */

const { spawn } = require('child_process');
const os = require('os');

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const port = process.argv[2] || process.env.PORT || 3000;
const lanIP = getLocalIP();

console.log('');
console.log('  ▲ Next.js dev server');
if (lanIP) {
  console.log('  - Local:   http://localhost:' + port);
  console.log('  - Network: http://' + lanIP + ':' + port + '  (use this from other devices on your Wi‑Fi)');
} else {
  console.log('  - Local:   http://localhost:' + port);
  console.log('  - Network: http://0.0.0.0:' + port);
}
console.log('');

const child = spawn(
  'npx',
  ['next', 'dev', '--hostname', '0.0.0.0', '-p', String(port)],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: String(port) },
  }
);

child.on('exit', (code) => process.exit(code ?? 0));
