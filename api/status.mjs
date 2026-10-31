export default function handler(req,res){
 const origin=req.headers.origin;
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
 if(origin&&origin!=='https://wet-salt.github.io'&&origin!=='https://'+req.headers.host){res.statusCode=403;return res.end();}
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify({ready:!!process.env.DEEPSEEK_API_KEY}));
}
