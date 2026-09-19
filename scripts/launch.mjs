#!/usr/bin/env node
/**
 * One command that gets the app on screen.
 *
 * Starting this project by hand is six steps in a fixed order, and getting any
 * of them wrong fails in a way that does not name the cause: Docker not
 * running, Supabase not started, a `.env` still pointing at the LAN address the
 * router handed out last week. That last one is the worst of them - the app
 * loads, the sign-in screen renders, and nothing works, with no error anywhere
 * that says why.
 *
 * So this does the whole sequence and re-derives the parts that go stale:
 *
 *   1. dependencies, if node_modules is missing
 *   2. Docker, started and waited for
 *   3. the Supabase stack (idempotent - a no-op when it is already up)
 *   4. .env rewritten from what the stack actually printed, including this
 *      machine's current LAN address
 *   5. Expo, on a port that is genuinely free
 *   6. the app opened in a phone-shaped window with no browser chrome
 *
 * No dependencies beyond Node itself. A launcher that needs installing before
 * it can install anything is not a launcher.
 *
 * Usage:
 *   node scripts/launch.mjs            web app window
 *   node scripts/launch.mjs --phone    QR code for Expo Go instead
 *   node scripts/launch.mjs --reset    rebuild the database from migrations first
 *   node scripts/launch.mjs --no-open  start everything, open nothing
 */

import { spawn, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const IS_WINDOWS = platform() === 'win32';

/**
 * Every npm-provided command here goes through a shell, as ONE string.
 *
 * Windows has no `npx` executable, only `npx.cmd`, and recent Node refuses to
 * spawn a .cmd without a shell. Passing an args array alongside `shell: true`
 * is what Node's DEP0190 warns about - arguments are concatenated rather than
 * escaped - so the command is written as a single string instead. Nothing in
 * any of these strings comes from user input; the only interpolated value is a
 * port number this script computed itself.
 */
const sh = (command, options = {}) =>
  spawnSync(command, { cwd: ROOT, shell: true, encoding: 'utf8', ...options });

const args = new Set(process.argv.slice(2));
const PHONE = args.has('--phone');
const RESET = args.has('--reset');
const OPEN = !args.has('--no-open') && !PHONE;

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
// Plain text with a step counter. Someone watching this wants to know which
// step is slow and which one failed, and a spinner tells them neither.

let step = 0;
const say = (message) => console.log(`\n[${++step}] ${message}`);
const detail = (message) => console.log(`    ${message}`);
const fail = (message, hint) => {
  console.error(`\n  ✗ ${message}`);
  if (hint !== undefined) console.error(`    ${hint}`);
  process.exit(1);
};

const run = (command, commandArgs, options = {}) =>
  spawnSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', ...options });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// 1. Dependencies
// ---------------------------------------------------------------------------

if (!existsSync(join(ROOT, 'node_modules'))) {
  say('Installing dependencies (first run only, this takes a few minutes)');
  const install = sh('npm install', { stdio: 'inherit', encoding: undefined });
  if (install.status !== 0) fail('npm install failed.');
}

// ---------------------------------------------------------------------------
// 2. Docker
// ---------------------------------------------------------------------------

const dockerReady = () => run('docker', ['info']).status === 0;

const startDockerDesktop = () => {
  if (IS_WINDOWS) {
    const candidates = [
      'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
      'C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe',
    ];
    const found = candidates.find((path) => existsSync(path));
    if (found === undefined) return false;
    spawn(found, [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (platform() === 'darwin') return run('open', ['-a', 'Docker']).status === 0;
  return false;
};

say('Checking Docker');
if (dockerReady()) {
  detail('already running');
} else {
  detail('not running - starting Docker Desktop');
  if (!startDockerDesktop()) {
    fail(
      'Docker is not running and could not be started automatically.',
      'Start Docker Desktop yourself, then run this again.',
    );
  }

  // Docker Desktop reports itself long before the daemon accepts connections.
  // Two minutes is generous; a cold start on a laptop can take one.
  const deadline = Date.now() + 120_000;
  process.stdout.write('    waiting for the Docker daemon');
  while (!dockerReady()) {
    if (Date.now() > deadline) {
      console.log();
      fail('Docker did not come up within two minutes.', 'Check Docker Desktop and try again.');
    }
    process.stdout.write('.');
    await sleep(3000);
  }
  console.log(' ready');
}

// ---------------------------------------------------------------------------
// 3. Supabase
// ---------------------------------------------------------------------------

say('Starting the local database');
// `supabase start` is idempotent: already-running containers make it a fast
// no-op, and a brand-new volume gets migrations and seeds applied for free -
// which is what makes a first run need no extra step.
const dbStart = sh('npx supabase start', { stdio: 'inherit', encoding: undefined });
if (dbStart.status !== 0) {
  fail(
    'The Supabase stack did not start.',
    'Run `npx supabase start` on its own to see what it said.',
  );
}

if (RESET) {
  say('Rebuilding the database from migrations');
  const reset = sh('npx supabase db reset', { stdio: 'inherit', encoding: undefined });
  if (reset.status !== 0) fail('The database reset failed.');
  detail('every account was deleted - sign up again');
}

// ---------------------------------------------------------------------------
// 4. .env, rewritten from what is actually running
// ---------------------------------------------------------------------------

say('Checking the app configuration');

const status = sh('npx supabase status -o json');
if (status.status !== 0) fail('Could not read the Supabase status.');

let stackInfo;
try {
  // The CLI prints a line of its own before the JSON on some versions, so the
  // object is found rather than assumed to start at character zero.
  const json = status.stdout.slice(status.stdout.indexOf('{'));
  stackInfo = JSON.parse(json);
} catch {
  fail('Could not parse the Supabase status output.');
}

const anonKey = stackInfo.ANON_KEY;
if (typeof anonKey !== 'string' || anonKey.length === 0) {
  fail('The Supabase status carried no anon key.');
}

/**
 * This machine's address on the local network.
 *
 * Not 127.0.0.1: on a phone running Expo Go, localhost means the phone, and
 * the app would fail to reach the database with no error that explains it.
 *
 * Asking the OS which address it would route from is the only method that gets
 * this right. Enumerating adapters does not: this machine has a WSL virtual
 * switch on 172.17.144.1 alongside Wi-Fi on 192.168.0.8, both private, both
 * non-internal, and picking the wrong one produces an app that loads and then
 * silently cannot reach anything. A connected UDP socket sends no packets - it
 * only asks the routing table - so this costs nothing and needs no network.
 */
const routedAddress = () =>
  new Promise((resolve) => {
    const socket = createSocket('udp4');
    const done = (value) => {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
      resolve(value);
    };
    socket.once('error', () => done(null));
    try {
      // A public address that is never contacted. connect() on a UDP socket
      // just fixes the peer, which makes the kernel choose a source address.
      socket.connect(53, '8.8.8.8', () => {
        try {
          done(socket.address().address);
        } catch {
          done(null);
        }
      });
    } catch {
      done(null);
    }
    setTimeout(() => done(null), 1500);
  });

/** Ranked fallback for a machine with no route at all: real networks before
 *  the ranges virtualisation tends to claim. */
const enumeratedAddress = () => {
  const rank = (ip) => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    return 2; // 172.16-31 - where Docker and WSL live
  };
  const isPrivate = (ip) =>
    ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && isPrivate(address.address)) {
        candidates.push({ name, ip: address.address });
      }
    }
  }
  candidates.sort((a, b) => rank(a.ip) - rank(b.ip) || a.ip.localeCompare(b.ip));
  return candidates[0]?.ip ?? '127.0.0.1';
};

const lanAddress = async () => (await routedAddress()) ?? enumeratedAddress();

const host = await lanAddress();
const supabaseUrl = `http://${host}:54321`;

const ENV_PATH = join(ROOT, '.env');
const HEADER = [
  '# Written by scripts/launch.mjs. Safe to edit - the launcher only rewrites',
  '# EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, and leaves',
  '# every other line alone.',
  '#',
  '# The host is this machine on the LAN, not 127.0.0.1: on a phone running',
  '# Expo Go, localhost means the phone.',
].join('\n');

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';

/** Replaces a key in place, or appends it. Other keys are never touched - a
 *  launcher that eats a hand-added variable is worse than one that does
 *  nothing. */
const upsert = (text, key, value) => {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
};

let next =
  existing.trim().length === 0 ? `${HEADER}\n\nEXPO_PUBLIC_APP_ENV=development\n` : existing;
next = upsert(next, 'EXPO_PUBLIC_SUPABASE_URL', supabaseUrl);
next = upsert(next, 'EXPO_PUBLIC_SUPABASE_ANON_KEY', anonKey);

if (next !== existing) {
  writeFileSync(ENV_PATH, next, 'utf8');
  detail(`.env updated - database at ${supabaseUrl}`);
} else {
  detail(`already correct - database at ${supabaseUrl}`);
}

// ---------------------------------------------------------------------------
// 5. Expo
// ---------------------------------------------------------------------------

const portFree = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });

let port = 8081;
while (!(await portFree(port))) {
  port += 1;
  if (port > 8100) fail('No free port between 8081 and 8100.');
}

const url = `http://localhost:${port}`;

say(PHONE ? 'Starting Expo for your phone' : 'Starting the app');
if (PHONE) {
  detail('Scan the QR code below with Expo Go. Keep the phone on the same Wi-Fi.');
} else {
  detail(`${url} - this window keeps it running, close it to stop`);
}

const expo = spawn(`npx expo start${PHONE ? '' : ' --web'} --port ${port}`, {
  cwd: ROOT,
  shell: true,
  stdio: 'inherit',
});

expo.on('exit', (code) => process.exit(code ?? 0));
// Ctrl+C reaches both processes already; this makes closing the window do the
// same thing rather than orphaning Metro.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    expo.kill(signal);
  });
}

// ---------------------------------------------------------------------------
// 6. Open it
// ---------------------------------------------------------------------------

/** Chrome and Edge both take `--app=`, which opens a window with no address
 *  bar, no tabs and its own taskbar entry. That is the difference between
 *  "a localhost tab" and something that reads as an application. */
const appModeBrowser = () => {
  if (!IS_WINDOWS) return null;
  const candidates = [
    `${process.env['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  return (
    candidates.find((path) => path.includes('undefined') === false && existsSync(path)) ?? null
  );
};

const openApp = () => {
  const browser = appModeBrowser();
  if (browser !== null) {
    // Phone-shaped, because that is what this app is. A mobile layout stretched
    // across a desktop monitor reads as broken rather than as responsive.
    spawn(browser, [`--app=${url}`, '--window-size=430,900'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }
  if (IS_WINDOWS)
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  else if (platform() === 'darwin')
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
};

// Opened only once the bundler answers. Opening earlier shows a connection
// error, which reads as a broken app rather than as one still starting - and
// the first web bundle genuinely takes a while.
const waitThenOpen = async () => {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        openApp();
        return;
      }
    } catch {
      // Not up yet. Metro takes its time on the first bundle after a change.
    }
    await sleep(2000);
  }
  console.log(`\n    Still building. Open ${url} yourself when it finishes.`);
};

if (OPEN) void waitThenOpen();
else
  console.log(`
    Open ${url} when you want to look at it.`);
