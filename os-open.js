import path from 'node:path';
import { spawn } from 'node:child_process';

// [command, args] to reveal or open an absolute canonical path, optionally with an app.
export function commandFor(action, p, app, platform = process.platform) {
  if (platform === 'darwin') {
    if (action === 'reveal') return ['open', ['-R', p]];
    return ['open', app ? ['-a', app, p] : [p]];
  }
  if (platform === 'win32') {
    if (action === 'reveal') return ['explorer', [`/select,${p}`]];
    return app ? [app, [p]] : ['explorer.exe', [p]];
  }
  if (action === 'reveal') return ['xdg-open', [path.dirname(p)]];
  return app ? [app, [p]] : ['xdg-open', [p]];
}

export function runDetached([cmd, args]) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', (err) => console.error(`[bookshelf] ${cmd} failed: ${err.message}`));
  child.unref();
}
