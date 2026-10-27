/* Landing loader: waits for fonts and the first hero photo (min 0.9 s, max 3 s), then lifts away
   and hands over to the hero entrance through window.styrkurOpen. Removed from the DOM afterwards (iOS toolbar tint). */
(() => {
  const d = document.documentElement, ldr = document.getElementById('ldr');
  if (!ldr) return;
  if (!d.classList.contains('is-loading')) { ldr.remove(); return; }
  const bar = ldr.querySelector('.ldr__bar i'), img = document.querySelector('.hero__slide.is-active .ph');
  let p = 0; const set = v => { p = Math.max(p, v); bar.style.setProperty('--p', p); };
  set(.15);
  const fonts = document.fonts.ready.then(() => set(.55));
  const photo = (img && img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => set(.9));
  const min = new Promise(r => setTimeout(r, 900)), max = new Promise(r => setTimeout(r, 3000));
  Promise.race([Promise.all([fonts, photo, min]), max]).then(() => {
    set(1);
    setTimeout(() => {
      d.classList.add('is-revealing', 'styrkur-settle');
      setTimeout(() => window.styrkurOpen && window.styrkurOpen(), 380);      // hero title starts while the panel is still lifting
      setTimeout(() => { d.classList.remove('is-loading', 'is-revealing'); ldr.remove(); try { sessionStorage.setItem('styrkur-seen', '1'); } catch (e) {} }, 1150);
      setTimeout(() => d.classList.remove('styrkur-settle'), 2300);
    }, 260);
  });
})();


/* Clinic UI. No network, form storage, URL state, or transfer of group choices. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Map();
  function arrive(el, distance = 12) {
    const previous = animations.get(el);
    const style = getComputedStyle(el);
    const from = previous ? { opacity: style.opacity, transform: style.transform } : { opacity: .35, transform: `translateY(${distance}px)` };
    previous?.cancel();
    if (reduced.matches || !el.animate) return;
    const a = el.animate([from, {opacity:1,transform:'none'}], {duration:400,easing:'cubic-bezier(.77,0,.18,1)'});
    animations.set(el,a); a.onfinish=()=>animations.delete(el);
  }
  reduced.addEventListener('change', () => { if (reduced.matches) { animations.forEach(a=>a.cancel());animations.clear(); } });
  document.querySelectorAll('[data-timetable]').forEach(root => {
    const checks=[...root.querySelectorAll('[data-day]')], filter=root.querySelector('select');
    const days=[...root.querySelectorAll('[data-schedule-day]')];
    let exitLayer=null, exitAnimation=null, layoutAnimation=null;
    const results=root.querySelector('[data-results]');
    function render(animate=true) {
      const oldHeight=results.getBoundingClientRect().height;
      exitAnimation?.cancel();exitLayer?.remove();layoutAnimation?.cancel();
      if(animate&&!reduced.matches){
        exitLayer=results.cloneNode(true);exitLayer.removeAttribute('data-results');exitLayer.inert=true;exitLayer.setAttribute('aria-hidden','true');
        Object.assign(exitLayer.style,{position:'absolute',top:results.offsetTop+'px',left:results.offsetLeft+'px',width:results.offsetWidth+'px',pointerEvents:'none',zIndex:'2'});
        root.append(exitLayer);
      }
      const selected=checks.filter(c=>c.checked).map(c=>c.value); let count=0;
      days.forEach(day => {
        day.hidden=!selected.includes(day.dataset.scheduleDay);let shown=0;
        day.querySelectorAll('[data-group]').forEach(row => {const match=filter.value==='all' || row.dataset.group===filter.value; if(match)shown++; row.hidden=!match || (root.dataset.limit && shown>Number(root.dataset.limit));});
        day.querySelector('.st-day-empty').hidden=shown>0;
        if (!day.hidden) {count+=shown;if(animate) arrive(day.querySelector('ul'),8);}
      });
      root.querySelector('[data-count-status]').textContent=`${count} tímar í birtu vikuskipulagi${root.dataset.limit ? ', hér er sýnt brot úr hverjum degi' : ''}`;
      root.querySelector('[data-empty]').hidden=count>0;
      if(exitLayer){
        const layer=exitLayer;exitAnimation=layer.animate([{opacity:1},{opacity:0}],{duration:180,easing:'cubic-bezier(.22,.7,.2,1)'});exitAnimation.onfinish=()=>layer.remove();
        const height=results.getBoundingClientRect().height;
        layoutAnimation=results.animate([{height:oldHeight+'px'},{height:height+'px'}],{duration:400,easing:'cubic-bezier(.77,0,.18,1)'});
      }
    }
    reduced.addEventListener('change',()=>{if(reduced.matches){exitAnimation?.cancel();exitLayer?.remove();layoutAnimation?.cancel();}});
    checks.forEach(c=>c.addEventListener('change',()=>render()));filter.addEventListener('change',()=>render());
    root.querySelector('[data-reset]').addEventListener('click',()=>{checks.forEach(c=>c.checked=true);filter.value='all';render();});render(false);
  });
  // Native details keep their content mounted through collapse. Reversals start at current height.
  document.querySelectorAll('.prog__i').forEach(details => {
    const summary=details.querySelector('summary');let animation=null, target=details.open;
    summary.addEventListener('click',e=>{
      e.preventDefault();target=!target;summary.setAttribute('aria-expanded',String(target));
      if(reduced.matches){animation?.cancel();details.open=target;details.style.height='';details.style.overflow='';return;}
      const from=details.getBoundingClientRect().height;
      animation?.cancel();details.open=true;details.style.height='';
      const to=target?details.getBoundingClientRect().height:summary.getBoundingClientRect().height;
      details.style.overflow='hidden';summary.setAttribute('aria-expanded',String(target));
      animation=details.animate([{height:from+'px'},{height:to+'px'}],{duration:400,easing:'cubic-bezier(.22,.7,.2,1)'});
      animation.onfinish=()=>{details.open=target;details.style.height='';details.style.overflow='';animation=null;};
      animation.oncancel=()=>{};
    });
    reduced.addEventListener('change',()=>{if(reduced.matches){animation?.cancel();details.open=target;details.style.height='';details.style.overflow='';}});
    if(location.hash===`#${details.id}`) {details.open=true;target=true;summary.setAttribute('aria-expanded','true');}
  });
  const form=document.getElementById('request');if(!form)return;
  const steps=[...form.querySelectorAll('[data-step]')], progress=[...form.querySelectorAll('.st-progress li')];let step=0;
  const back=form.querySelector('[data-back]'),next=form.querySelector('[data-next]'),send=form.querySelector('[data-send]');
  function review(){
    const data=new FormData(form), rows=[['Ég vil',data.get('type')],['Dagar',data.getAll('day').join(', ')||'Skiptir ekki máli'],['Tími dags',data.get('period')]];
    const dl=document.getElementById('review');dl.replaceChildren();
    rows.forEach(([label,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.append(row);});
  }
  let stepLayout=null;
  function show(n){
    const oldHeight=form.getBoundingClientRect().height;stepLayout?.cancel();
    step=n;steps.forEach((el,i)=>{el.hidden=i!==n;el.disabled=i!==n;});
    // Answers stay in this page's memory only: nothing is sent or stored.
    if(n===2){steps.forEach(el=>el.disabled=false);review();steps.forEach((el,i)=>el.disabled=i!==n);}
    progress.forEach((el,i)=>{if(i===n)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
    back.hidden=n===0;next.hidden=n===2;send.hidden=n!==2;
    steps[n].querySelector('legend').focus({preventScroll:true});arrive(steps[n]);
    if(!reduced.matches)stepLayout=form.animate([{height:oldHeight+'px'},{height:form.getBoundingClientRect().height+'px'}],{duration:400,easing:'cubic-bezier(.77,0,.18,1)'});
  }
  next.addEventListener('click',()=>show(step+1));back.addEventListener('click',()=>show(Math.max(0,step-1)));
  form.addEventListener('submit',e=>{e.preventDefault();if(step<2)show(step+1);});
  reduced.addEventListener('change',()=>{if(reduced.matches)stepLayout?.cancel();});
  arrive(steps[0]);
  // An inline onsubmit guard also prevents submission if this script fails to load.
  steps.forEach((el,i)=>el.disabled=i!==0);
})();

/* Native fallback preserves navigation when an external animation dependency fails. */
(() => {
  const root=document.documentElement, nav=document.getElementById('nav'), burger=document.getElementById('burger');
  if (!root.classList.contains('motion-ready')) {
    root.classList.add('motion-fallback');
    const outside=[...document.querySelectorAll('main,footer,header')];
    const set=open=>{root.classList.toggle('menu-open',open);nav.inert=!open;outside.forEach(el=>el.inert=open);burger.setAttribute('aria-expanded',String(open));(open?nav:burger).focus({preventScroll:true});};
    burger.addEventListener('click',()=>set(true));document.getElementById('close').addEventListener('click',()=>set(false));
    nav.addEventListener('keydown',e=>{if(e.key==='Escape')set(false);if(e.key==='Tab'){const list=[...nav.querySelectorAll('a,button')].filter(el=>!el.closest('[inert]'));if(e.shiftKey&&(document.activeElement===nav||document.activeElement===list[0])){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0]?.focus();}}});
    document.getElementById('toTop').addEventListener('click',()=>scrollTo({top:0,behavior:'instant'}));
    document.querySelector('.hero__ctrl')?.setAttribute('hidden','');
    document.querySelectorAll('.hero__text').forEach((el,i)=>el.inert=i!==0);
    document.querySelectorAll('.nav__col,.ftr__nav>div').forEach(c=>c.querySelector('.acc')?.addEventListener('click',()=>{const open=c.classList.toggle('open');c.querySelector('.acc').setAttribute('aria-expanded',String(open));}));
  }
  // Collapsed mobile link lists must not remain keyboard-focusable.
  const sync=()=>document.querySelectorAll('.nav__col,.ftr__nav>div').forEach(c=>{
    const isNav=c.classList.contains('nav__col'), small=innerWidth<=(isNav?1023:519), list=c.querySelector('ul'), b=c.querySelector('.acc');
    list.inert=small&&!c.classList.contains('open');b.setAttribute('aria-expanded',String(!small||c.classList.contains('open')));
    if(!list.id)list.id='links-'+Array.from(document.querySelectorAll('.nav__col,.ftr__nav>div')).indexOf(c);
    b.setAttribute('aria-controls',list.id);
  });
  document.querySelectorAll('.acc').forEach(b=>b.addEventListener('click',()=>queueMicrotask(sync)));addEventListener('resize',sync);sync();
  setTimeout(()=>{if(!root.classList.contains('motion-started'))root.classList.add('motion-fallback');},5000);
})();
