import {json, sameOrigin, session} from '../lib/auth.mjs';
import {mutateState, publicState, putPhoto, readState} from '../lib/store.mjs';

const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export default async function handler(req, res) {
  const user = session(req);
  if (!user) return json(res, 401, {error:'请重新输入访问码。'});
  if (!sameOrigin(req)) return json(res, 403, {error:'请求来源不匹配。'});
  try {
    if (req.method === 'GET') return json(res, 200, publicState((await readState()).data, user.role));
    if (req.method !== 'POST') return json(res, 405, {error:'请求方式不支持。'});
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || JSON.stringify(body).length > 1600000) fail('内容太大，请缩小照片后重试。');
    if (body.action === 'photo.add') {
      if (!validId(body.id) || typeof body.src !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.src)) fail('照片格式不正确。');
      const bytes = Buffer.from(body.src.split(',')[1], 'base64');
      if (bytes.length > 1024 * 1024 || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) fail('请选择小于 1 MB 的压缩照片。');
      const current = (await readState()).data;
      if (current.photos.some(p => p.id === body.id)) return json(res, 200, publicState(current, user.role));
      if (current.photos.length >= 100) fail('相册暂存上限为 100 张，包含回收站照片。');
      try { await putPhoto(body.id, bytes); } catch (error) {
        if (!/already exists|already been uploaded/i.test(error.message)) throw error;
      }
    }
    const data = await mutateState(state => {
      switch (body.action) {
        case 'content.save': {
          if (user.role !== 'owner') fail('只有主人可以修改书信和语录。', 403);
          if (body.version !== state.contentVersion) fail('内容已在另一台设备更新。请先刷新，再保存修改。', 409);
          const content = body.content || {};
          if (!Array.isArray(content.quotes)) fail('语录格式不正确。');
          state.content = {name:text(content.name,40) || '冰激凌',message:text(content.message,500),quotes:content.quotes.map(q=>text(q,160)).filter(Boolean).slice(0,30),letter:text(content.letter,12000)};
          state.contentVersion++;
          break;
        }
        case 'progress.unlock':
          if (!['album','quotes','chat','heart','letter'].includes(body.level)) fail('关卡不存在。');
          if (user.role === 'guest' && !state.progress.includes(body.level)) state.progress.push(body.level);
          break;
        case 'photo.add':
          if (!state.photos.some(p=>p.id===body.id)) {
            if (state.photos.length >= 100) fail('相册已满。');
            state.photos.push({id:body.id,caption:text(body.caption,80)||'我们的某一天',createdAt:Date.now()});
          }
          break;
        case 'photo.caption':
        case 'photo.remove':
        case 'photo.restore': {
          const photo = state.photos.find(p=>p.id===body.id);
          if (!photo) fail('照片已不存在。',404);
          if (body.action === 'photo.caption') photo.caption = text(body.caption,80)||'我们的某一天';
          if (body.action === 'photo.remove') photo.deletedAt = Date.now();
          if (body.action === 'photo.restore') delete photo.deletedAt;
          break;
        }
        default: fail('操作不存在。');
      }
    });
    return json(res, 200, publicState(data, user.role));
  } catch (error) {
    return json(res, error.status || 503, {error:error.status ? error.message : '云端暂时无法保存，请稍后重试。'});
  }
}
