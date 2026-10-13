import path from 'node:path';
import { spawn, execFile } from 'node:child_process';

// [command, args] to reveal or open an absolute canonical path with its default app.
export function commandFor(action, p, platform = process.platform) {
  if (platform === 'darwin') return ['open', action === 'reveal' ? ['-R', p] : [p]];
  if (platform === 'win32') return action === 'reveal' ? ['explorer', [`/select,${p}`]] : ['explorer.exe', [p]];
  return ['xdg-open', [action === 'reveal' ? path.dirname(p) : p]];
}

export function runDetached([cmd, args]) {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', (err) => console.error(`[bookshelf] ${cmd} failed: ${err.message}`));
  child.unref();
}

// The file name reaches AppleScript as an argument, never as script text.
const CHOOSE_APP = ['-e', 'on run argv', '-e', 'POSIX path of (choose application with prompt ("Open " & item 1 of argv & " with"))', '-e', 'end run'];

// Shows the OS's own app chooser for p; on macOS the pick is then opened with `open -a`, and a cancel does nothing.
export function openWith(p, { platform = process.platform, exec = execFile, run = runDetached } = {}) {
  if (platform === 'win32') return run(['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', p]]);
  if (platform !== 'darwin') throw new Error('Open with is not supported on this platform.');
  exec('osascript', [...CHOOSE_APP, '--', path.basename(p)], (err, stdout) => {
    if (err) {
      if (!/-128/.test(err.message)) console.error(`[bookshelf] osascript failed: ${err.message}`);
      return;
    }
    const app = String(stdout).trim();
    if (app) run(['open', ['-a', app, p]]);
  });
}
