export const ACTIONS=new Set(['light_day','light_night','light_toggle','scan','overview','return']);
export function localReply(text,context){
  const t=text.trim().toLowerCase();
  if(/^(不要|别|停止|取消).*(关灯|开灯|扫描|切换|地图)/.test(t))return {reply:'好的，保持当前状态。你可以继续聊天或自由探索。'};
  if(/地图|总览|俯瞰|overview/.test(t))return {reply:'为你打开实验室总览。中央是会话与扫描区，两侧是不同的研究空间。再次点击“地图总览”即可回到刚才的位置。',action:'overview'};
  if(/回到|返回|找你|回来|return/.test(t))return {reply:'欢迎回来，我在中央会话区等你。',action:'return'};
  if(/扫描|检测|诊断|scan/.test(t))return {reply:context.scanning?'扫描正在进行，请稍等片刻。':'开始全域扫描。你会看到扫描波穿过实验室，完成后会显示本原型中的设备模拟状态。',action:'scan'};
  if(/开灯|白天|日间|明亮|亮一点/.test(t))return {reply:'已切换到日间光环境，空间会更明亮。',action:'light_day'};
  if(/关灯|夜间|暗一点|晚上/.test(t))return {reply:'已切换到夜间光环境，保留基础照明，方便继续探索。',action:'light_night'};
  if(/灯光|灯|光环境/.test(t))return {reply:context.lighting==='day'?'已切换到夜间光环境。':'已恢复日间光环境。',action:'light_toggle'};
  if(/kimi|deepseek|模型|联网|大模型|真正的ai|真的ai/.test(t))return {reply:'这个版本使用本地规则演示，没有调用外部 AI。可在设置中切换为 AI 真实对话，保存对应平台的 Key 并测试连接；Key 只留在本机服务。'};
  if(/介绍|这里|实验室|哪里/.test(t))return {reply:`欢迎来到 NOVA 实验室。这里保留了你提供的科幻空间与人物模型。
你可以用 WASD 自由探索，也可以告诉我“切换夜间灯光”“扫描实验室”或“查看地图”。我会留在中央会话区，随时回应你。`};
  if(/你好|您好|hello|hi\b|早上|晚上好|你是谁|名字/.test(t))return {reply:`你好，我是 NOVA，你在这间实验室的 AI 助手。很高兴见到你。
试着告诉我“扫描实验室”，或者和我一起改变这里的灯光。当前对话为本地演示。`};
  if(/能做|帮助|指令|怎么玩|功能|help/.test(t))return {reply:`你可以这样和我互动：
· “开灯”或“切换夜间灯光”
· “扫描实验室”
· “查看地图”或“返回助手”
也可以按住 V 说话，松开结束。浏览器不支持语音时，文字输入始终可用。`};
  if(/谢谢|再见|拜拜/.test(t))return {reply:'不客气。你可以继续探索，我就在这里。'};
  return {reply:`我收到了：“${text.slice(0,120)}”。
当前是本地规则演示，还不能像接入 AI 服务后那样自由问答。现在可以试试“介绍这里”“切换夜间灯光”“扫描实验室”或“查看地图”。`};
}
export async function remoteReply(endpoint,messages,context,signal){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:messages.slice(-16),context}),signal,credentials:'omit'});
  let data;try{data=await response.json();}catch{throw new Error('对话服务返回了非 JSON 内容，请检查服务地址。');}
  if(!response.ok)throw new Error(data.error||'对话服务暂时不可用（HTTP '+response.status+'）。');
  if(typeof data.reply!=='string'||!data.reply.trim())throw new Error('对话服务缺少 reply 文本。');
  return {reply:data.reply.slice(0,8000),action:ACTIONS.has(data.action)?data.action:undefined};
}
