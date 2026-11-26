(() => {
  const initial = window.BIRTHDAY_INITIAL;
  const offline = document.getElementById('gift-data').hasAttribute('data-exported');
  let latest = initial;
  let busy = false;
  let serial = Promise.resolve();
  const $ = id => document.getElementById(id);
  function status(message) { const element = $('cloud-status'); if (element) element.textContent = message; }
  async function request(body) {
    const response = await fetch('/api/sync', {method:body ? 'POST' : 'GET', headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined});
    if (response.status === 401) { location.reload(); throw Error('请重新输入访问码。'); }
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '同步失败，请重试。');
    return data;
  }
  function apply(data) {
    latest = data;
    window.birthdayContent?.apply(data);
    window.birthdayAdventure?.applyCloud(data.progress, data.role === 'owner');
    window.birthdayLetter?.applyCloud(data.progress.includes('letter'), data.role === 'owner');
    renderTrash();
  }
  function mutate(body) {
    const task = serial.then(async () => {
      busy = true;
      status('正在保存…');
      try {
        const data = await request(body);
        apply(data);
        status('已保存到云端 · 另一台设备刷新即可看到');
        return data;
      } catch (error) { status(error.message); throw error; }
      finally { busy = false; }
    });
    serial = task.catch(() => {});
    return task;
  }
  async function refresh() {
    if (busy) return;
    status('正在同步…');
    try { apply(await request()); status('已是最新内容'); }
    catch (error) { status(error.message); }
  }
  function renderTrash() {
    const root = $('cloud-trash');
    if (!root) return;
    root.replaceChildren();
    for (const photo of latest.deletedPhotos || []) {
      const row = document.createElement('div');
      const label = document.createElement('span');
      label.textContent = photo.caption;
      const restore = document.createElement('button');
      restore.type = 'button'; restore.className = 'text-button'; restore.textContent = '恢复照片';
      restore.onclick = async () => { restore.disabled = true; try { await mutate({action:'photo.restore',id:photo.id}); } catch { restore.disabled = false; } };
      row.append(label,restore); root.append(row);
    }
    $('cloud-trash-details').hidden = !latest.deletedPhotos?.length;
  }
  window.BirthdayCloud = {
    get data() { return latest; },
    async saveContent(content) {
      try { await mutate({action:'content.save',content,version:latest.contentVersion}); return true; }
      catch { return false; }
    },
    async unlock(level) {
      if (latest.role === 'owner' || latest.progress.includes(level)) return;
      try { await mutate({action:'progress.unlock',level}); }
      catch (error) {
        status('通关成功，但进度尚未同步。联网后点“重试同步”。');
        const retry = $('cloud-retry'); retry.hidden = false;
        retry.onclick = async () => { retry.disabled = true; await window.BirthdayCloud.unlock(level); retry.disabled = false; if (latest.progress.includes(level)) retry.hidden = true; };
      }
    },
    caption:async (id,caption) => mutate({action:'photo.caption',id,caption}),
    remove:async id => mutate({action:'photo.remove',id}),
    add:async (src,caption) => mutate({action:'photo.add',id:crypto.randomUUID(),src,caption}),
    offline,
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (offline) { $('cloud-bar')?.remove(); return; }
    $('cloud-role').textContent = latest.role === 'owner' ? '主人预览 · 全部页面可查看' : '冰激凌的生日探险';
    $('edit-open').hidden = latest.role !== 'owner';
    $('cloud-practice').hidden = latest.role !== 'owner';
    $('cloud-practice').onclick = () => {
      const dialog = $('cloud-practice-dialog');
      dialog.showModal();
    };
    $('cloud-practice-close').onclick = () => $('cloud-practice-dialog').close();
    for (const button of document.querySelectorAll('[data-practice]')) button.onclick = () => {
      $('cloud-practice-dialog').close();
      window.birthdayAdventure.open(button.dataset.practice);
    };
    $('cloud-refresh').onclick = refresh;
    $('cloud-logout').onclick = async () => { await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})}); location.reload(); };
    renderTrash();
  }, {once:true});
})();
