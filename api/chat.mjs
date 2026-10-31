const windows = new Map();
const allowedPage = 'https://wet-salt.github.io';
function headers(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Vary','Origin');
 const origin=req.headers.origin;
 const own='https://'+req.headers.host;
 if(origin&&origin!==allowedPage&&origin!==own)return false;
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 return true;
}
function send(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));}
export default async function handler(req,res){
 if(!headers(req,res))return send(res,403,{error:'请求来源不匹配。'});
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(req.method!=='POST')return send(res,405,{error:'请使用 POST 请求。'});
 const key=process.env.DEEPSEEK_API_KEY;
 if(!key)return send(res,503,{error:'聊天服务尚未配置完成。'});
 const now=Date.now();
 for(const [k,v]of windows)if(v.until<now)windows.delete(k);
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
 const limit=windows.get(ip)||{count:0,until:now+60000};
 if(++limit.count>10){res.setHeader('Retry-After','60');return send(res,429,{error:'聊得太快啦，请稍等一分钟再试。'});}windows.set(ip,limit);
 let body=req.body;
 try{
  if(typeof body==='string'){if(body.length>24000)return send(res,413,{error:'内容太长，请缩短一点。'});body=JSON.parse(body);}
  if(!body||JSON.stringify(body).length>24000)return send(res,413,{error:'内容太长，请缩短一点。'});
 }catch{return send(res,400,{error:'消息格式不正确。'});}
 const messages=body.messages;
 if(!Array.isArray(messages)||!messages.length||messages.length>16||messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>6000)||messages.at(-1).role!=='user')return send(res,400,{error:'请发送有效的聊天内容。'});
 const system='你是给冰激凌的生日网页里的AI聊天伙伴。她生日10月26日，闺蜜送她一句话：我要和你做一辈子的闺蜜。用自然温暖的中文陪她聊生活、生日愿望和心情，通常2到5句话。你是AI，不是她的真人闺蜜，不冒充真人，不编造你们共同经历或她的年龄背景。认真回应实际内容，不要堆砌鸡汤，不索取隐私或密钥。';
 try{
  const upstream=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.DEEPSEEK_MODEL||'deepseek-flash',messages:[{role:'system',content:system},...messages.map(m=>({role:m.role,content:m.content}))],stream:false,max_tokens:700,thinking:{type:'disabled'}}),signal:AbortSignal.timeout(35000)});
  if(!upstream.ok){const message=upstream.status===401?'聊天服务密钥失效，请联系制作者。':upstream.status===402?'聊天服务额度不足，请联系制作者。':upstream.status===429?'DeepSeek 正忙，请稍后重试。':'暂时没有连上 DeepSeek，请稍后重试。';return send(res,502,{error:message});}
  const result=await upstream.json();const reply=result.choices?.[0]?.message?.content;
  if(typeof reply!=='string'||!reply.trim())return send(res,502,{error:'这次没有收到回复，请重试。'});
  return send(res,200,{reply});
 }catch(error){return send(res,502,{error:error.name==='TimeoutError'?'回复超时，请重试。':'网络暂时没有连上，请稍后再试。'});}
}
