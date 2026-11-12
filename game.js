(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = 480, H = 270, floor = 220;
  const $ = (s) => document.querySelector(s);
  const ui = { start: $('#startBtn'), announce: $('#announce'), result: $('#result'), resultTitle: $('#resultTitle'), resultText: $('#resultText'), again: $('#againBtn'), timer: $('#timer'), combo: $('#comboBadge'), tip: $('#swipeTip'), sound: $('#soundBtn') };
  let running = false, ended = false, last = performance.now(), elapsed = 60, shake = 0, soundOn = true, audio;
  let player, enemy, particles = [], texts = [], trail = [], pointer = null, combo = 0, comboTimer = 0, aiWait = 1.1, bgTime = 0;

  function fighter(x, side) { return { x, y: floor, side, hp: 100, energy: 55, vx: 0, vy: 0, facing: side === 'player' ? 1 : -1, state: 'idle', stateTime: 0, stun: 0, attack: null, slideTime: 0, hurtFlash: 0, anim: 0 }; }
  function reset() { player = fighter(155, 'player'); enemy = fighter(326, 'enemy'); particles = []; texts = []; trail = []; combo = 0; comboTimer = 0; elapsed = 60; ended = false; running = true; aiWait = .9; shake = 0; ui.timer.textContent = '60'; ui.announce.classList.add('hidden'); ui.result.classList.add('hidden'); ui.tip.style.opacity = '1'; }
  function beep(freq = 180, duration = .08, type = 'square', volume = .035) { if (!soundOn) return; try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.setValueAtTime(freq, audio.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(50, freq * .58), audio.currentTime + duration); g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration); } catch (_) {} }
  function endGame(won) { if (ended) return; ended = true; running = false; ui.resultTitle.textContent = won ? 'K.O.' : 'WIPEOUT'; ui.resultText.textContent = won ? 'You own this arena. Nice work, Runner.' : 'Glitch took the round. Get back in there.'; ui.result.classList.remove('hidden'); beep(won ? 520 : 110, .28, 'sawtooth', .045); }
  function popText(x, y, text, color = '#fff') { texts.push({ x, y, text, color, life: .72, max: .72 }); }
  function burst(x, y, color, count = 10) { for (let i=0;i<count;i++) { const a = Math.random()*Math.PI*2, s=35+Math.random()*115; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-25,life:.25+Math.random()*.38,max:.63,color,size:2+Math.random()*3}); } }
  function attack(f, target, type, dx, dy, power) {
    if (!running || f.stun > 0) return;
    const facing = f === player ? (target.x >= f.x ? 1 : -1) : (target.x >= f.x ? 1 : -1); f.facing = facing;
    const len = Math.min(1, power); const cost = f === player ? 7 : 0;
    if (f.energy < cost) return;
    f.energy -= cost; f.attack = { type, time: 0, duration: type === 'launch' ? .48 : .34, hit: false, power: .7 + len*.75, dir: Math.sign(dx) || facing };
    f.state = type; f.stateTime = 0; f.vx = (Math.sign(dx) || facing) * (75 + 145*len); f.vy = type === 'launch' ? -105*len : type === 'slam' ? 48*len : -8;
    if (f === player) ui.tip.style.opacity = '0';
    beep(type === 'launch' ? 310 : type === 'slam' ? 125 : 220, .09 + len*.06, type === 'slam' ? 'triangle' : 'square', .025 + len*.014);
  }
  function playerSwipe(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx,dy); if (dist < 18) return;
    if (Math.abs(dy) > Math.abs(dx) * .76) {
      if (dy < 0) {
        if (player.y < floor || player.attack || player.stun > 0) return;
        player.slideTime = 0; player.state = 'jump'; player.stateTime = 0; player.vy = -330;
        if (Math.abs(dx) > 10) player.facing = Math.sign(dx);
        player.vx += player.facing * 78; popText(player.x, player.y - 62, 'JUMP!', '#ffcf56'); beep(390,.11,'square',.03);
      } else {
        if (player.y < floor || player.attack || player.stun > 0) return;
        player.slideTime = .62; player.state = 'slide'; player.stateTime = 0;
        if (Math.abs(dx) > 10) player.facing = Math.sign(dx);
        player.vx = player.facing * 165; popText(player.x, player.y - 36, 'SLIDE!', '#62e4d7'); beep(155,.13,'triangle',.03);
      }
      ui.tip.style.opacity = '0';
      return;
    }
    const power = Math.max(.18, Math.min(1, dist / 155));
    // A horizontal swipe carries Byte a short distance, like a slingshot.
    const dir = dx ? Math.sign(dx) : player.facing; player.x = clamp(player.x + dx*.20, 35, 445); player.facing = dir;
    attack(player, enemy, 'jab', dx, dy, power);
    if (comboTimer > 0) combo++; else combo = 1; comboTimer = 1.05;
    if (combo >= 2) { ui.combo.textContent = `${combo} HIT COMBO`; ui.combo.classList.add('show'); setTimeout(()=>ui.combo.classList.remove('show'),650); }
    if (combo >= 3) { player.energy = Math.min(100, player.energy + 5); popText(player.x, player.y-65, 'FLOW +', '#61e4d7'); }
  }
  function updateFighter(f, dt) {
    f.anim += dt; f.stateTime += dt; f.stun = Math.max(0, f.stun-dt); f.hurtFlash = Math.max(0, f.hurtFlash-dt);
    f.slideTime = Math.max(0, f.slideTime - dt);
    if (!f.attack && f !== enemy) f.energy = Math.min(100, f.energy + dt*3.5);
    if (f.attack) {
      const a = f.attack; a.time += dt;
      if (!a.hit && a.time > .11) {
        a.hit = true;
        const target = f === player ? enemy : player, reach = a.type === 'launch' ? 73 : 63;
        if (Math.abs(target.x-f.x) < reach && Math.abs(target.y-f.y) < 70 && !(target === player && (target.slideTime > 0 || (target.state === 'jump' && target.y < floor - 24))) && (target.x-f.x)*f.facing > -15) {
          const damage = Math.round((f === player ? 8 : 7) * a.power * (a.type === 'launch' ? 1.15 : 1));
          target.hp = Math.max(0, target.hp-damage); target.hurtFlash=.18; target.stun=.22; target.vx=f.facing*(a.type === 'slam'?175:115)*a.power; target.vy=a.type==='launch'?-155*a.power:a.type==='slam'?85: -35;
          burst(target.x,target.y-27,a.type==='launch'?'#ffcf56':f===player?'#ff5267':'#aa91ff',10); shake=4; popText(target.x,target.y-49,`-${damage}`,a.type==='launch'?'#ffcf56':'#fff');
          if (f===player) { player.energy=Math.min(100,player.energy+12); beep(120,.12,'square',.045); } else beep(95,.1,'sawtooth',.035);
          if (target.hp<=0) endGame(f===player);
        } else if (f===player) popText(f.x+f.facing*25,f.y-43,'WHIFF','#a9aebe');
      }
      if (a.time >= a.duration) { f.attack=null; f.state='idle'; }
    }
    f.vx *= Math.pow(.025,dt); f.vy += 500*dt; f.x += f.vx*dt; f.y += f.vy*dt;
    if (f.y > floor) { f.y=floor; f.vy=0; } f.x=clamp(f.x,22,458);
    if (!f.attack && f.stun<=0) f.state = f.slideTime > 0 ? 'slide' : f.y < floor ? 'jump' : 'idle';
  }
  function update(dt) {
    bgTime += dt; if (running) { elapsed -= dt; if (elapsed <= 0) { elapsed=0; ui.timer.textContent='00'; endGame(player.hp>=enemy.hp); } else ui.timer.textContent=String(Math.ceil(elapsed)).padStart(2,'0');
      comboTimer=Math.max(0,comboTimer-dt); updateFighter(player,dt); updateFighter(enemy,dt);
      if (running) { aiWait-=dt; if (aiWait<=0 && !enemy.attack && enemy.stun<=0) { const delta=player.x-enemy.x, distance=Math.abs(delta); enemy.facing=Math.sign(delta)||-1; if (distance>57) { enemy.vx += Math.sign(delta)*100; enemy.state='run'; } else attack(enemy,player,Math.random()<.22?'launch':'jab',delta,0,.4+Math.random()*.4); aiWait=.55+Math.random()*.5; }
        if (!enemy.attack && enemy.stun<=0 && Math.abs(player.x-enemy.x)>62) { enemy.vx += Math.sign(player.x-enemy.x)*20*dt; }
        // Keep fighters from passing through one another.
        if (Math.abs(player.x-enemy.x)<23 && player.y===floor && enemy.y===floor) { const sign=Math.sign(player.x-enemy.x)||1; player.x+=sign*.4; enemy.x-=sign*.4; }
      }
    }
    for (const p of particles) {p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;p.life-=dt;} particles=particles.filter(p=>p.life>0);
    for (const t of texts) {t.y-=22*dt;t.life-=dt;} texts=texts.filter(t=>t.life>0);
    trail=trail.filter(p=>performance.now()-p.t<270); shake=Math.max(0,shake-22*dt);
  }
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function drawBackground(){
    rect(0,0,W,H,'#202537');
    // Distant neon skyline
    rect(0,42,W,95,'#22283a');
    for(let i=0;i<14;i++){let x=i*39-4, h=25+((i*37)%56);rect(x,135-h,31,h,'#252b3e');rect(x+4,138-h,24,h-3,'#1c2232');for(let j=0;j<3;j++)for(let k=0;k<2;k++)if((i+j+k)%3)rect(x+5+k*10,143-h+j*12,3,4,i%2?'#654e70':'#40516a');}
    // Rift sign and glowing moon
    ctx.fillStyle='#ff5374';ctx.globalAlpha=.16;ctx.beginPath();ctx.arc(362,75,35,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;rect(350,58,24,2,'#f35277');rect(355,63,18,2,'#f35277');rect(345,68,31,2,'#f35277');
    // overhead cables
    rect(0,33,W,1,'#414057');rect(34,28,2,13,'#414057');rect(198,29,2,10,'#414057');rect(419,27,2,15,'#414057');
    rect(0,158,W,1,'#3b4050');
    // arena wall
    rect(0,158,W,62,'#272d3c');for(let x=0;x<W;x+=32){rect(x,158,1,62,'#33394a');rect(x+16,179,1,41,'#33394a');}for(let y=169;y<220;y+=21)rect(0,y,W,1,'#33394a');
    // signage
    rect(31,174,79,17,'#171c29');rect(33,176,75,1,'#df4b62');rect(39,180,4,4,'#ffcb59');rect(47,180,52,2,'#b3a5a9');rect(47,184,39,2,'#626b7e');
    rect(370,171,76,21,'#1b202e');rect(374,175,68,1,'#53d4c7');rect(377,180,20,2,'#d7c9a9');rect(401,180,36,2,'#6f7a8a');rect(377,185,48,2,'#6f7a8a');
    // floor
    rect(0,floor,W,H-floor,'#343746');rect(0,floor,W,2,'#737184');rect(0,floor+5,W,H-floor-5,'#292d3a');
    for(let x=0;x<W;x+=40){rect(x,floor+7,1,H-floor-7,'#353949');rect(x+18,239,10,1,'#424554');}
    // perspective floor grid
    for(let i=0;i<8;i++){let x=i*72-35;rect(x,255,1,15,'#383d4b');}
    rect(0,266,W,4,'#1b1e2a');
    // atmospheric sparks
    for(let i=0;i<6;i++){let x=(i*93+Math.floor(bgTime*12)%W)%W;let y=73+(i*29)%82;rect(x,y,1,1,'#677084');}
  }
  function drawFighter(f) {
    const x=Math.round(f.x), y=Math.round(f.y), face=f.facing, attacking=f.attack, bob=(f.state==='idle'?Math.sin(f.anim*5)*1.3:0), by=Math.round(y+bob);
    // shadow
    ctx.globalAlpha=.28;rect(x-17,by+2,35,4,'#0b0e16');ctx.globalAlpha=1;
    if(f.hurtFlash>0 && Math.floor(f.hurtFlash*45)%2===0) return;
    const crouching = f === player && f.slideTime > 0;
    if(crouching){ctx.save();ctx.translate(0,by);ctx.scale(1,.58);ctx.translate(0,-by);}
    if(f.side==='player'){
      const c='#f04e69', dark='#9f304f', skin='#f4bb91', glow='#62e4d7';
      // trailing scarf
      rect(x-face*11,by-48,face*-8,4,glow);rect(x-face*16,by-44,face*-7,3,'#40b8b8');
      // legs / shoes
      rect(x-10,by-15,8,12,'#27324a');rect(x+2,by-15,8,12,'#27324a');rect(x-12,by-4,10,4,'#e7d8c5');rect(x+1,by-4,11,4,'#e7d8c5');
      // body jacket
      rect(x-11,by-37,22,22,c);rect(x-12,by-34,24,10,dark);rect(x-5,by-36,4,15,'#ff9b72');rect(x-10,by-18,20,3,'#202739');
      // arm pose
      if(attacking){rect(x+face*8,by-34,face*10,7,skin);rect(x+face*16,by-36,face*9,8,'#f5d2a2');rect(x-face*15,by-31,face*8,6,dark);}else{rect(x+face*9,by-33,face*7,7,skin);rect(x-face*14,by-31,face*7,7,skin);}
      // head, hair and band
      rect(x-9,by-52,18,16,skin);rect(x-11,by-55,21,8,'#252d42');rect(x-10,by-49,18,3,glow);rect(x+face*3,by-45,3,2,'#18212c');rect(x-face*8,by-53,4,7,'#252d42');
      // accents
      rect(x-7,by-27,5,3,'#ffd56d');
    } else {
      const c='#9277e8', dark='#4d467f', skin='#b4a1db';
      // horns / hood
      rect(x-10,by-53,20,21,c);rect(x-12,by-49,24,12,dark);rect(x-12,by-55,5,9,'#d1a8ff');rect(x+7,by-56,5,10,'#d1a8ff');
      rect(x-7,by-47,15,3,'#ffcf56');rect(x+face*3,by-43,3,2,'#211d37');
      // body and armor
      rect(x-13,by-34,26,19,dark);rect(x-10,by-36,20,14,c);rect(x-14,by-31,7,8,'#f2b94f');rect(x+7,by-31,7,8,'#f2b94f');rect(x-8,by-20,16,4,'#302b4b');
      rect(x-10,by-15,8,12,'#393653');rect(x+2,by-15,8,12,'#393653');rect(x-12,by-4,11,4,'#c6b6d5');rect(x+1,by-4,12,4,'#c6b6d5');
      if(attacking){rect(x+face*12,by-32,face*11,7,skin);rect(x+face*19,by-34,face*8,9,'#ddd0ec');}
    }
    if(crouching)ctx.restore();
    // aura when striking
    if(attacking){let col=f.side==='player'?'#68eee0':'#b29cff';ctx.globalAlpha=.6;rect(x+face*24,by-43,3,3,col);rect(x+face*30,by-36,2,2,col);ctx.globalAlpha=1;}
  }
  function draw() {
    ctx.save(); if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);drawBackground();
    // rear floor glows
    ctx.globalAlpha=.12;rect(55,floor+8,124,2,'#ff4d61');rect(290,floor+8,130,2,'#8c78ff');ctx.globalAlpha=1;
    if(player && enemy){if(player.x<enemy.x){drawFighter(enemy);drawFighter(player)}else{drawFighter(player);drawFighter(enemy)}}
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);rect(p.x,p.y,p.size,p.size,p.color);}ctx.globalAlpha=1;
    for(const t of texts){ctx.globalAlpha=Math.max(0,t.life/t.max);ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillStyle='#11131d';ctx.fillText(t.text,t.x+1,t.y+1);ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);}ctx.globalAlpha=1;
    if(pointer && pointer.points.length>1){ctx.lineCap='square';for(let i=1;i<pointer.points.length;i++){const a=pointer.points[i-1],b=pointer.points[i],fade=i/pointer.points.length;ctx.globalAlpha=fade*.9;ctx.strokeStyle='#ffe07c';ctx.lineWidth=2+(fade*2);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.globalAlpha=1;}
    ctx.restore();
    if(player){document.querySelector('.player-health').style.width=`${player.hp}%`;document.querySelector('.enemy-health').style.width=`${enemy.hp}%`;document.querySelector('.player-energy').style.width=`${player.energy}%`;document.querySelector('.enemy-energy').style.width=`${Math.max(14,enemy.hp*.62)}%`;}
  }
  function frame(now){const dt=Math.min(.035,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(frame)}
  function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointerdown',e=>{if(!running)return; e.preventDefault();canvas.setPointerCapture(e.pointerId);const p=point(e);pointer={id:e.pointerId,start:p,points:[{...p,t:performance.now()}]};});
  canvas.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;e.preventDefault();const p=point(e);pointer.points.push({...p,t:performance.now()});if(pointer.points.length>20)pointer.points.shift();});
  canvas.addEventListener('pointerup',e=>{if(!pointer||e.pointerId!==pointer.id)return;e.preventDefault();const end=point(e);playerSwipe(pointer.start,end);pointer=null;});
  canvas.addEventListener('pointercancel',()=>pointer=null);
  ui.start.addEventListener('click',()=>{reset();beep(330,.12,'square');});ui.again.addEventListener('click',()=>{reset();beep(330,.12,'square');});
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.innerHTML=`♫ <span>SOUND ${soundOn?'ON':'OFF'}</span>`;if(soundOn)beep(400,.06);});
  window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();reset();} });
  player=fighter(155,'player');enemy=fighter(326,'enemy');draw();requestAnimationFrame(frame);
})();
