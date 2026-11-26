import {json, login, logout, sameOrigin, session} from '../lib/auth.mjs';
export default function handler(req, res) {
  if (req.method === 'GET') return json(res, 200, {role:session(req)?.role || null});
  if (req.method !== 'POST') return json(res, 405, {error:'请求方式不支持。'});
  if (!sameOrigin(req)) return json(res, 403, {error:'请求来源不匹配。'});
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return json(res,400,{error:'请求格式不正确。'}); }
  if (body?.action === 'logout') return logout(res);
  return login(req, res, body?.code);
}
