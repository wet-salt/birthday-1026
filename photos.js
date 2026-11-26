(() => {
  const maximum = 100;
  const $ = id => document.getElementById(id);
  let failed = [];
  let uploading = false;
  let editingPhoto = null;
  function capacity() {
    const data = window.BirthdayCloud.data;
    const active = data.photos.length;
    const removed = data.deletedPhotos.length;
    $('photo-capacity').textContent = `已保存 ${active} 张 · 最多 ${maximum} 张${removed ? `（回收站占用 ${removed} 张）` : ''}`;
  }
  async function resize(file) {
    if (file.size > 40 * 1024 * 1024) throw Error('原图大于 40 MB，请先缩小照片。');
    let image;
    try {
      image = await createImageBitmap(file);
    } catch {
      const url = URL.createObjectURL(file);
      try {
        image = new Image();
        image.src = url;
        await image.decode();
      } catch {
        throw Error(/heic|heif/i.test(file.type + file.name) ? '当前浏览器无法读取 HEIC，请在相册中导出为 JPG 后再上传。' : '浏览器无法读取这张照片，请转为 JPG 或 PNG 后重试。');
      } finally { URL.revokeObjectURL(url); }
    }
    try {
      const width = image.width || image.naturalWidth;
      const height = image.height || image.naturalHeight;
      if (!width || !height) throw Error('这张照片没有有效的尺寸。');
      let scale = Math.min(1, 1600 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      for (let attempt = 0; attempt < 6; attempt++) {
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(image,0,0,canvas.width,canvas.height);
        const result = canvas.toDataURL('image/jpeg', .78 - attempt * .06);
        if (result.length < 1250000) return result;
        scale *= .75;
      }
      throw Error('压缩后仍然较大，请缩小照片后重试。');
    } finally { image.close?.(); }
  }
  function showFailures() {
    const list = $('photo-upload-failures');
    list.replaceChildren();
    for (const entry of failed) {
      const item = document.createElement('li');
      item.textContent = `${entry.file.name} — ${entry.error}`;
      list.append(item);
    }
    $('photo-upload-retry').hidden = !failed.length;
  }
  async function upload(entries) {
    if (uploading || !entries.length) return;
    uploading = true;
    const input = $('photo-input');
    const label = document.querySelector('label[for="photo-input"]');
    input.disabled = true;
    $('photo-upload-retry').disabled = true;
    failed = [];
    let added = 0;
    try {
      for (const [index, entry] of entries.entries()) {
        label.textContent = `正在上传 ${index + 1} / ${entries.length}…`;
        $('photo-upload-status').textContent = `正在处理第 ${index + 1} / ${entries.length} 张，请等上传完成后再关闭页面。`;
        try {
          const data = window.BirthdayCloud.data;
          if (data.photos.length + data.deletedPhotos.length >= maximum) throw Error('相册已达到 100 张上限，包含回收站照片。');
          entry.src ||= await resize(entry.file);
          await window.BirthdayCloud.add(entry.src, entry.file.name.replace(/\.[^.]+$/,'').slice(0,80), entry.id);
          added++;
        } catch (error) {
          entry.error = error.message || '网络暂时无法连接，请重试。';
          failed.push(entry);
        }
        capacity();
      }
      $('photo-upload-status').textContent = `本次成功保存 ${added} 张${failed.length ? `，${failed.length} 张未保存，原因如下。` : '，另一台设备刷新即可看到。'}`;
      showFailures();
    } finally {
      input.value = '';
      input.disabled = false;
      label.textContent = '加入我们的照片 ＋';
      $('photo-upload-retry').disabled = false;
      uploading = false;
    }
  }
  window.BirthdayPhotos = {
    capacity,
    edit(photo) {
      editingPhoto = photo;
      $('photo-caption-input').value = photo.caption;
      $('photo-caption-status').textContent = '';
      $('photo-caption-dialog').showModal();
      $('photo-caption-input').focus();
    },
    install() {
      if (window.BirthdayCloud.offline) return;
      const input = $('photo-input');
      input.accept = 'image/*';
      input.onchange = event => upload([...event.target.files].map(file => ({file,id:crypto.randomUUID()})));
      $('photo-upload-retry').onclick = () => upload([...failed]);
      $('photo-caption-close').onclick = () => $('photo-caption-dialog').close();
      $('photo-caption-form').onsubmit = async event => {
        event.preventDefault();
        const photo = editingPhoto;
        const button = $('photo-caption-save');
        button.disabled = true;
        $('photo-caption-status').textContent = '正在保存这段回忆…';
        try {
          await window.BirthdayCloud.caption(photo.id, $('photo-caption-input').value);
          if (editingPhoto === photo) $('photo-caption-dialog').close();
        } catch (error) {
          $('photo-caption-status').textContent = error.message || '保存失败，文字还在，可以重试。';
        } finally { button.disabled = false; }
      };
      capacity();
    },
  };
})();
