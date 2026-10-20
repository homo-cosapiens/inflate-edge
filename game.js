(()=>{const c=document.getElementById('game'),g=c.getContext('2d'),S=document.getElementById('score'),T=document.getElementById('time'),L=document.getElementById('lives'),B=document.getElementById('start'),W=400,H=500,cx=200,cy=250;let mode='ready',score=0,lives=3,time=60,r=12,hold=false,src='',pid=null,shrink=0,from=12,last=0,elapsed=0,next=1,blade=null,inv=0,pending=0;
function cancel(){hold=false;src='';pid=null;r=12;shrink=0;pending=0}
function down(s,id){if(mode==='play'&&!hold&&!shrink){hold=true;src=s;pid=id??null}}
function up(){if(!hold)return;hold=false;src='';pid=null;pending=r>=99.5?100:r>=65?35:r>=35?10:0;from=r;shrink=.15}
function start(){mode='play';score=0;lives=3;time=60;r=12;pending=0;cancel();elapsed=0;next=1+Math.random()*1.5;blade=null;inv=0;last=0;B.textContent='リトライ';B.blur()}
function end(){mode='over';cancel();blade=null}
B.addEventListener('click',start);
c.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();down('p',e.pointerId);if(src==='p')try{c.setPointerCapture(e.pointerId)}catch(_){}});
c.addEventListener('pointerup',e=>{if(src==='p'&&pid===e.pointerId)up()});
c.addEventListener('pointercancel',e=>{if((src==='p'&&pid===e.pointerId)||shrink)cancel()});
onkeydown=e=>{if(e.code==='Space'&&!e.repeat&&e.target!==B){e.preventDefault();down('k')}};
onkeyup=e=>{if(e.code==='Space'&&src==='k'){e.preventDefault();up()}};
onblur=()=>{cancel();last=0};document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();last=0});
function tick(dt){if(mode!=='play')return;time-=dt;elapsed+=dt;inv=Math.max(0,inv-dt);if(time<=0){time=0;end();return}if(hold)r=Math.min(100,r+88*dt/1.4);else if(shrink){shrink=Math.max(0,shrink-dt);r=12+shrink/.15*(from-12);if(!shrink)r=12}
if(!blade&&elapsed>=next)blade={y:cy+Math.random()*190-95,x:-30,w:.0,hit:false};
if(blade){if(blade.w<.8)blade.w+=dt;else{blade.x+=620*dt;if(!blade.hit&&Math.abs(blade.x-cx)<r+5){let dx=blade.x-cx,dy=Math.max(Math.abs(blade.y-cy)-18,0);if(r>12.5&&Math.hypot(dx,dy)<r+2&&inv<=0){blade.hit=true;lives--;inv=.45;cancel();if(lives<=0)end()}}if(blade&&blade.x>W+30){blade=null;next=elapsed+1.1+Math.random()*2.2}}}if(mode==='play'&&!shrink&&pending){score+=pending;pending=0}}
function draw(){g.clearRect(0,0,W,H);g.strokeStyle='#17253d';for(let x=20;x<W;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke()}for(let y=10;y<H;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke()}
if(blade){if(blade.w<.8){g.strokeStyle='#ff435f';g.lineWidth=2;g.setLineDash([8,6]);g.beginPath();g.moveTo(16,blade.y);g.lineTo(384,blade.y);g.stroke();g.setLineDash([]);g.fillStyle='#ff7184';g.font='bold 15px system-ui';g.textAlign='center';g.fillText('刃まで '+Math.max(0,.8-blade.w).toFixed(1)+'s',cx,34)}else{g.strokeStyle='#ff3157';g.lineWidth=4;g.shadowColor='#ff1744';g.shadowBlur=14;g.beginPath();g.moveTo(blade.x,blade.y-18);g.lineTo(blade.x,blade.y+18);g.stroke();g.shadowBlur=0}}
g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.fillStyle=inv?'#ffb0c0':'#72f7ff';g.shadowColor='#00dff9';g.shadowBlur=20;g.fill();g.shadowBlur=0;g.strokeStyle='#e5ffff';g.stroke();S.textContent=score;T.textContent=Math.ceil(time);L.textContent=lives;
if(mode!=='play'){g.textAlign='center';g.fillStyle='#eafcff';g.font='bold 23px system-ui';g.fillText(mode==='over'?'ROUND END':'開始を押してスタート',cx,430);if(mode==='over'){g.font='17px system-ui';g.fillText('スコア '+score,cx,462)}}}
function frame(n){requestAnimationFrame(frame);if(document.hidden){last=0;return}let dt=last?Math.min((n-last)/1000,.05):0;last=n;tick(dt);draw()}draw();requestAnimationFrame(frame)})();