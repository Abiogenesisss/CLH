'use strict';
(() => {
  try { document.documentElement.dataset.theme = localStorage.getItem('vault-theme-v1') || 'dark'; } catch {}
  const byId = id => document.getElementById(id);
  const form = byId('install-form'), input = byId('license-code'), button = byId('install-button');
  let configured = false, busy = false, polling;
  const error = message => { byId('install-error').textContent = message || ''; byId('install-error').hidden = !message; };
  function controls() { button.disabled = !configured || busy; input.disabled = busy; }
  function render(job) {
    if (!job) return;
    busy = job.state === 'installing'; controls();
    byId('install-progress').hidden = false;
    byId('progress-title').textContent = busy ? '正在安装' : job.state === 'ready' ? '模块已就绪' : '安装未完成';
    byId('module-count').textContent = `${job.completed} / ${job.total}`;
    byId('progress-detail').textContent = busy ? `正在处理：${job.current || '准备下载'}`
      : job.state === 'ready' ? '已授权的模块安装完成，可以进入收藏库。' : '已完成的模块会保留，重新提交授权码可继续安装。';
    const progress = byId('download-progress');
    progress.hidden = !busy;
    if (job.bytes > 0) { progress.max = job.bytes; progress.value = job.received; }
    else progress.removeAttribute('value');
    byId('installed-modules').replaceChildren(...job.modules.map(item => {
      const row = document.createElement('li'), link = document.createElement('a'), state = document.createElement('span');
      link.href = '/games/' + encodeURIComponent(item.id) + '/'; link.textContent = item.name;
      state.textContent = item.state === 'existing' ? '已安装 · 保留原有版本' : '安装完成';
      row.append(link, state); return row;
    }));
    byId('open-library').hidden = !job.completed;
    if (job.error) error(job.error);
  }
  async function status() {
    clearTimeout(polling);
    try {
      const response = await fetch('/api/modules', { cache: 'no-store' });
      if (!response.ok) throw new Error('本地服务连接失败，请刷新重试。');
      const state = await response.json(); configured = state.configured;
      byId('service-state').textContent = configured ? '准备就绪，输入授权码即可开始。' : '此版本尚未配置模块下载服务，请联系发行者。';
      render(state.job); controls();
    } catch (failure) { error(failure.message); }
    if (busy) polling = setTimeout(status, 800);
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !configured) return;
    busy = true; controls(); error('');
    byId('service-state').textContent = '正在验证授权…';
    try {
      const response = await fetch('/api/modules/install', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: input.value.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '授权验证失败，请重试。');
      input.value = ''; render(result); await status();
    } catch (failure) { busy = false; controls(); error(failure.message); byId('service-state').textContent = '可以检查授权码后重新提交。'; input.focus(); }
  });
  window.addEventListener('pagehide', () => clearTimeout(polling), { once: true });
  void status();
})();
