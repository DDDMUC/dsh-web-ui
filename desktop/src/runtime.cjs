'use strict';

/**
 * Pure helpers for the desktop main process. This module must stay free of
 * the electron import so it can be unit-tested with plain node --test.
 */

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

/**
 * Loopback ports a plain `dsh web` install owns (its CLI defaults). The
 * desktop app always spawns its own separate host and never binds these, so
 * the desktop instance and the user's own instance run side by side.
 */
const RESERVED_PORTS = new Set([3080, 3081]);

/** Preferred loopback range for the desktop host: DESKTOP_PORT_BASE + SPAN. */
const DESKTOP_PORT_BASE = 3082;
const DESKTOP_PORT_SPAN = 100;

/** Marker file written into a profile directory this app seeded itself. */
const SEED_MARKER = '.dsh-desktop-seed.json';

/** Version stamp file produced by scripts/build-runtime.mjs. */
const RUNTIME_STAMP = 'VERSION.json';

/**
 * Resolve the on-disk locations of the bundled runtime payload.
 * @param {string} resourcesRoot - process.resourcesPath when packaged, else
 *   the desktop/resources directory in a development checkout.
 * @param {string} platform - process.platform.
 * @param {string} arch - process.arch.
 */
function resolveRuntimePaths(resourcesRoot, platform, arch, packaged = true) {
  const runtimeRoot = path.join(resourcesRoot, 'runtime');
  // Packaged builds map node-<os>-<arch> to runtime/node via extraResources;
  // a development checkout keeps the per-platform directory name in the same
  // electron-builder os spelling (mac/win) the staged layout uses.
  const runtimeOs = platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : platform;
  const nodeRoot = packaged ? path.join(runtimeRoot, 'node') : path.join(runtimeRoot, 'node-' + runtimeOs + '-' + arch);
  return {
    runtimeRoot,
    nodeBin: platform === 'win32'
      ? path.join(nodeRoot, 'node.exe')
      : path.join(nodeRoot, 'bin', 'node'),
    nodeHome: nodeRoot,
    hostBin: path.join(runtimeRoot, 'host', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    profileSeed: path.join(runtimeRoot, 'profile-web'),
    stampFile: path.join(runtimeRoot, RUNTIME_STAMP),
  };
}

/**
 * Resolve the DSH home the desktop app manages: an explicit DSH_HOME from the
 * environment wins, everything else falls back to ~/.dsh — the same lookup
 * order the dsh host itself applies.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} homedir
 */
function resolveDshHome(env, homedir) {
  const configured = env.DSH_HOME;
  if (configured === undefined || configured.trim() === '') return path.join(homedir, '.dsh');
  const trimmed = configured.trim();
  if (trimmed === '~') return homedir;
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return path.join(homedir, trimmed.slice(2));
  return path.resolve(trimmed);
}

/**
 * Construct the environment block for the spawned dsh host child process.
 * Prepends the bundled Node distribution's bin directory to PATH so anything
 * the host shells out to resolves against the bundled runtime.
 *
 * Normalizes PATH across platforms: on Windows, process.env frequently exposes 'Path'
 * rather than 'PATH'. Spreading process.env into a plain JS object preserves 'Path',
 * so assigning env.PATH directly would leave the existing system PATH under 'Path'
 * while env.PATH only contains nodeBinDir. In Windows process creation, this duplicate
 * or shadowed key causes spawned children (such as powershell.exe for DPAPI decryption)
 * to fail with ENOENT. We normalize all case variants of PATH into a single env.PATH.
 *
 * @param {string} home - resolved DSH_HOME.
 * @param {string} nodeHome - bundled node runtime directory.
 * @param {string} [platform] - process.platform override for testing.
 * @param {NodeJS.ProcessEnv} [baseEnv] - environment to derive from.
 * @returns {Record<string, string | undefined>}
 */
function childEnv(home, nodeHome, platform = process.platform, baseEnv = process.env) {
  const env = { ...baseEnv, DSH_HOME: home };
  const delimiter = platform === 'win32' ? ';' : ':';
  const nodeBinDir = platform === 'win32' ? nodeHome : path.posix.join(nodeHome, 'bin');

  let existingPath = '';
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'PATH') {
      if (!existingPath && typeof env[key] === 'string' && env[key] !== '') {
        existingPath = env[key];
      }
      delete env[key];
    }
  }

  env.PATH = nodeBinDir + (existingPath ? delimiter + existingPath : '');
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/**
 * Read a JSON stamp file; undefined when missing or unreadable.
 * @param {string} stampFile
 */
function readStampFile(stampFile) {
  try {
    return JSON.parse(fs.readFileSync(stampFile, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Decide how the live web profile relates to the bundled seed.
 * @param {string} profileDir - $DSH_HOME/profiles/web.
 * @param {string} stamp - current runtime stamp string.
 * @returns {'seed' | 'reseed' | 'leave'} - seed when missing, reseed when we
 *   seeded it before and the stamp moved, leave when it is user-managed.
 */
function profileAction(profileDir, stamp) {
  if (!fs.existsSync(path.join(profileDir, 'package.json'))) return 'seed';
  const marker = readStampFile(path.join(profileDir, SEED_MARKER));
  if (marker === undefined) return 'leave';
  return marker.stamp === stamp ? 'leave' : 'reseed';
}

/**
 * Copy the bundled seed profile into place. Only ever touches profiles this
 * app seeded itself; user-managed profiles are left untouched. On reseed the
 * user's patch layer and its backups survive: node_modules and the manifests
 * are replaced, cordis.patch.yml* files are kept.
 */
function applyProfileSeed(seedDir, profileDir, action, stamp, extra) {
  const keep = (name) => name.startsWith('cordis.patch.yml');
  if (action === 'reseed') {
    for (const name of ['node_modules', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml']) {
      fs.rmSync(path.join(profileDir, name), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(profileDir, { recursive: true });
  fs.cpSync(seedDir, profileDir, {
    recursive: true,
    dereference: true,
    filter: (source) => action !== 'reseed' || !keep(path.basename(source)),
  });
  const marker = { stamp, seededAt: new Date().toISOString(), ...extra };
  fs.writeFileSync(path.join(profileDir, SEED_MARKER), JSON.stringify(marker, null, 2) + '\n');
}

/**
 * Probe whether a dsh web GUI already answers at the given URL.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function probeGui(url, timeoutMs) {
  return new Promise((resolvePromise) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolvePromise(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolvePromise(false);
    });
    request.on('error', () => resolvePromise(false));
  });
}

/**
 * Ask the OS for a free loopback port.
 * @returns {Promise<number>}
 */
function findFreePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolvePromise(port));
    });
  });
}

/**
 * Bind-test one loopback port.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortFree(port) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once('error', () => resolvePromise(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolvePromise(true));
    });
  });
}

/**
 * Pick the loopback port for the desktop host: the dedicated range right
 * above the reserved pair first (a stable address across launches while it
 * has room), then an OS-assigned port. The user's own CLI defaults 3080/3081
 * are excluded by contract on both paths — the desktop host never takes them.
 * @returns {Promise<number>}
 */
async function findHostPort() {
  for (let port = DESKTOP_PORT_BASE; port < DESKTOP_PORT_BASE + DESKTOP_PORT_SPAN; port++) {
    if (await isPortFree(port)) return port;
  }
  for (;;) {
    const port = await findFreePort();
    if (!RESERVED_PORTS.has(port)) return port;
  }
}

/**
 * Wait until the spawned host serves the GUI, or fail when the host exits
 * first or the deadline passes.
 */
async function waitForGui(port, options) {
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + options.deadlineMs;
  for (;;) {
    if (!options.isAlive()) throw new Error('the dsh host process exited before the GUI became ready');
    if (await probeGui(url, 1500)) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${Math.round(options.deadlineMs / 1000)}s waiting for ${url}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
}

/** The host prints its tokenized GUI URL on this stdout line. */
const TOKEN_URL_PATTERN = /^dsh web: (\S+)$/;

/**
 * Extract the tokenized GUI URL from one host stdout line, if any.
 * @param {string} line
 * @returns {string | undefined}
 */
function parseTokenUrlLine(line) {
  const match = TOKEN_URL_PATTERN.exec(line);
  return match === null ? undefined : match[1];
}

/**
 * Parse a Node.js SHASUMS256.txt into a name -> hash map.
 * @param {string} text
 * @returns {Map<string, string>}
 */
function parseShasums(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (match !== null) map.set(match[2], match[1]);
  }
  return map;
}

module.exports = {
  RESERVED_PORTS,
  DESKTOP_PORT_BASE,
  DESKTOP_PORT_SPAN,
  SEED_MARKER,
  RUNTIME_STAMP,
  resolveRuntimePaths,
  resolveDshHome,
  childEnv,
  readStampFile,
  profileAction,
  applyProfileSeed,
  probeGui,
  findFreePort,
  isPortFree,
  findHostPort,
  waitForGui,
  parseTokenUrlLine,
  parseShasums,
};
