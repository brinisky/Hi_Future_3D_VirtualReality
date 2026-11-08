const $=id=>document.getElementById(id);
const providers={coding:{label:'Kimi for Coding',model:'kimi-for-coding',note:'使用 Kimi Code 的独立 Key。Coding 权益面向编程；游戏产品集成可选 Kimi 开放平台。'},moonshot:{label:'Kimi 开放平台',model:'kimi-k2.5',note:'使用 Kimi 开放平台 Key；与 Coding 会员 Key 分开。'},deepseek:{label:'DeepSeek V4.1 Flash',model:'deepseek-flash',note:'官方模型 ID：deepseek-flash，当前对应 DeepSeek-V4.1-Flash-1017。接口：https://api.deepseek.com；使用独立 DeepSeek Key。语音对话默认采用非思考模式。'}};
export function createKimiClient({getEndpoint,onConfigured,onStatus}){
 const sessions=new Map();let lastConfig=null;
 function base(endpoint=getEndpoint()){
  const u=new URL(endpoint);if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/api/chat')throw new Error('服务地址应为本机的 /api/chat，例如 http://127.0.0.1:8767/api/chat。');return u.origin;
 }
 async function request(route,{method='GET',data,signal,endpoint}={}){
  const origin=base(endpoint);let token=sessions.get(origin);
  if(route!=='/api/session'&&!token){await refresh(endpoint);token=sessions.get(origin);}
  let response;
  try{response=await fetch(origin+route,{method,headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'X-Nova-Session':token}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{}),credentials:'omit',cache:'no-store',signal:signal||AbortSignal.timeout(route==='/api/test'?95000:7000)});}
  catch(e){if(e.name==='AbortError'||e.name==='TimeoutError')throw e;throw new Error('本地 AI 服务未启动或浏览器阻止了连接。请运行随包的 hi3d-server.mjs，再点击刷新。');}
  let result;try{result=await response.json();}catch{throw new Error('本地服务返回格式异常，请检查地址和服务版本。');}
  if(!response.ok){if(response.status===403)sessions.delete(origin);throw new Error(result.error||'服务请求失败（HTTP '+response.status+'）。');}
  return result;
 }
 function show(config){lastConfig=config;onStatus(config);const label=providers[config.provider]?.label||'AI';$('kimi-status').textContent=config.offline?'当前连接为离线测试服务，不能调用 AI；请运行新版启动文件后刷新。':config.hasKey?(config.lastTest?label+' 连接测试成功 · '+config.model:label+' Key 已设置 · 尚未测试连接'):'服务已连接 · 请设置 API Key';}
 async function refresh(endpoint){const r=await request('/api/session',{endpoint});if(typeof r.sessionToken!=='string')throw new Error('不是兼容的 NOVA 对话服务，请运行新版启动文件后重新连接。');sessions.set(base(endpoint),r.sessionToken);show(r.config);return r.config;}
 function providerUI(){const id=$('kimi-provider').value,p=providers[id];$('region-row').classList.toggle('hidden',id==='deepseek');$('provider-note').textContent=p?.note||'';}
 function fill(config){$('kimi-provider').value=config.provider;$('kimi-region').value=config.region;$('kimi-model').value=config.model;$('remember-key').checked=config.persisted;$('kimi-key').value='';$('kimi-key').placeholder=config.hasKey?'已设置；留空保留原 Key':'在这里输入你的 API Key';providerUI();}
 async function open(){
  $('kimi-status').textContent='正在刷新本地连接…';$('kimi-key').disabled=true;$('save-kimi').disabled=true;
  try{fill(await refresh());}catch(e){$('kimi-status').textContent=e.message;}
  finally{$('kimi-key').disabled=false;$('save-kimi').disabled=false;}
 }
 async function withButton(id,task){const button=$(id);button.disabled=true;try{await task();}catch(e){$('kimi-status').textContent=e.name==='TimeoutError'?'连接测试超时，请检查网络后重试。':e.message;}finally{button.disabled=false;}}
 $('refresh-kimi').onclick=()=>withButton('refresh-kimi',open);
 $('settings-dialog').addEventListener('close',()=>{$('kimi-key').value='';});
 $('kimi-provider').onchange=()=>{$('kimi-model').value=providers[$('kimi-provider').value].model;$('kimi-key').value='';$('kimi-key').placeholder='切换服务需要对应平台的 Key';providerUI();};
 $('save-kimi').onclick=()=>withButton('save-kimi',async()=>{
  if($('kimi-provider').value==='deepseek'&&!lastConfig?.supportedProviders?.includes('deepseek'))throw new Error('当前后端版本尚不支持 DeepSeek。请运行新版启动文件，将本地服务地址设为 http://127.0.0.1:8767/api/chat 并刷新。');
  const key=$('kimi-key').value.trim();const r=await request('/api/config',{method:'POST',data:{provider:$('kimi-provider').value,region:$('kimi-region').value,model:$('kimi-model').value.trim(),key,remember:$('remember-key').checked}});
  $('kimi-key').value='';fill(r.config);show(r.config);onConfigured(getEndpoint());
 });
 $('test-kimi').onclick=()=>withButton('test-kimi',async()=>{if(lastConfig&&($('kimi-provider').value!==lastConfig.provider||$('kimi-model').value.trim()!==lastConfig.model||$('kimi-region').value!==lastConfig.region||$('kimi-key').value.trim()))throw new Error('请先保存当前服务和 Key，再测试连接。');$('kimi-status').textContent='正在请求 '+(providers[lastConfig?.provider]?.label||'AI')+'，请稍候…';const r=await request('/api/test',{method:'POST',data:{}});show(r.config);});
 $('forget-kimi').onclick=()=>withButton('forget-kimi',async()=>{const r=await request('/api/config',{method:'DELETE'});fill(r.config);show(r.config);});
 return {open,refresh,base,getConfig:()=>lastConfig,chat:async(endpoint,messages,context,signal)=>{
  const r=await request('/api/chat',{method:'POST',endpoint,data:{messages:messages.slice(-16),context},signal});
  if(typeof r.reply!=='string'||!r.reply.trim())throw new Error('服务未返回可朗读的文本。');
  return {reply:r.reply.slice(0,8000),action:['light_day','light_night','light_toggle','scan','overview','return'].includes(r.action)?r.action:undefined};
 }};
}
