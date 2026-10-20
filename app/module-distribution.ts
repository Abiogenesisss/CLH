/** Wire format shared by the installer, packager and authorization Worker. */
export const MODULE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const LICENSE_CODE = /^clh_[A-Za-z0-9_-]{43}$/;
export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
export interface ModuleRelease {
  id: string;
  name: string;
  label: string;
  version: string;
  sha256: string;
  bytes: number;
}
export function validModuleId(id: unknown): id is string {
  return typeof id === 'string' && MODULE_ID.test(id) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(id);
}
export function readModuleManifest(value: any): ModuleRelease[] {
  if (value?.format !== 1 || !Array.isArray(value.modules) || value.modules.length > 100) throw new Error('模块列表格式无效。');
  const ids = new Set<string>();
  return value.modules.map((item: any) => {
    if (!validModuleId(item?.id) || ids.has(item.id)
      || ![item.name, item.label].every(text => typeof text === 'string' && text.trim() && text.length <= 200)
      || typeof item.version !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(item.version)
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
      || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_PACKAGE_BYTES) throw new Error('模块列表内容无效。');
    ids.add(item.id);
    return { id: item.id, name: item.name, label: item.label, version: item.version, sha256: item.sha256, bytes: item.bytes };
  });
}
export const modulePackagePath = (item: ModuleRelease) => `packages/${item.id}-${item.sha256}.clh.gz`;
export function moduleServiceUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('尚未配置模块授权服务，请联系发行者。');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('模块授权服务必须使用不含账号、路径或参数的 HTTPS 地址。');
  }
  return url.origin;
}
