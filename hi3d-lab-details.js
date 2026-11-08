import * as THREE from 'three';
export function addLabDetails(scene){
 const grainData=new Uint8Array(128*128*4);for(let i=0;i<128*128;i++){const v=110+((i*1664525+1013904223)>>>16)%55;grainData.set([v,v,v,255],i*4);}const grain=new THREE.DataTexture(grainData,128,128);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(12,12);grain.generateMipmaps=true;grain.minFilter=THREE.LinearMipmapLinearFilter;grain.magFilter=THREE.LinearFilter;grain.anisotropy=4;grain.needsUpdate=true;scene.traverse(o=>{if(o.isMesh&&/FloorTitanium|FloorInsets|BrushedMetal/.test(o.name)){o.material.roughnessMap=grain;o.material.needsUpdate=true;}});
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=850;const c=canvas.getContext('2d');
 c.fillStyle='#071821';c.fillRect(0,0,2048,850);c.strokeStyle='#26515b';c.lineWidth=2;
 for(let x=0;x<2048;x+=48){c.beginPath();c.moveTo(x,0);c.lineTo(x,850);c.stroke();}for(let y=0;y<850;y+=48){c.beginPath();c.moveTo(0,y);c.lineTo(2048,y);c.stroke();}
 c.fillStyle='#8adfd7';c.font='30px monospace';c.fillText('NOVA / COGNITIVE SYSTEMS',70,80);c.fillStyle='#749aa8';c.font='18px monospace';c.fillText('LAB 01   /   ENVIRONMENT SIMULATION',70,118);
 for(let i=0;i<4;i++){const x=70+i*490;c.strokeStyle='#315d68';c.strokeRect(x,190,440,560);c.fillStyle='#bde3e5';c.font='23px monospace';c.fillText(['CORE STATUS','NEURAL FIELD','SENSOR ARRAY','POWER GRID'][i],x+25,233);
  if(i===1){for(let r=30;r<180;r+=35){c.beginPath();c.arc(x+220,440,r,0,Math.PI*2);c.strokeStyle='#69c8c7';c.stroke();}for(let j=0;j<24;j++){const a=j*Math.PI/12;c.fillStyle='#d0f6eb';c.fillRect(x+220+Math.cos(a)*140,440+Math.sin(a)*140,4,4);}}
  else{for(let j=0;j<10;j++){c.fillStyle='#20424c';c.fillRect(x+24,285+j*35,390,12);c.fillStyle=j%3?'#5ab7bb':'#ce9c6c';c.fillRect(x+24,285+j*35,120+(j*37+i*41)%250,12);}c.fillStyle='#8ed5d1';c.font='18px monospace';c.fillText('MONITORING / SIMULATED',x+24,690);}}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const display=new THREE.Mesh(new THREE.PlaneGeometry(4.35,1.8),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));display.position.set(0,2.23,-10.85);scene.add(display);
 // A clean, low-cost holographic specimen gives the scan a clear spatial center.
 const core=new THREE.Group();core.position.set(0,1.40,-1);const cyan=new THREE.MeshBasicMaterial({color:0x6de9e0,transparent:true,opacity:.62,depthWrite:false});
 for(let i=0;i<6;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.40+i*.035,.006,5,64),cyan);ring.position.y=.45+i*.16;ring.rotation.x=Math.PI/2+i*.18;core.add(ring);}
 scene.add(core);
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=256;shadowCanvas.height=256;const g=shadowCanvas.getContext('2d'),gradient=g.createRadialGradient(128,128,12,128,128,120);gradient.addColorStop(0,'rgba(0,0,0,.48)');gradient.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gradient;g.fillRect(0,0,256,256);const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.68),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.012,4.1);scene.add(shadow);
 return {update(dt,scanning,assistantPosition,yaw=0){if(assistantPosition){shadow.position.copy(assistantPosition);shadow.position.y+=.012;shadow.rotation.set(-Math.PI/2,0,yaw);}core.rotation.y+=dt*(scanning?.35:.08);cyan.opacity=scanning?.85:.36;},setOverview(value){shadow.visible=!value;}};
}
