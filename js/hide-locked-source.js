// Arena launches carry the chosen source in the URL. Keep the existing game
// setup logic intact while removing the repeated source choice from its UI.
const source=new URLSearchParams(location.search).get('source');
let selected=null;
try{selected=localStorage.getItem('kwb_arena_source_v1');}catch{}
const field=document.getElementById('sourceType');
if(field&&source&&source===selected&&[...field.options].some(option=>option.value===source)){
  field.value=source;
  field.closest('label')?.classList.add('hidden');
}

// Keep the late-entry QR in the same bottom-left position used by the live Arena screens.
const moveLateJoinLeft=()=>document.getElementById('kwbLateJoinPanel')?.classList.add('left');
moveLateJoinLeft();
const qrObserver=new MutationObserver(moveLateJoinLeft);
qrObserver.observe(document.documentElement,{subtree:true,childList:true});
