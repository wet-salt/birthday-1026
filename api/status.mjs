import {json, session} from '../lib/auth.mjs';
export default function handler(req,res){
  if(!session(req))return json(res,401,{error:'请先输入访问码。'});
  return json(res,200,{ready:!!process.env.DEEPSEEK_API_KEY});
}
