const $=id=>document.getElementById(id);
export function createVoice({state,status,toast,onTranscript}){
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition,synth=window.speechSynthesis;
 let current=null,generation=0,utterance=null,playTimer=null,restartTimer=null,lastReply='',silences=0,voices=[];
 let intent=null,retryTimer=null,offlineTimer=null,phase='idle',lastError='',lastEngine='browser',localAvailability='unknown',probePromise=null,recoveryDraft='',stagedDraft='';
 const RETRY_DELAYS=[800,1800],START_TIMEOUT=12000,STOP_TIMEOUT=1800;
 const hasTTS=!!synth&&typeof window.SpeechSynthesisUtterance==='function';
 state.handsfree=false;
 function updateButton(){$('conversation-button').classList.toggle('active',state.handsfree);$('conversation-button').textContent=state.handsfree?'结束语音对话':'连续语音对话';$('conversation-button').setAttribute('aria-pressed',String(state.handsfree));}
 function handsfree(value){state.handsfree=value;clearTimeout(restartTimer);updateButton();}
 function idle(){if(!state.busy&&!state.listening&&!state.speaking&&!intent)status($('voice-recovery').classList.contains('hidden')?'准备就绪，听你说':'语音暂停 · 可重试或用文字');}
 function nextListen(){clearTimeout(restartTimer);if(state.handsfree)restartTimer=setTimeout(()=>{if(!document.hidden&&state.handsfree&&!state.busy&&!state.speaking)start();},450);}
 function cancelSpeech(){generation++;clearTimeout(playTimer);utterance=null;if(hasTTS)synth.cancel();state.speaking=false;idle();}
 function micUI(listening){state.listening=listening;$('mic-button').classList.toggle('listening',listening);$('mic-button').setAttribute('aria-label',listening?'结束语音输入':intent?'取消语音连接':'开始语音输入');if(!listening)$('speech-caption').classList.add('hidden');}
 function hideRecovery(){$('voice-recovery').classList.add('hidden');}
 function showRecovery(message,pending=false){$('voice-recovery-message').textContent=message;$('voice-recovery').classList.remove('hidden');$('voice-retry').classList.toggle('hidden',pending);$('voice-cancel-retry').classList.toggle('hidden',!pending);$('voice-use-draft').classList.toggle('hidden',!recoveryDraft);}
 function clearTimers(){clearTimeout(retryTimer);clearTimeout(offlineTimer);retryTimer=offlineTimer=null;}
 // Detach before abort: native engines may emit error/end synchronously or very late.
 function retire(run,abort=false){clearTimeout(run.startTimer);clearTimeout(run.stopTimer);if(current===run)current=null;micUI(false);if(abort)try{run.rec.abort();}catch{}}
 function dropIntent(){clearTimers();intent=null;phase='idle';if(current)retire(current,true);micUI(false);}
 function stopListening(discard=false){
  if(discard){dropIntent();return;}
  if(!intent)return;intent.userEnded=true;clearTimers();
  if(!current){dropIntent();handsfree(false);hideRecovery();idle();return;}
  const run=current;phase='stopping';
  if(run.started){try{run.rec.stop();}catch{finish(run);}if(current===run)run.stopTimer=setTimeout(()=>finish(run),STOP_TIMEOUT);}
  else{run.stopOnStart=true;clearTimeout(run.startTimer);run.stopTimer=setTimeout(()=>finish(run),STOP_TIMEOUT);}
 }
 function shutdown(){handsfree(false);stopListening(true);hideRecovery();cancelSpeech();}
 function speechFailed(message){cancelSpeech();handsfree(false);status('播报未完成 · 可重播');toast(message+' 文字回复已保留，可点击“重播回复”。');}
 function cleanText(text){return text.replace(/```[\s\S]*?```/g,'代码内容请查看文字回复。').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^[#>*\-]+\s*/gm,'').replace(/[*_`]/g,'').trim();}
 function chunks(text){const parts=text.match(/[^。！？!?\n]+[。！？!?\n]*/g)||[text],out=[];for(const part of parts){for(let n=0;n<part.length;n+=150)if(part.slice(n,n+150).trim())out.push(part.slice(n,n+150));}return out;}
 function speak(text,{remember=true,voiceURI=state.voiceURI,rate=state.voiceRate,force=false}={}){
  if(remember){lastReply=text;$('replay-speech').disabled=false;}
  stopListening(true);cancelSpeech();
  if(!state.tts&&!force){idle();nextListen();return;}
  if(!hasTTS){speechFailed('此浏览器没有语音播报能力。');return;}
  const queue=chunks(cleanText(text));if(!queue.length){idle();nextListen();return;}
  const id=generation;state.speaking=true;status('正在准备语音…');
  function play(){
   if(id!==generation)return;if(!queue.length){state.speaking=false;utterance=null;idle();nextListen();return;}
   const u=new SpeechSynthesisUtterance(queue.shift());utterance=u;u.lang='zh-CN';u.rate=Math.max(.7,Math.min(1.4,Number(rate)||1));
   const available=synth.getVoices();u.voice=available.find(v=>v.voiceURI===voiceURI)||available.find(v=>/^zh/i.test(v.lang)&&/Ting|Xiao|Mei|Female|女/i.test(v.name))||available.find(v=>/^zh/i.test(v.lang))||null;
   u.onstart=()=>{if(id===generation){state.speaking=true;status('NOVA 正在说话…');}};
   u.onend=()=>{if(id!==generation)return;clearTimeout(playTimer);play();};
   u.onerror=e=>{if(id!==generation)return;speechFailed(e.error==='not-allowed'?'浏览器阻止了播报，请点击“重播回复”启动声音。':'语音播放失败，请检查系统声音或更换声音。');};
   playTimer=setTimeout(()=>{if(id===generation)speechFailed('语音播放没有完成。');},Math.min(60000,15000+u.text.length*180));
   try{synth.resume();synth.speak(u);}catch{speechFailed('无法启动语音播报。');}
  }play();
 }
 function focusText(){document.querySelector('.chat').classList.remove('collapsed');$('chat-input').focus();}
 function keepDraft(text){
  if(!text)return;const input=$('chat-input');recoveryDraft='';
  if(!input.value.trim()||input.value===stagedDraft){input.value=text;stagedDraft=text;}
  else if(input.value!==text)recoveryDraft=text;
 }
 function terminal(message,draft=''){
  keepDraft(draft);dropIntent();handsfree(false);showRecovery(message+(draft?' 已保留识别文字，请确认后发送或重新说。':''));idle();
 }
 function schedule(owner,delay,message){
  clearTimers();phase='recovering';showRecovery(message,true);status('语音连接恢复中…');micUI(false);
  retryTimer=setTimeout(()=>{retryTimer=null;if(intent!==owner||owner.userEnded)return;if(document.hidden||state.busy||state.speaking){dropIntent();handsfree(false);hideRecovery();return;}launch(owner);},delay);
 }
 function waitOnline(owner){
  clearTimers();phase='offline';showRecovery('浏览器当前离线，已暂停麦克风。网络恢复后会重新连接；你也可以取消或使用文字。',true);status('等待网络恢复…');micUI(false);
  offlineTimer=setTimeout(()=>{if(intent===owner)terminal('网络仍未恢复，已停止自动连接。联网后点击“重试语音”。');},30000);
 }
 function noSpeech(owner){
  if(state.handsfree&&!owner.userEnded&&++silences<2)schedule(owner,450,'暂未听到声音，将再聆听一次。');
  else terminal('没有识别到完整语句。请点击“重试语音”，或使用文字输入。');
 }
 function finish(run){
  if(current!==run)return;const owner=run.owner,text=run.segments.filter(x=>x?.final).map(x=>x.text).join('').trim(),draft=run.segments.filter(Boolean).map(x=>x.text).join('').trim();
  retire(run,true);if(intent!==owner)return;
  if(text){dropIntent();hideRecovery();silences=0;lastError='';if(stagedDraft&&$('chat-input').value===stagedDraft)$('chat-input').value='';stagedDraft=recoveryDraft='';onTranscript(text);}
  else if(draft)terminal('语音服务未确认完整语句。',draft);
  else noSpeech(owner);
 }
 function recognitionError(run,code){
  if(current!==run)return;const owner=run.owner,draft=run.segments.filter(Boolean).map(x=>x.text).join('').trim();lastError=code;retire(run,true);if(intent!==owner)return;
  if(draft){terminal('语音识别中断，未自动提交不完整内容。',draft);return;}
  if(code==='no-speech'){noSpeech(owner);return;}
  if(run.engine==='local'&&['language-not-supported','service-not-allowed'].includes(code))localAvailability='unavailable';
  const transient=['network','start-timeout'].includes(code)||(run.engine==='local'&&['language-not-supported','service-not-allowed'].includes(code));
  if(transient&&!owner.userEnded){
   if(navigator.onLine===false&&engine()!=='local'){waitOnline(owner);return;}
   if(owner.attempts<RETRY_DELAYS.length){const delay=RETRY_DELAYS[owner.attempts++];schedule(owner,delay,`语音服务暂时中断，正在重新连接（${owner.attempts}/${RETRY_DELAYS.length}）。连接恢复后请重新说。`);return;}
  }
  const messages={
   'network':'浏览器语音服务仍无法连接，已停止自动重试。这是语音识别连接，与 Kimi / DeepSeek Key 无关。可稍后重试，或在设置中选择已有的本机识别能力。',
   'start-timeout':'语音服务启动超时，已释放会话。请确认浏览器麦克风权限，稍后重试。',
   'not-allowed':'麦克风或语音权限被拒绝。请在浏览器地址栏的权限设置中允许麦克风后重试。',
   'service-not-allowed':'浏览器不允许使用语音识别服务。可换用支持的 Chrome / Edge，或使用文字输入。',
   'audio-capture':'未能使用麦克风。请确认设备已连接、系统已授权且未被其它应用独占。',
   'language-not-supported':'当前语音服务不支持中文识别。可在设置中改为浏览器联网识别，或使用文字。',
   'aborted':'语音输入已取消。需要继续时请点击“重试语音”。'
  };
  terminal(messages[code]||'语音识别暂不可用，已释放会话。可点击“重试语音”，或使用文字输入。');
 }
 function engine(){return state.recognitionMode!=='browser'&&localAvailability==='available'?'local':'browser';}
 function supportNote(){
  const local=localAvailability==='available';
  $('voice-support').textContent=!Recognition?'当前浏览器不支持识别 · 可用文字':engine()==='local'?'中文语音输入 · 本机识别':'中文语音输入 · 浏览器联网服务';
  $('recognition-note').textContent=local?'已检测到浏览器可用的中文本机识别。自动模式优先使用它；本机识别不影响 AI 对话的联网需求。':'自动模式仅在浏览器已安装中文识别包时使用本机识别，否则使用浏览器联网服务。不会自动下载识别包；该服务独立于 Kimi / DeepSeek。';
 }
 function probeLocal(){
  if(!Recognition||typeof Recognition.available!=='function'||!('processLocally' in Recognition.prototype)){localAvailability='unsupported';supportNote();return Promise.resolve();}
  if(probePromise)return probePromise;
  probePromise=(async()=>{let timer;try{const result=await Promise.race([Recognition.available({langs:['zh-CN'],processLocally:true}),new Promise(r=>timer=setTimeout(()=>r('unknown'),2500))]);localAvailability=['available','downloadable','downloading','unavailable'].includes(result)?result:'unknown';}catch{localAvailability='unavailable';}finally{clearTimeout(timer);supportNote();}})();return probePromise;
 }
 function launch(owner){
  if(intent!==owner||owner.userEnded)return;clearTimers();const selected=engine();
  if(navigator.onLine===false&&selected!=='local'){waitOnline(owner);return;}
  let rec;try{rec=new Recognition();}catch{terminal('浏览器无法创建语音识别会话，请重试或使用文字。');return;}
  const run={rec,owner,engine:selected,started:false,stopOnStart:false,segments:[],startTimer:null,stopTimer:null};current=run;phase='starting';lastEngine=selected;
  rec.lang='zh-CN';rec.continuous=false;rec.interimResults=true;rec.maxAlternatives=1;if('processLocally' in rec)rec.processLocally=selected==='local';
  status(selected==='local'?'正在启动本机识别…':'正在连接语音识别…');micUI(false);supportNote();
  rec.onstart=()=>{if(current!==run)return;clearTimeout(run.startTimer);run.started=true;phase='listening';hideRecovery();micUI(true);$('speech-caption').classList.remove('hidden');$('speech-caption').textContent=owner.attempts?'连接已恢复，请重新说…':'正在聆听…';status(owner.attempts?'语音已恢复，请重新说…':'正在聆听…');if(run.stopOnStart)stopListening();};
  rec.onresult=e=>{if(current!==run)return;for(let i=e.resultIndex;i<e.results.length;i++)run.segments[i]={text:e.results[i][0].transcript,final:e.results[i].isFinal};$('speech-caption').textContent=run.segments.filter(Boolean).map(x=>x.text).join('')||'正在聆听…';};
  rec.onerror=e=>recognitionError(run,e.error);rec.onend=()=>finish(run);
  run.startTimer=setTimeout(()=>recognitionError(run,'start-timeout'),START_TIMEOUT);
  try{rec.start();}catch(e){recognitionError(run,e.name==='NotAllowedError'?'not-allowed':e.name==='NotFoundError'?'audio-capture':'start-timeout');}
 }
 function start({hold=false}={}){
  if(!state.entered||!state.ready||document.hidden)return;
  if(!Recognition){terminal('此浏览器不支持语音识别，请使用桌面 Chrome / Edge，或改用文字。');focusText();return;}
  if(current||intent)return;if(state.busy){toast('正在等待 AI 回应，可先取消请求。');return;}
  clearTimeout(restartTimer);cancelSpeech();hideRecovery();lastError='';
  intent={attempts:0,hold,userEnded:false};launch(intent);
 }
 window.addEventListener('offline',()=>{if(!intent||lastEngine==='local')return;if(current)recognitionError(current,'network');else waitOnline(intent);});
 window.addEventListener('online',()=>{if(intent&&phase==='offline'&&!intent.userEnded&&!document.hidden&&!state.busy&&!state.speaking){const owner=intent;schedule(owner,350,'网络已恢复，正在重新连接语音；连通后请重新说。');}});
 $('voice-retry').onclick=()=>{dropIntent();start();};
 $('voice-cancel-retry').onclick=()=>{handsfree(false);stopListening(true);hideRecovery();idle();};
 $('voice-use-text').onclick=()=>{handsfree(false);stopListening(true);focusText();idle();};
 $('voice-use-draft').onclick=()=>{const draft=recoveryDraft;if(draft){const input=$('chat-input');input.value+=(input.value.trim()?'\n':'')+draft;recoveryDraft='';$('voice-use-draft').classList.add('hidden');}handsfree(false);stopListening(true);focusText();};
 function populateVoices(){
  voices=hasTTS?synth.getVoices():[];const selected=$('voice-select').value||state.voiceURI||'';const options=[new Option('系统默认中文声音','')];
  for(const v of voices.filter(v=>/^zh/i.test(v.lang)))options.push(new Option(v.name+' · '+v.lang,v.voiceURI));
  $('voice-select').replaceChildren(...options);$('voice-select').value=options.some(o=>o.value===selected)?selected:'';
  $('voice-device-note').textContent=hasTTS?(voices.length?'选择系统提供的中文声音；不同电脑的声音列表可能不同。':'系统暂未返回声音列表，可点击试听检查默认声音。'):'此浏览器不支持语音播报，文字回复仍可用。';
 }
 if(hasTTS)synth.addEventListener('voiceschanged',populateVoices);populateVoices();
 probeLocal();supportNote();
 $('mic-button').onclick=()=>intent?stopListening():start();
 $('conversation-button').onclick=()=>{if(state.handsfree){shutdown();toast('连续语音对话已结束。');}else{handsfree(true);silences=0;start();}};
 $('stop-speech').onclick=()=>{cancelSpeech();nextListen();};
 $('replay-speech').onclick=()=>{if(lastReply)speak(lastReply,{force:true});};
 $('test-voice').onclick=()=>speak('你好，我是 NOVA。现在你听到的是我的语音回复。',{remember:false,voiceURI:$('voice-select').value,rate:Number($('voice-rate').value),force:true});
 $('voice-rate').oninput=()=>$('voice-rate-value').textContent=Number($('voice-rate').value).toFixed(2)+'×';
 return {start,stopListening,stopSpeech:cancelSpeech,speak,shutdown,failed:()=>{handsfree(false);stopListening(true);idle();},settingsChanged:()=>supportNote(),openSettings:()=>{populateVoices();probeLocal();supportNote();$('recognition-mode').value=state.recognitionMode||'auto';$('voice-select').value=state.voiceURI||'';$('voice-rate').value=state.voiceRate||1;$('voice-rate-value').textContent=Number(state.voiceRate||1).toFixed(2)+'×';},diagnostics:()=>({hasRecognition:!!Recognition,hasTTS,handsfree:state.handsfree,queuedSpeech:!!utterance,voiceCount:voices.length,phase,engine:lastEngine,localAvailability,retryAttempt:intent?.attempts||0,recovering:phase==='recovering'||phase==='offline',lastError})};
}
