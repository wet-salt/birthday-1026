import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('./', import.meta.url);
await mkdir(new URL('private',root),{recursive:true});
await mkdir(new URL('public',root),{recursive:true});
// The prepared template travels with the deployment, so builds do not need the old workspace.
const source = await readFile(new URL('private/source.html',root),'utf8');
const cloud = await readFile(new URL('cloud.js',root),'utf8');
const photos = await readFile(new URL('photos.js',root),'utf8');
const replace = (input, from, to) => { if (!input.includes(from)) throw Error('Template changed: ' + from.slice(0,65)); return input.replace(from,()=>to); };
let html = source;
html = html.replace(/<script\b[^>]*>window\.GIFT_BUNDLE=[^]*?<\/script>/,'');
html = html.replace(/(<script id="gift-data"[^>]*>)[^]*?(<\/script>)/,'$1null$2');
const match = [...html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/gi)].find(m=>m[2].includes('const API_BASE='));
let app = match[2];
app = replace(app,'const API_BASE="https://icecream-1026-miline.vercel.app";','const API_BASE="";');
app = replace(app,"async function save(){if(!db)","async function save(){if(!window.BirthdayCloud.offline)return window.BirthdayCloud.saveContent(state);if(!db)");
app = replace(app,"state.photos.some(p=>p.sample)?'风景样片 · 加入你们的照片后，故事就从这里开始。':",'');
app = replace(app,"p.caption=value.trim().slice(0,80)||'我们的某一天';renderPhotos();await save();", "if(!window.BirthdayCloud.offline){try{await window.BirthdayCloud.caption(p.id,value);}catch(error){toast(error.message);}return;}p.caption=value.trim().slice(0,80)||'我们的某一天';renderPhotos();await save();");
app = replace(app,'edit.onclick=async()=>{', 'edit.onclick=async()=>{if(!window.BirthdayCloud.offline){window.BirthdayPhotos.edit(p);return;}');
app = replace(app,'state.photos.splice(i,1);renderPhotos();await save();',"if(!window.BirthdayCloud.offline){try{await window.BirthdayCloud.remove(p.id);}catch(error){toast(error.message);}return;}state.photos.splice(i,1);renderPhotos();await save();");
app = replace(app,"$('#edit-open').onclick=()=>{", "$('#edit-open').onclick=()=>{if(!window.BirthdayCloud.offline&&window.BirthdayCloud.data.role!=='owner')return;window.BirthdayCloud.beginEdit();");
app = replace(app,"ok?'已保存在这台设备。下载纪念册可带走这些内容。':'已修改。请下载纪念册保存这些内容。'", "ok?'已保存，另一台设备刷新即可看到。':'尚未保存到云端。请查看页面同步提示后重试。'");
app = replace(app,"return canvas.toDataURL('image/jpeg',.84);", "let result=canvas.toDataURL('image/jpeg',.78);if(result.length>1300000){const smaller=document.createElement('canvas');smaller.width=Math.round(canvas.width*.65);smaller.height=Math.round(canvas.height*.65);smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);result=smaller.toDataURL('image/jpeg',.65);}return result;");
app = replace(app,'length>=24','length>=100');
app = replace(app,'相册最多保存 24 张照片。','相册暂存上限为 100 张。');
app = replace(app,'state.photos.push({src,caption:',"if(!window.BirthdayCloud.offline){await window.BirthdayCloud.add(src,file.name.replace(/\\.[^.]+$/,'').slice(0,80));added++;continue;}state.photos.push({src,caption:");
app = replace(app,'renderPhotos();await save();if(added)',"renderPhotos();if(window.BirthdayCloud.offline)await save();if(added)");
const initStart = app.indexOf(' async function init(){');
const initEnd = app.indexOf('render();updateHeart();checkChat();',initStart);
if (initStart < 0 || initEnd < 0) throw Error('Missing initialization');
app = app.slice(0,initStart) + ` window.birthdayContent={apply(data){state={...state,...data};render();}};
 async function init(){if(!window.BirthdayCloud.offline){state={...defaults,...window.BirthdayCloud.data};}else{try{db=await openDB();}catch{}}` + app.slice(initEnd);
html = html.replace(match[0],()=>`<script>${cloud.replace(/<\/script/gi,'<\\/script')}</script><script>${photos.replace(/<\/script/gi,'<\\/script')}</script><script>${app.replace(/<\/script/gi,'<\\/script')}</script><script>document.addEventListener('DOMContentLoaded',()=>window.BirthdayPhotos.install(),{once:true});</script>`);

const adventureMatch = html.match(/<script id="adv-script">([^]*?)<\/script>/);
let adventure = adventureMatch[1];
adventure = replace(adventure,"const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');","const saved = window.BirthdayCloud.offline ? JSON.parse(localStorage.getItem(storageKey) || '[]') : window.BirthdayCloud.data.progress;");
adventure = replace(adventure,'  let timer;',"  const owner = !window.BirthdayCloud.offline && window.BirthdayCloud.data.role === 'owner';\n  if(owner)unlocked=new Set(Object.keys(levels));\n  let timer;");
adventure = replace(adventure,'    unlocked.add(id);',"    unlocked.add(id);\n    if(!window.BirthdayCloud.offline)window.BirthdayCloud.unlock(id);");
adventure = replace(adventure,'try { localStorage.setItem(storageKey, JSON.stringify([...unlocked])); }', 'try { if(window.BirthdayCloud.offline)localStorage.setItem(storageKey, JSON.stringify([...unlocked])); }');
adventure = replace(adventure,'window.birthdayAdventure = {isLocked:',"window.birthdayAdventure = {applyCloud(progress,isOwner){const values=isOwner?Object.keys(levels):progress.filter(id=>Object.hasOwn(levels,id));for(const id of values)unlocked.add(id);refresh();},isLocked:");
html = html.replace(adventureMatch[0],()=>`<script id="adv-script">${adventure}</script>`);
const letterMatch = html.match(/<script id="letter-script">([^]*?)<\/script>/);
let letter = letterMatch[1];
letter = replace(letter,"unlocked = localStorage.getItem(storageKey) === 'yes';","unlocked = window.BirthdayCloud.offline ? localStorage.getItem(storageKey) === 'yes' : window.BirthdayCloud.data.role === 'owner' || window.BirthdayCloud.data.progress.includes('letter');");
letter = replace(letter,'    unlocked = true;',"    unlocked = true;\n    if(!window.BirthdayCloud.offline)window.BirthdayCloud.unlock('letter');");
letter = replace(letter,"localStorage.setItem(storageKey, 'yes');","if(window.BirthdayCloud.offline)localStorage.setItem(storageKey, 'yes');");
letter = replace(letter,'window.birthdayLetter = {',"window.birthdayLetter = {applyCloud(earned,owner){unlocked=unlocked||earned||owner;updateEntry();},");
html = html.replace(letterMatch[0],()=>`<script id="letter-script">${letter}</script>`);
html = html.replace(/<p class="small">信件保存在当前浏览器。[^]*?<\/p>/,'<p class="small">保存后，她刷新网页就能读到你写好的信。</p>');
html = html.replace(/<p class="small">照片与文字保存在这台设备的浏览器中。[^]*?<\/p>/,'<p class="small">照片由你们共同管理。只有主人管理码可以修改这份礼物的文字。</p>');
html = html.replace('</header>',`</header><aside id="cloud-bar"><div><strong id="cloud-role"></strong><p id="cloud-status" role="status">照片与进度已从云端读取</p></div><div><button id="cloud-practice" type="button" hidden>试玩关卡</button><button id="cloud-retry" hidden type="button">重试同步</button><button id="cloud-refresh" type="button">刷新同步</button><button id="cloud-logout" type="button">退出</button></div></aside><dialog id="cloud-practice-dialog"><div class="dialog-top"><h2>先替她试玩一下</h2><button class="text-button" id="cloud-practice-close" type="button">关闭</button></div><p>试玩不会推进她的闯关进度。</p><div class="cloud-practice-options"><button class="button" type="button" data-practice="album">翻牌 · 照相馆</button><button class="button" type="button" data-practice="quotes">拼图 · 图书馆</button><button class="button" type="button" data-practice="chat">寄信 · 邮局</button><button class="button" type="button" data-practice="heart">点蜡烛 · 蛋糕屋</button></div></dialog>`);
html = replace(html,'<div id="photos" class="photos">','<details id="cloud-trash-details" hidden><summary>照片回收站</summary><div id="cloud-trash"></div></details><div id="photos" class="photos">');
html = replace(html,'<details id="cloud-trash-details"', '<p id="photo-capacity" class="small"></p><p id="photo-upload-status" class="small" role="status"></p><ul id="photo-upload-failures" class="small"></ul><button id="photo-upload-retry" class="text-button" type="button" hidden>重试未保存的照片</button><details id="cloud-trash-details"');
html = replace(html,'</body>', `<dialog id="photo-caption-dialog" aria-labelledby="photo-caption-title"><form id="photo-caption-form"><div class="dialog-top"><h2 id="photo-caption-title">给这张照片写点回忆</h2><button id="photo-caption-close" class="text-button" type="button">关闭 ×</button></div><label for="photo-caption-input">想记住的那一天</label><textarea id="photo-caption-input" rows="4" maxlength="80" placeholder="那天，我们……"></textarea><p class="small">最多 80 个字。保存后，她刷新相册就能看到。</p><button class="button" id="photo-caption-save" type="submit">保存这段回忆 ↗</button><p id="photo-caption-status" class="small" role="status"></p></form></dialog></body>`);
html = replace(html,'</head>',`<style>#cloud-bar{max-width:1360px;margin:0 auto 24px;padding:16px 24px;background:var(--paper);display:flex;align-items:center;justify-content:space-between;gap:16px}#cloud-bar p{font-size:14px;margin:4px 0 0}#cloud-bar button{background:transparent;text-decoration:underline;margin:0 0 0 16px;padding:8px 0;font-size:14px}#cloud-trash-details{margin-top:24px;font-size:15px}#cloud-trash>div{display:flex;justify-content:space-between;gap:16px}#edit-open[hidden]{display:none}#cloud-retry[hidden]{display:none}@media(max-width:560px){#cloud-bar{margin:0 16px 20px;padding:16px;align-items:flex-start;flex-direction:column}#cloud-bar button{margin:0 20px 0 0}}</style><script>window.BIRTHDAY_INITIAL=__BIRTHDAY_INITIAL__;</script></head>`);
// Clear the built-in sample images so no personal photo bytes travel in public source.
html = html.replace(/<div id="photos" class="photos">[^]*?<\/div>(?=\s*<div class="album-bottom")/,'<div id="photos" class="photos"></div>');
html = html.replaceAll('10.26','11.26').replaceAll('10 月 26 日','11 月 26 日').replaceAll('10月26日','11月26日').replaceAll('BIRTHDAY QUEST','FRIENDSHIP DAY');
html = replace(html,'<h1>生日快乐，<br><span data-name>冰激凌</span>。</h1>','<h1>友谊纪念日<br><span class="anniversary-pair">雨逢林 × <span data-name>冰激凌</span></span></h1>');
html = html.replaceAll('生日','友谊纪念日');
html = html.replace('document.title=`11.26 · 友谊纪念日快乐，${state.name}`;', 'document.title=`11.26 · 雨逢林与${state.name}的友谊纪念日`;');
html = html.replaceAll('冰激凌的友谊纪念日探险','雨逢林与冰激凌的友谊纪念日探险');
html = html.replaceAll('陪我许个友谊纪念日愿望','聊聊我们的友谊');
html = html.replace('</head>','<style>.anniversary-pair{display:block;font-size:clamp(24px,3.2vw,40px);line-height:1.5;letter-spacing:0;margin-top:16px}</style></head>');
for (const script of html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/gi)) {
  if(script[2].includes('__BIRTHDAY_INITIAL__'))continue;
  if(script[1].includes('application/json'))JSON.parse(script[2]);else new vm.Script(script[2]);
}
await writeFile(new URL('private/gift.html',root),html);
await copyFile(new URL('gate.html',root),new URL('private/gate.html',root));
await writeFile(new URL('public/robots.txt',root),'User-agent: *\nDisallow: /\n');
console.log('Built authenticated birthday app with shared photos and separate owner preview.');


