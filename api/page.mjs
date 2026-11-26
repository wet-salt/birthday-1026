import {readFile} from 'node:fs/promises';
import {json, secureHeaders, session} from '../lib/auth.mjs';
import {publicState, readState} from '../lib/store.mjs';
export default async function handler(req, res) {
  secureHeaders(res);
  if (!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'请求方式不支持。'});
  try {
    const user = session(req);
    let html;
    if (!user) html = await readFile(new URL('../private/gate.html',import.meta.url),'utf8');
    else {
      const data = publicState((await readState()).data,user.role);
      html = await readFile(new URL('../private/gift.html',import.meta.url),'utf8');
      html = html.replace('__BIRTHDAY_INITIAL__',() => JSON.stringify(data).replace(/</g,'\\u003c'));
    }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(req.method === 'HEAD' ? '' : html);
  } catch { return json(res,503,{error:'礼物暂时没能打开，请稍后刷新重试。'}); }
}
