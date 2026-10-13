import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const execute = (file, args, options = {}) => new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
        reject(new Error('Command aborted'));
        return;
    }
    let stopped;
    let timer;
    let stdout = '', stderr = '';
    let finished = false;
    const child = spawn(file, [...args], { cwd: options.cwd, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (code, signal) => {
        if (finished)
            return;
        finished = true;
        if (timer)
            clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        if (stopped)
            reject(new Error(stopped));
        // Node's error.message includes the complete command arguments. Never expose it.
        else if (code !== 0) {
            const detail = stderr.trim().slice(0, 4000).replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[redacted]@').replace(/(bearer\s+)\S+/gi, '$1[redacted]').replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]');
            reject(new Error(`${file} failed (${code ?? signal ?? 'unknown'}): ${detail || 'no diagnostic output'}`));
        }
        else
            resolve(stdout);
    };
    const stop = (reason) => {
        if (stopped || finished)
            return;
        stopped = reason;
        if (process.platform === 'win32' && child.pid) {
            // Kill descendants before the parent disappears; tests/reviewers can spawn
            // their own processes. No user-controlled text enters taskkill arguments.
            execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, timeout: 10_000 }, () => { child.kill(); });
        }
        else {
            try {
                if (child.pid)
                    process.kill(-child.pid, 'SIGKILL');
                else
                    child.kill();
            }
            catch {
                child.kill();
            }
        }
    };
    const abort = () => stop('Command aborted');
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const capture = (chunk, isError) => {
        if (stdout.length + stderr.length + chunk.length > 32 * 1024 * 1024) {
            stop('Command output exceeded 32 MiB');
            return;
        }
        if (isError)
            stderr += chunk;
        else
            stdout += chunk;
    };
    child.stdout.on('data', (chunk) => capture(chunk, false));
    child.stderr.on('data', (chunk) => capture(chunk, true));
    child.on('error', (error) => finish(error.code ?? 'spawn error'));
    child.on('close', finish);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted)
        abort();
    const timeout = options.timeoutMs ?? 120_000;
    if (timeout > 0)
        timer = setTimeout(() => stop(`Command timed out after ${timeout}ms`), timeout);
});
/** Never run ticket/branch text through a shell, including Windows az.cmd. */
export const runCommand = async (file, args, options) => {
    if (process.platform === 'win32' && file === 'ocr') {
        const matches = (await execute('where.exe', ['ocr'], options)).trim().split(/\r?\n/);
        for (const path of matches) {
            if (/\.exe$/i.test(path))
                return execute(path, args, options);
            const script = join(dirname(path), 'node_modules', '@alibaba-group', 'open-code-review', 'bin', 'ocr.js');
            try {
                await access(script);
            }
            catch {
                continue;
            }
            return execute(process.execPath, [script, ...args], options);
        }
        throw new Error('Open Code Review npm entry point not found; install @alibaba-group/open-code-review');
    }
    if (process.platform === 'win32' && file === 'az') {
        const matches = (await execute('where.exe', ['az'], options)).trim().split(/\r?\n/);
        for (const path of matches) {
            if (/\.exe$/i.test(path))
                return execute(path, args, options);
            for (const python of [join(dirname(path), '..', 'python.exe'), join(dirname(path), 'python.exe')]) {
                try {
                    await access(python);
                }
                catch {
                    continue;
                }
                return execute(python, ['-IB', '-m', 'azure.cli', ...args], options);
            }
        }
        throw new Error('Azure CLI Python runtime not found; install the official Azure CLI for Windows');
    }
    return execute(file, args, options);
};
