/** NOVA local AI gateway. Node.js 20+. No third-party dependencies. */
import http from 'node:http';
import {readFile,stat,lstat,realpath,mkdir,writeFile,rename,unlink,chmod} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROVIDERS={
 coding:{label:'Kimi for Coding',model:'kimi-for-coding',cn:'https://api.kimi.com/coding/v1',global:'https://api.kimi.ai/coding/v1'},
 moonshot:{label:'Kimi 开放平台',model:'kimi-k2.5',cn:'https://api.moonshot.cn/v1',global:'https://api.moonshot.ai/v1'},
 deepseek:{label:'DeepSeek V4.1 Flash',model:'deepseek-flash',cn:'https://api.deepseek.com',global:'https://api.deepseek.com'}
};
const ACTIONS=new Set(['light_day','light_night','light_toggle','scan','overview','return']);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8','.map':'application/json'};
const LOCAL=new Set(['127.0.0.1','localhost']);
function isLocalOrigin(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&LOCAL.has(u.hostname)&&!u.username&&!u.password&&u.origin===value;}catch{return false;}}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
function error(status,message){return Object.assign(new Error(message),{status});}
function same(a,b){if(typeof a!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
async function body(req){
 if(!/^application\/json\b/.test(req.headers['content-type']||''))throw error(415,'请使用 JSON 请求。');
 let value='';for await(const chunk of req){value+=chunk;if(Buffer.byteLength(value)>64000)throw error(413,'消息过长。');}
 try{return JSON.parse(value);}catch{throw error(400,'请求不是有效 JSON。');}
}
function validate(config){
 if(!PROVIDERS[config.provider]||!['cn','global'].includes(config.region)||typeof config.model!=='string'||!/^[\w.:-]{1,100}$/.test(config.model))throw error(400,'服务类型、区域或模型名称无效。');
 if(typeof config.key!=='string'||!config.key.trim()||config.key.length>4096||/[\s\x00-\x1f]/.test(config.key))throw error(400,'请输入有效的 API Key，且不要包含空格或换行。');
}
function upstreamError(status,provider){
 if(status===401)return 'API Key 无效或已失效，请在设置中重新配置。';
 if(status===402)return '账户额度不足，请在服务商控制台检查额度。';
 if(status===403)return provider==='coding'?'Kimi for Coding 拒绝本客户端或账号权益。该会员权益面向编程场景；请检查控制台，或改用 Kimi 开放平台及其独立 Key。':'当前 Key 没有访问该模型的权限，请检查账户权益。';
 if(status===404)return '模型或接口不可用，请核对模型 ID。';
 if(status===429)return '请求达到速率或额度限制，请稍后再试。';
 if(status===400||status===422)return '模型不接受当前请求参数，请核对模型 ID 和服务类型。';
 return (PROVIDERS[provider]?.label||'AI')+' 服务暂时不可用（HTTP '+status+'），请稍后重试。';
}
export async function createNovaServer({root=path.dirname(fileURLToPath(import.meta.url)),storageDir=path.join(root,'.nova-private'),fetchImpl=globalThis.fetch,offline=false,initialKey='',timeoutMs=90000}={}){
 root=await realpath(root);
 const secretFile=path.join(storageDir,'hi3d-kimi-config.json'),sessionToken=randomBytes(32).toString('hex');
 let config={provider:'coding',region:'cn',model:'kimi-for-coding',key:initialKey,persisted:false},lastTest=null;
 async function privateDir(create=false){
  if(create)await mkdir(storageDir,{recursive:true,mode:0o700});
  const s=await lstat(storageDir);if(!s.isDirectory()||s.isSymbolicLink())throw error(500,'本地配置目录不可用。');
  const resolved=await realpath(storageDir);if(resolved!==path.resolve(storageDir))throw error(500,'本地配置目录不能使用符号链接。');
  if(create)await chmod(storageDir,0o700);
 }
 async function readSaved(){
  try{await privateDir();const s=await lstat(secretFile);if(s.isSymbolicLink()||!s.isFile()||s.nlink!==1)throw error(500,'本地配置文件不可用。');const c=JSON.parse(await readFile(secretFile,'utf8'));validate(c);config={provider:c.provider,region:c.region,model:c.model,key:c.key,persisted:true};}
  catch(e){if(e.code!=='ENOENT')console.warn('未加载本地配置，请在网页设置中重新配置。');}
 }
 if(!offline)await readSaved();
 async function forgetDisk(){try{await privateDir();const s=await lstat(secretFile);if(s.isSymbolicLink()||!s.isFile()||s.nlink!==1)throw error(500,'本地配置文件不可用。');await unlink(secretFile);}catch(e){if(e.code!=='ENOENT')throw e;}}
 async function saveConfig(next,persist){
  if(persist){await privateDir(true);try{const s=await lstat(secretFile);if(s.isSymbolicLink()||s.nlink!==1)throw error(500,'本地配置文件不可用。');}catch(e){if(e.code!=='ENOENT')throw e;}
   const temporary=path.join(storageDir,'.hi3d-config-'+randomBytes(8).toString('hex'));await writeFile(temporary,JSON.stringify({provider:next.provider,region:next.region,model:next.model,key:next.key}),{flag:'wx',mode:0o600});await rename(temporary,secretFile);
  }else await forgetDisk();
  config={...next,persisted:persist};lastTest=null;
 }
 const publicConfig=()=>({provider:config.provider,region:config.region,model:config.model,hasKey:!!config.key,persisted:config.persisted,lastTest,offline,supportedProviders:Object.keys(PROVIDERS)});
 async function callKimi(messages,context,res,test=false){
  if(offline)throw error(503,'当前服务以 --offline 启动，不能发送真实 AI 请求。请启动正式服务后刷新连接。');
  if(!config.key)throw error(503,'尚未设置 API Key，请打开设置保存 Key，再测试连接。');
  const cfg={...config},controller=new AbortController();
  const abort=()=>{if(!res.writableEnded)controller.abort();};res.on('close',abort);
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const system=test?'只回复：连接成功。':`你是科幻实验室中的中文语音助手 NOVA，友好自然，通常用一到三句简短中文回答，适合直接朗读。你可以回答一般问题，但不能访问现实设备。实验室状态：${JSON.stringify(context)}。输出 JSON 对象，reply 是要朗读的自然文本，action 可省略。仅在用户明确要求时设置 action，可选 light_day、light_night、light_toggle、scan、overview、return。不要朗读 JSON 字段名，不要虚构已完成的现实操作。`;
   const payload={model:cfg.model,messages:[{role:'system',content:system},...messages],stream:false,max_tokens:4096};
   if(cfg.provider==='deepseek')payload.thinking={type:'disabled'};
   else if(['kimi-for-coding','k3','k3-256k'].includes(cfg.model))payload.reasoning_effort='low';
   const response=await fetchImpl(PROVIDERS[cfg.provider][cfg.region]+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key,'User-Agent':'NOVA-Lab/3.0'},body:JSON.stringify(payload),signal:controller.signal,redirect:'error'});
   if(!response.ok){await response.body?.cancel();throw error(response.status===429?429:502,upstreamError(response.status,cfg.provider));}
   const data=await response.json(),raw=data.choices?.[0]?.message?.content;
   const content=typeof raw==='string'?raw:Array.isArray(raw)?raw.filter(v=>v.type==='text').map(v=>v.text).join('\n'):'';
   if(!content.trim())throw error(502,'模型未返回可朗读的文本，请重试或更换模型。');
   let parsed;try{parsed=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{parsed={reply:content};}
   const reply=typeof parsed.reply==='string'?parsed.reply.trim():content.trim();
   if(!reply)throw error(502,'模型返回了空回应。');
   return {reply:reply.slice(0,8000),...(ACTIONS.has(parsed.action)?{action:parsed.action}:{}),provider:cfg.provider,model:cfg.model};
  }catch(e){if(e.status)throw e;const label=PROVIDERS[cfg.provider].label;if(e.name==='AbortError')throw error(504,label+' 回应超时或已取消。请重试。');throw error(502,'无法连接 '+label+'，请检查网络和服务配置。');}
  finally{clearTimeout(timer);res.off('close',abort);}
 }
 const server=http.createServer(async(req,res)=>{
  try{
   let host;try{host=new URL('http://'+req.headers.host);}catch{return json(res,403,{error:'无效的本地请求。'});}
   if(!LOCAL.has(host.hostname)||Number(host.port)!==server.address().port)return json(res,403,{error:'仅接受本机地址。'});
   const origin=req.headers.origin;if(origin&&!isLocalOrigin(origin))return json(res,403,{error:'仅接受本机预览页面。'});
   if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Nova-Session');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
   const url=new URL(req.url,host),route=url.pathname;
   if(route==='/api/session'&&req.method==='GET')return json(res,200,{sessionToken,config:publicConfig()});
   if(route.startsWith('/api/')){
    if(!same(req.headers['x-nova-session'],sessionToken))return json(res,403,{error:'本地会话已失效，请在设置中刷新连接。'});
    if(route==='/api/config'&&req.method==='POST'){
     const data=await body(req),next={provider:data.provider,region:data.region,model:data.model,key:typeof data.key==='string'?data.key.trim():''};
     if(!next.key&&data.provider===config.provider)next.key=config.key;validate(next);await saveConfig(next,data.remember===true);return json(res,200,{config:publicConfig()});
    }
    if(route==='/api/config'&&req.method==='DELETE'){await forgetDisk();config={...config,key:'',persisted:false};lastTest=null;return json(res,200,{config:publicConfig()});}
    if(route==='/api/test'&&req.method==='POST'){await body(req);const result=await callKimi([{role:'user',content:'请确认连接成功。'}],{},res,true);lastTest=new Date().toISOString();return json(res,200,{ok:true,model:result.model,config:publicConfig()});}
    if(route==='/api/chat'&&req.method==='POST'){
     const data=await body(req);if(!Array.isArray(data.messages))throw error(400,'缺少对话消息。');
     const messages=data.messages.slice(-16).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.trim()).map(m=>({role:m.role,content:m.content.slice(0,4000)}));
     if(!messages.length||messages.at(-1).role!=='user')throw error(400,'需要一条用户消息。');
     const context={lighting:['day','night'].includes(data.context?.lighting)?data.context.lighting:'day',scanning:!!data.context?.scanning,scanDone:!!data.context?.scanDone,view:data.context?.view==='overview'?'overview':'first'};
     return json(res,200,await callKimi(messages,context,res));
    }
    return json(res,404,{error:'接口不存在。'});
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'不支持此请求方法。'});
   const requested=decodeURIComponent(route==='/'?'/hi3d-index.html':route);
   if(requested.split(/[\\/]/).some(v=>v.startsWith('.')))return json(res,403,{error:'禁止访问此文件。'});
   const local=path.resolve(root,'.'+requested);if(!local.startsWith(root+path.sep))return json(res,403,{error:'禁止访问此路径。'});
   let resolved;try{resolved=await realpath(local);}catch{return json(res,404,{error:'文件不存在。'});}
   if(!resolved.startsWith(root+path.sep)||resolved.startsWith(path.resolve(storageDir)+path.sep))return json(res,403,{error:'禁止访问此路径。'});
   const info=await stat(resolved);if(!info.isFile())return json(res,404,{error:'文件不存在。'});
   res.writeHead(200,{'Content-Type':MIME[path.extname(resolved)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache'});
   if(req.method==='HEAD')return res.end();createReadStream(resolved).pipe(res);
  }catch(e){if(!res.headersSent&&!res.destroyed)json(res,e.status||500,{error:e.status?e.message:'本地服务发生错误，请检查配置后重试。'});else if(!res.destroyed)res.end();}
 });
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await createNovaServer({offline:process.argv.includes('--offline'),initialKey:process.env.KIMI_CODING_API_KEY||''});
 const port=Number(process.env.PORT||8767);
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口已占用。请关闭旧版 NOVA 服务，或使用 PORT 指定其他端口。':'本地服务启动失败。');process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log('NOVA AI 服务已启动，端口 '+port+'（Kimi / DeepSeek）。在游戏设置中配置 Key；请勿将 Key 发到聊天中。'));
}
