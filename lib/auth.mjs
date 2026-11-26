import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';

const codes = JSON.parse(readFileSync(new URL('./access-config.json', import.meta.url)));
const lifetime = 30 * 86400;
const cookieName = 'birthday_session';
const attempts = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const sign = value => createHmac('sha256', process.env.BLOB_READ_WRITE_TOKEN || process.env.BIRTHDAY_TEST_SECRET || '').update(value).digest('base64url');

export function secureHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

export function json(res, status, body) {
  secureHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function session(req) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BIRTHDAY_TEST_SECRET) return null;
  const token = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!token || token.length > 1000) return null;
  const [payload, signature] = token.split('.');
  if (!equal(sign(payload), signature)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url'));
    return ['guest', 'owner'].includes(data.role) && data.exp > Date.now() ? data : null;
  } catch { return null; }
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  return !origin || origin === 'https://' + host || (process.env.NODE_ENV !== 'production' && origin === 'http://' + host);
}

export function login(req, res, code) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BIRTHDAY_TEST_SECRET) return json(res, 503, {error:'云端尚未连接，请联系制作者。'});
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0];
  const limit = attempts.get(ip) || {count:0, until:now + 60000};
  attempts.set(ip, limit);
  if (++limit.count > 8) return json(res, 429, {error:'尝试较多，请一分钟后再试。'});
  const digest = hash(typeof code === 'string' ? code.trim().slice(0, 200) : '');
  const role = equal(digest, codes.owner) ? 'owner' : equal(digest, codes.guest) ? 'guest' : null;
  if (!role) return json(res, 401, {error:'访问码不对，再检查一下吧。'});
  const payload = Buffer.from(JSON.stringify({role, exp:now + lifetime * 1000})).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieName}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${lifetime}${secure}`);
  return json(res, 200, {role});
}

export function logout(res) {
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  json(res, 200, {ok:true});
}
