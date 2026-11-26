import {json, secureHeaders, session} from '../lib/auth.mjs';
import {getPhoto, readState} from '../lib/store.mjs';
export default async function handler(req, res) {
  secureHeaders(res);
  if (!session(req)) return json(res,401,{error:'请先输入访问码。'});
  if (req.method !== 'GET') return json(res,405,{error:'请求方式不支持。'});
  const id = new URL(req.url,'https://birthday.local').searchParams.get('id');
  if (!/^[a-f0-9-]{36}$/.test(id || '')) return json(res,404,{error:'照片不存在。'});
  try {
    const {data} = await readState();
    if (!data.photos.some(p=>p.id===id&&!p.deletedAt)) return json(res,404,{error:'照片已移到回收站。'});
    const result = await getPhoto(id);
    if (!result) return json(res,404,{error:'照片不存在。'});
    res.setHeader('Content-Type','image/jpeg');
    res.end(Buffer.from(await new Response(result.stream).arrayBuffer()));
  } catch { return json(res,503,{error:'照片暂时无法加载，请刷新重试。'}); }
}
