// Presentation only. Existing game code still controls screen transitions.
(() => {
  const entry=document.getElementById('joinView');
  if (!entry) return;
  const sync=()=>{
    const active=!entry.hidden&&!entry.classList.contains('hidden')&&!entry.classList.contains('combined-off');
    if(document.body.classList.contains('kga-entry-active')!==active)document.body.classList.toggle('kga-entry-active',active);
  };
  sync();
  const observer=new MutationObserver(sync);
  observer.observe(entry,{attributes:true,attributeFilter:['class','hidden']});
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
})();
