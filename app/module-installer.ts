import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { acquire, release } from './download-lock.ts';
import { decodeModulePackage } from './module-package.ts';
import { LICENSE_CODE, moduleServiceUrl, readModuleManifest, type ModuleRelease } from './module-distribution.ts';

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
async function readBounded(response: Response, limit: number, progress = (_size: number) => {}) {
  if (!response.body || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel(); throw new Error('模块响应超过大小限制。');
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) throw new Error('模块响应超过大小限制。');
      chunks.push(value); progress(size);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

export function createModuleInstaller({ gamesRoot, sourceFile = path.resolve(__dirname, '../module-source.json'), fetchRemote = fetch }: {
  gamesRoot: string; sourceFile?: string; fetchRemote?: typeof fetch;
}) {
  let job: any = null, starting = false, closed = false;
  const controller = new AbortController();
  function service() {
    try { return moduleServiceUrl(JSON.parse(fs.readFileSync(sourceFile, 'utf8')).url); }
    catch { throw fail('尚未配置有效的模块授权服务，请联系发行者。', 503); }
  }
  async function remote(origin: string, route: string, code: string, timeout: number) {
    let response: Response;
    try {
      response = await fetchRemote(origin + route, { headers: { authorization: 'Bearer ' + code },
        redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]) });
    } catch { throw fail('无法连接模块授权服务，请检查网络后重试。', 502); }
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) throw fail('授权码无效、已过期，或没有该模块的下载权限。', 403);
      if (response.status === 429) throw fail('请求过于频繁，请稍后重试。', 429);
      throw fail('模块服务暂时不可用，请稍后重试。', 502);
    }
    return response;
  }
  function snapshot() { return job ? structuredClone(job) : null; }
  return {
    status() {
      let configured = true; try { service(); } catch { configured = false; }
      return { configured, job: snapshot() };
    },
    async install(input: unknown) {
      if (closed) throw fail('本地服务已关闭。', 503);
      if (starting || job?.state === 'installing') throw fail('模块正在安装，请等待当前任务完成。', 409);
      if (typeof input !== 'string' || !LICENSE_CODE.test(input.trim())) throw fail('请输入完整的授权码。');
      const code = input.trim(), origin = service();
      starting = true;
      let token: string | null = null, lockFile: string;
      try {
        // Verify remotely before creating directories or accepting a job. Each
        // package download is separately authorized again by the Worker.
        const response = await remote(origin, '/v1/modules', code, 30_000);
        const modules = readModuleManifest(JSON.parse((await readBounded(response, 128 * 1024)).toString('utf8')));
        if (!modules.length) throw fail('此授权码没有可安装的模块。', 403);
        fs.mkdirSync(gamesRoot, { recursive: true });
        const canonicalRoot = fs.realpathSync(gamesRoot);
        lockFile = path.join(canonicalRoot, '.module-install.lock');
        token = acquire(lockFile);
        if (!token) throw fail('另一个进程正在安装模块，请稍后重试。', 409);
        job = { id: randomUUID(), state: 'installing', completed: 0, total: modules.length, received: 0, bytes: 0,
          current: null, modules: [], error: null };
        const currentJob = job, ownedToken = token;
        token = null;
        const run = async () => {
          try {
            for (const item of modules) {
              controller.signal.throwIfAborted();
              const target = path.join(canonicalRoot, item.id);
              currentJob.current = item.name; currentJob.received = 0; currentJob.bytes = item.bytes;
              if (fs.existsSync(target)) {
                // Existing installs may contain local edits. Never replace them.
                const stat = fs.lstatSync(target);
                if (!stat.isDirectory() || stat.isSymbolicLink() || !fs.existsSync(path.join(target, 'src/index.ts'))) throw new Error('目标位置已存在，无法安全安装：' + item.name);
                currentJob.modules.push({ id: item.id, name: item.name, state: 'existing' });
              } else {
                await installOne(item, target, canonicalRoot);
                currentJob.modules.push({ id: item.id, name: item.name, state: 'installed' });
              }
              currentJob.completed++;
            }
            currentJob.state = 'ready';
          } catch (error) {
            currentJob.state = 'failed';
            // Only our own messages are exposed; transport errors can contain
            // private URLs. No authorization code is persisted in job state.
            currentJob.error = error instanceof Error && !controller.signal.aborted ? error.message : '安装已中断，可以重新输入授权码继续。';
          } finally { release(lockFile, ownedToken); }
        };
        async function installOne(item: ModuleRelease, target: string, root: string) {
          const response = await remote(origin, '/v1/modules/' + item.id + '/' + item.sha256, code, 300_000);
          let bytes: Buffer;
          try { bytes = await readBounded(response, item.bytes, size => { currentJob.received = size; }); }
          catch { throw new Error('模块下载不完整，请重试：' + item.name); }
          const files = decodeModulePackage(bytes, item);
          controller.signal.throwIfAborted();
          // The staging directory lives on the same filesystem, outside the
          // module ID namespace. Only the final rename makes a module visible.
          const staging = fs.mkdtempSync(path.join(root, '.module-install-'));
          try {
            for (const [relative, data] of files) {
              const file = path.join(staging, relative);
              fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data, { flag: 'wx' });
            }
            if (fs.existsSync(target)) throw new Error('模块目录已出现，已停止覆盖：' + item.name);
            fs.renameSync(staging, target);
          } finally {
            if (path.dirname(staging) === root && path.basename(staging).startsWith('.module-install-')) fs.rmSync(staging, { recursive: true, force: true });
          }
        }
        void run();
        return snapshot();
      } finally { starting = false; if (token) release(lockFile, token); }
    },
    close() { closed = true; controller.abort(); },
  };
}
