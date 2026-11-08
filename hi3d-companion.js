import * as THREE from 'three';
export function createCompanion(gltf,position){
 const root=gltf.scene;root.position.copy(position);const mixer=new THREE.AnimationMixer(root),actions=new Map(),accents=new Map();
 // Blender's first key is frame 1. Remove that constant offset so the stride
 // remains exactly one second and never holds the first pose on each loop.
 for(const source of gltf.animations){const clip=source.clone();const start=Math.min(...clip.tracks.map(t=>t.times[0]));for(const track of clip.tracks)track.shift(-start);clip.resetDuration();
  if(clip.name.startsWith('Hem_')){clip.tracks=clip.tracks.filter(t=>t.name.startsWith('Flex_hem_')&&t.name.endsWith('.quaternion'));if(!clip.tracks.length)continue;THREE.AnimationUtils.makeClipAdditive(clip,0);const a=mixer.clipAction(clip);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=false;accents.set(clip.name,a);}
  else actions.set(clip.name,mixer.clipAction(clip));
 }
 let active='',mode='auto',clock=0,next=5.7,index=0,blinkAt=2.8,blinkStart=-10,smile=0,reactUntil=0,reactName='',walkWeight=0,walkPhase=0;const order=['Idle_Breathe','Idle_Relaxed','Idle_Glance'];
 const walkNames=['Walk_Forward','Walk_Backward','Walk_Left','Walk_Right'],walkMix=[1,0,0,0],idleWeights=new Map();
 let wasMoving=false,lastYaw=null,turnTravel=0,accentUntil=0,lastAccent='';const accentCounts={stop:0,turn:0};
 function accent(name){const a=accents.get(name);if(!a)return;a.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();lastAccent=name;accentUntil=clock+a.getClip().duration;if(name==='Hem_Stop')accentCounts.stop++;else accentCounts.turn++;}
 for(const [name,a] of actions){a.play().setEffectiveWeight(0);if(walkNames.includes(name))a.paused=true;else idleWeights.set(name,0);}
 const face=[];let head;root.traverse(o=>{if(o.morphTargetDictionary)face.push(o);if(o.isBone&&o.name==='Head')head=o;if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;}});
 function play(name,fade=.8){if(name===active||!actions.has(name))return;const a=actions.get(name);a.reset().setEffectiveTimeScale(1).play();if(!active)idleWeights.set(name,1);active=name;}
 play(order[0],0);
 function setMode(value){mode=value;next=clock+6;if(value!=='auto')play(value);else play(order[index%order.length]);}
 function react(name,seconds=3){if(mode!=='auto')return;reactName=name;reactUntil=clock+seconds;play(name,.5);}
 function update(dt,state,camera,motion){clock+=dt;let wanted=mode;
  if(mode==='auto'){if(state.listening)wanted='Listen_Nod';else if(state.speaking||clock<reactUntil)wanted=reactName||'Talk_Gesture';else{if(clock>next){index++;next=clock+6.4+(index%3)*1.2;}wanted=order[index%order.length];}}play(wanted);
  const speed=motion?.velocity.length()||0;
  if(motion&&dt>0){const moving=speed>.025,delta=lastYaw===null?0:Math.atan2(Math.sin(motion.yaw-lastYaw),Math.cos(motion.yaw-lastYaw));
   if(wasMoving&&!moving){accent('Hem_Stop');turnTravel=0;}
   if(Math.abs(delta)/dt>.35)turnTravel+=delta;else turnTravel=0;
   if(Math.abs(turnTravel)>.24&&clock>accentUntil){accent(turnTravel>0?'Hem_Turn_Left':'Hem_Turn_Right');turnTravel=0;}
   lastYaw=motion.yaw;wasMoving=moving;
  }
  if(motion){root.position.copy(motion.position);root.rotation.y=motion.yaw;}
  walkWeight=THREE.MathUtils.damp(walkWeight,speed>.01?1:0,10,dt);
  if(speed>.01){const c=Math.cos(motion.yaw),s=Math.sin(motion.yaw),x=motion.velocity.x*c-motion.velocity.z*s,z=motion.velocity.x*s+motion.velocity.z*c,total=Math.abs(x)+Math.abs(z);
   const weights=[Math.max(0,z),Math.max(0,-z),Math.max(0,-x),Math.max(0,x)];for(let i=0;i<4;i++)walkMix[i]=THREE.MathUtils.damp(walkMix[i],weights[i]/total,12,dt);
   walkPhase=(walkPhase+dt*(Math.abs(x)/.36+Math.abs(z)/.68))%1;
  }
  let idleTotal=0;for(const [name,w]of idleWeights){const value=THREE.MathUtils.damp(w,name===active?1:0,5,dt);idleWeights.set(name,value);idleTotal+=value;}
  for(const [name,w]of idleWeights)actions.get(name).setEffectiveWeight((1-walkWeight)*w/Math.max(idleTotal,.00001));
  for(let i=0;i<4;i++){const a=actions.get(walkNames[i]);if(a){a.setEffectiveWeight(walkWeight*walkMix[i]);a.time=walkPhase*a.getClip().duration;}}
  mixer.update(dt);
  if(clock>blinkAt){blinkStart=clock;blinkAt=clock+3.1+(Math.sin(clock*9.2)+1)*1.7;}
  const t=clock-blinkStart,blink=t<.11?Math.sin(t/.11*Math.PI/2):t<.25?Math.cos((t-.11)/.14*Math.PI/2):0;
  const desired=state.speaking?.75:state.listening?.35:.23+.12*Math.sin(clock*.6);smile=THREE.MathUtils.damp(smile,desired,3,dt);
  for(const o of face){o.morphTargetInfluences[o.morphTargetDictionary.Blink]=Math.max(0,blink);o.morphTargetInfluences[o.morphTargetDictionary.SoftSmile]=smile;}
  // The head's local Y follows its calibrated vertical bone axis.
  if(head&&camera){const delta=camera.position.clone().sub(root.position),angle=Math.atan2(delta.x,delta.z)-root.rotation.y;const yaw=THREE.MathUtils.clamp(Math.atan2(Math.sin(angle),Math.cos(angle)),-.45,.45)*.5;head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw));}
 }
 function snapshot(){return {clock,next,index,blinkAt,blinkStart,smile,reactUntil,reactName,mode,active,walkWeight,walkPhase,walkMix:[...walkMix],idleWeights:[...idleWeights],times:Object.fromEntries([...actions].map(([k,a])=>[k,a.time])),wasMoving,lastYaw,turnTravel,accentUntil,lastAccent,accentCounts:{...accentCounts},accents:[...accents].map(([n,a])=>({name:n,time:a.time,running:a.isRunning()}))};}
 function synchronize(s){clock=s.clock;next=s.next;index=s.index;blinkAt=s.blinkAt;blinkStart=s.blinkStart;smile=s.smile;reactUntil=s.reactUntil;reactName=s.reactName;mode=s.mode;active=s.active;walkWeight=s.walkWeight;walkPhase=s.walkPhase;walkMix.splice(0,4,...s.walkMix);for(const [n,w]of s.idleWeights)idleWeights.set(n,w);for(const [k,t]of Object.entries(s.times))if(actions.has(k))actions.get(k).time=t;
  wasMoving=s.wasMoving;lastYaw=s.lastYaw;turnTravel=s.turnTravel;accentUntil=s.accentUntil;lastAccent=s.lastAccent;Object.assign(accentCounts,s.accentCounts);
  for(const row of s.accents||[]){const a=accents.get(row.name);if(!a)continue;a.stop();if(row.running){a.reset().setEffectiveWeight(1).play();a.time=row.time;}}
  mixer.update(0);
 }
 return{root,mixer,update,setMode,react,snapshot,synchronize,diagnostics:()=>({active:walkWeight>.5?walkNames[walkMix.indexOf(Math.max(...walkMix))]:active,idle:active,mode,walkWeight,walkPhase,position:root.position.toArray(),yaw:root.rotation.y,blink:face[0]?.morphTargetInfluences[face[0].morphTargetDictionary.Blink]||0,smile,clips:[...actions.keys(),...accents.keys()],hem:{active:[...accents].filter(([,a])=>a.isRunning()).map(([n])=>n),last:lastAccent,counts:{...accentCounts}},strideDuration:actions.get('Walk_Forward')?.getClip().duration})};
}
