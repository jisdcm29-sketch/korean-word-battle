import { requireTeacherAccess, isGameAllowedForAccess, logoutTeacher } from './access-control.js?v=1.3';

const access=await requireTeacherAccess({game:'arena'});
const gameNames={word:'어휘 배틀',sentence:'문장 배틀',matching:'카드 매칭',memory:'기억력 배틀',combined:'종합 배틀'};
document.querySelectorAll('.game-card[data-game]').forEach(card=>{
  const game=card.dataset.game;
  if(!isGameAllowedForAccess(access,game)){
    card.disabled=true;card.classList.remove('active');card.style.opacity='.35';card.title=`${gameNames[game]||game} 사용 권한이 없습니다.`;
  }
});
const bar=document.createElement('div');
bar.className='platform-access-bar';
bar.innerHTML=`<span>🔐 <b>${String(access.teacherName||'교사').replace(/[<>&]/g,'')}</b> · ${access.accessLevel==='FULL'?'전체 권한':'외부 교사 사용권'}</span><button type="button">인증 종료</button>`;
Object.assign(bar.style,{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',margin:'0 auto 10px',maxWidth:'1120px',padding:'8px 12px',borderRadius:'12px',background:'rgba(11,31,70,.72)',border:'1px solid rgba(97,214,255,.22)',color:'#dff6ff',font:'600 12px system-ui,sans-serif'});
const btn=bar.querySelector('button');Object.assign(btn.style,{border:'1px solid rgba(255,255,255,.18)',background:'rgba(255,255,255,.06)',color:'#fff',borderRadius:'10px',padding:'6px 10px',cursor:'pointer'});
btn.addEventListener('click',async()=>{await logoutTeacher();location.replace('index.html');});
document.querySelector('.platform-shell')?.prepend(bar);
document.documentElement.style.visibility='visible';
