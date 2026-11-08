import * as THREE from 'three';

// Static collision samples are cached; path searches run at most twice per second.
// This controller owns the world position. Animation never moves the world root.
export function createFollowController({position,standable,clearSegment}){
 const step=.4,minX=-7.6,minZ=-10.4,nx=39,nz=53,cache=new Map(),edges=new Map();
 const velocity=new THREE.Vector3(),goal=new THREE.Vector3(),lastPlayer=new THREE.Vector3(Infinity,0,0);
 let yaw=0,lastYaw=Infinity,timer=0,path=[],distance=2.4,status='waiting',moving=false,searches=0,blocked=0,lastMoving=false,giveWaySide=1,gaitSpeed=0;
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 const point=i=>new THREE.Vector3(minX+(i%nx)*step,0,minZ+Math.floor(i/nx)*step);
 function cell(x,z){const ix=Math.round((x-minX)/step),iz=Math.round((z-minZ)/step);return ix<0||ix>=nx||iz<0||iz>=nz?-1:iz*nx+ix;}
 function sample(i){if(i<0)return null;if(!cache.has(i)){const p=point(i),y=standable(p.x,p.z);cache.set(i,y);}return cache.get(i);}
 function at(i){const p=point(i);p.y=sample(i)||0;return p;}
 function playerClear(a,b,p,r=.88){const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(a.x+t*dx-p.x,a.z+t*dz-p.z)>=r;}
 function clear(a,b,p){return playerClear(a,b,p)&&clearSegment(a,b);}
 function nearest(p,player){const center=cell(p.x,p.z);if(center<0)return -1;const candidates=[];for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++){const ix=center%nx+x,iz=Math.floor(center/nx)+z;if(ix<0||ix>=nx||iz<0||iz>=nz)continue;const i=iz*nx+ix;if(sample(i)!==null){const q=at(i);if(clear(p,q,player))candidates.push([i,q.distanceToSquared(p)]);}}candidates.sort((a,b)=>a[1]-b[1]);return candidates[0]?.[0]??-1;}
 function gridPath(start,target,player){
  const s=nearest(start,player),g=nearest(target,player);if(s<0||g<0)return null;
  const open=[s],cost=new Map([[s,0]]),parents=new Map(),closed=new Set();
  const h=i=>Math.hypot((i%nx)-(g%nx),Math.floor(i/nx)-Math.floor(g/nx));
  while(open.length){let best=0;for(let k=1;k<open.length;k++)if(cost.get(open[k])+h(open[k])<cost.get(open[best])+h(open[best]))best=k;
   const i=open.splice(best,1)[0];if(i===g){const nodes=[target.clone()];let n=g;while(n!==s){nodes.push(at(n));n=parents.get(n);}nodes.push(at(s));return nodes.reverse();}closed.add(i);
   const ix=i%nx,iz=Math.floor(i/nx),a=at(i);
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dz||ix+dx<0||ix+dx>=nx||iz+dz<0||iz+dz>=nz)continue;
    const j=(iz+dz)*nx+ix+dx;if(closed.has(j)||sample(j)===null)continue;
    if(dx&&dz&&(sample(iz*nx+ix+dx)===null||sample((iz+dz)*nx+ix)===null))continue;
    const b=at(j);if(!playerClear(a,b,player))continue;
    const key=i<j?i+':'+j:j+':'+i;if(!edges.has(key))edges.set(key,clearSegment(a,b));if(!edges.get(key))continue;
    const next=cost.get(i)+Math.hypot(dx,dz);if(next<(cost.get(j)??Infinity)){cost.set(j,next);parents.set(j,i);if(!open.includes(j))open.push(j);}
   }
  }return null;
 }
 function plan(player){
  searches++;path=[];const candidates=[];
  const walking=(player.intent?.lengthSq()||0)>.1;
  const side=new THREE.Vector3(walking?-player.intent.z:0,0,walking?player.intent.x:0);
  if(walking&&!lastMoving){const relative=position.clone().sub(player.position).dot(side);giveWaySide=relative<-.1?-1:1;}
  for(const a of [0,.32,-.32,.65,-.65,.95,-.95,1.25,-1.25])for(const d of [distance,Math.max(1.3,distance-.5),Math.max(1.15,distance-1)]){
   const angle=player.yaw+a,p=new THREE.Vector3(player.position.x-Math.sin(angle)*d,0,player.position.z-Math.cos(angle)*d);if(walking)p.addScaledVector(side,giveWaySide*1.25);const y=standable(p.x,p.z);if(y===null)continue;p.y=y;
   if(!clearSegment(player.position,p))continue;
   candidates.push({p,score:Math.abs(a)*2+Math.abs(distance-d)*1.6+position.distanceTo(p)*.025});
  }
  candidates.sort((a,b)=>a.score-b.score);
  for(const c of candidates.slice(0,12)){
   const route=clear(position,c.p,player.position)?[c.p]:gridPath(position,c.p,player.position);
   if(route){goal.copy(c.p);path=route;status='approaching';break;}
  }
  if(!path.length){goal.copy(position);status='waiting-for-path';}
  lastPlayer.copy(player.position);lastYaw=player.yaw;lastMoving=walking;timer=.6;
 }
 function update(dt,player,enabled){
  const targetYaw=Math.atan2(player.position.x-position.x,player.position.z-position.z);
  if(enabled)yaw+=THREE.MathUtils.clamp(wrap(targetYaw-yaw)*(1-Math.exp(-8*dt)),-3.2*dt,3.2*dt);
  velocity.set(0,0,0);if(!enabled){moving=false;gaitSpeed=0;return;}
  timer-=dt;
  const walking=(player.intent?.lengthSq()||0)>.1;
  if(walking!==lastMoving||(timer<=0&&(lastPlayer.distanceToSquared(player.position)>.04||Math.abs(wrap(lastYaw-player.yaw))>.10||status==='waiting-for-path')))plan(player);
  // Keep a settled target until the player moves; the deadband avoids tiny corrective steps.
  while(path.length&&Math.hypot(path[0].x-position.x,path[0].z-position.z)<(path.length===1?.11:.15))path.shift();
  if(path.length){
   for(let i=path.length-1;i>0;i--)if(clear(position,path[i],player.position)){path.splice(0,i);break;}
   const target=path[0],delta=target.clone().sub(position);delta.y=0;const remaining=delta.length();delta.normalize();
   const lx=delta.x*Math.cos(yaw)-delta.z*Math.sin(yaw),lz=delta.x*Math.sin(yaw)+delta.z*Math.cos(yaw);
   const nominal=1/(Math.abs(lx)/.36+Math.abs(lz)/.68);
   const speed=Math.min(nominal,path.length===1?Math.sqrt(2*1.4*Math.max(.001,remaining-.105)):nominal);
   gaitSpeed+=THREE.MathUtils.clamp(speed-gaitSpeed,-1.4*dt,1.25*dt);
   const amount=Math.min(remaining,gaitSpeed*dt,Math.max(.03,Math.hypot(goal.x-position.x,goal.z-position.z)));
   const next=position.clone().addScaledVector(delta,amount);const y=standable(next.x,next.z);
   if(y!==null&&clear(position,next,player.position)){
    next.y=y;velocity.copy(next).sub(position).divideScalar(Math.max(dt,.001));position.copy(next);blocked=0;status='approaching';
   }else{gaitSpeed=0;blocked+=dt;if(blocked>.18){path=[];status='waiting-for-path';timer=Math.min(timer,.2);}}
  }else{gaitSpeed=0;if(status!=='waiting-for-path')status='at-player';}
  moving=velocity.lengthSq()>.0001;
 }
 return{update,position,velocity,get yaw(){return yaw;},setDistance(value){distance=value;lastPlayer.x=Infinity;timer=0;},invalidate(){lastPlayer.x=Infinity;timer=0;path=[];},diagnostics:()=>({status,moving,yaw,distance,speed:velocity.length(),velocity:velocity.toArray(),goal:goal.toArray(),waypoints:path.map(p=>p.toArray()),searches,cachedCells:cache.size})};
}
