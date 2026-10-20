import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { MAX_PACKAGE_BYTES, type ModuleRelease } from './module-distribution.ts';

export const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const roots = new Set(['src', 'python', 'viewer', 'dist', 'seed']);
const excluded = new Set(['dev', 'test', 'tests', 'docs', '__pycache__', 'node_modules', 'story-ui', 'captures', 'cache', 'state', 'metadata', 'library']);
export function allowedModuleFile(file: string) {
  const parts = file.split('/');
  return parts.length > 0 && file.length <= 240
    && parts.every(part => part && part !== '.' && part !== '..' && !part.startsWith('.')
      && !/[<>:"\\|?*\x00-\x1f]/.test(part) && !/[ .]$/.test(part)
      && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part) && !excluded.has(part.toLowerCase()))
    && !/\.(har|log|pyc|tmp|pem|key)$/i.test(file)
    && (parts.length === 1 ? ['game.json', 'requirements.txt', 'LICENSE'].includes(file) : roots.has(parts[0]));
}
export function decodeModulePackage(bytes: Buffer, release: ModuleRelease): Map<string, Buffer> {
  if (bytes.length !== release.bytes || bytes.length > MAX_PACKAGE_BYTES
    || createHash('sha256').update(bytes).digest('hex') !== release.sha256) throw new Error('模块包校验失败，请重新下载。');
  const data = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED_BYTES }).toString('utf8'));
  if (data?.format !== 1 || data.id !== release.id || data.version !== release.version
    || !Array.isArray(data.files) || data.files.length > 4096) throw new Error('模块包格式或版本无效。');
  const files = new Map<string, Buffer>(), paths = new Set<string>();
  let size = 0;
  for (const item of data.files) {
    if (typeof item?.path !== 'string' || !allowedModuleFile(item.path) || paths.has(item.path.toLowerCase())
      || typeof item.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data)) {
      throw new Error('模块包包含无效路径或重复文件。');
    }
    const content = Buffer.from(item.data, 'base64');
    size += content.length;
    if (content.toString('base64') !== item.data || content.length > MAX_PACKAGE_BYTES || size > 96 * 1024 * 1024) throw new Error('模块文件超过大小限制。');
    files.set(item.path, content); paths.add(item.path.toLowerCase());
  }
  for (const file of files.keys()) {
    const parts = file.toLowerCase().split('/');
    for (let i = 1; i < parts.length; i++) if (paths.has(parts.slice(0, i).join('/'))) throw new Error('模块包的文件与目录冲突。');
  }
  for (const required of ['game.json', 'src/index.ts', 'dist/module.js', 'seed/catalog.json.gz']) {
    if (!files.has(required)) throw new Error('模块包缺少必要文件：' + required);
  }
  const game = JSON.parse(files.get('game.json').toString('utf8'));
  if (game.id !== release.id || game.name !== release.name || game.label !== release.label) throw new Error('模块身份与列表不一致。');
  return files;
}
