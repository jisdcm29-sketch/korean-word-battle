const FALLBACK_SYLLABLES=Array.from('가나다라마바사아자차카타파하거너더러머버서어저고노도로모보소오조구누두루무부수우주기니디리미비시이지학교친구선생님한국어공부시간사람집밥물책방문날');

export function normalizeSearchWord(value){
  return Array.from(String(value??'').normalize('NFC')).filter(ch=>/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch)).join('');
}
function shuffle(input){
  const out=[...input];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
const ALL_DIRECTIONS=[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
function directionSet(){
  // V1.2: every round uses all 8 directions: horizontal, vertical, diagonal and reverse.
  return ALL_DIRECTIONS;
}

export function buildGridSizePlan(value,{roundCount=3,min=5,max=10}={}){
  const count=Math.max(1,Number(roundCount)||3);
  const text=String(value??'auto-5');
  if(text.startsWith('auto-')){
    const start=Math.max(min,Math.min(max,Number(text.split('-')[1])||5));
    return Array.from({length:count},(_,i)=>Math.min(max,start+i));
  }
  const fixed=Math.max(min,Math.min(max,Number(text)||7));
  return Array.from({length:count},()=>fixed);
}

function canPlace(grid,size,letters,row,col,dr,dc){
  const endR=row+dr*(letters.length-1),endC=col+dc*(letters.length-1);
  if(endR<0||endR>=size||endC<0||endC>=size)return false;
  for(let i=0;i<letters.length;i++){
    const r=row+dr*i,c=col+dc*i,old=grid[r][c];
    if(old&&old!==letters[i])return false;
  }
  return true;
}
function placeOne(grid,size,target,directions){
  const letters=Array.from(target.koNorm);
  const tries=[];
  for(const [dr,dc] of shuffle(directions)){
    for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(canPlace(grid,size,letters,r,c,dr,dc))tries.push([r,c,dr,dc]);
  }
  if(!tries.length)return null;
  const [row,col,dr,dc]=tries[Math.floor(Math.random()*tries.length)];
  const cells=[];
  letters.forEach((letter,i)=>{const r=row+dr*i,c=col+dc*i;grid[r][c]=letter;cells.push(r*size+c);});
  return {id:target.id,cells};
}
function buildRound(targets,roundIndex,size){
  const directions=directionSet(roundIndex);
  for(let attempt=0;attempt<80;attempt++){
    const grid=Array.from({length:size},()=>Array(size).fill(''));
    const placements=[];
    const ordered=[...targets].sort((a,b)=>b.koNorm.length-a.koNorm.length);
    let ok=true;
    for(const t of ordered){const p=placeOne(grid,size,t,directions);if(!p){ok=false;break;}placements.push(p);}
    if(!ok)continue;
    const pool=[...targets.flatMap(t=>Array.from(t.koNorm)),...FALLBACK_SYLLABLES];
    for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(!grid[r][c])grid[r][c]=pool[Math.floor(Math.random()*pool.length)];
    return {
      id:`search-r${roundIndex+1}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,
      number:roundIndex+1,
      size,
      difficulty:'8-DIR',
      grid:grid.flat(),
      targets:targets.map(t=>({id:t.id,ko:t.ko,koNorm:t.koNorm,mn:t.mn})),
      placements
    };
  }
  throw new Error('단어 찾기 글자판을 만들지 못했습니다. 다른 어휘를 선택해 주세요.');
}
export function eligibleWordSearchItems(items,{size=7}={}){
  const base=(items||[]).map((v,i)=>({id:String(v.id||`w${i+1}`),ko:String(v.ko||'').trim(),mn:String(v.mn||'').trim(),koNorm:normalizeSearchWord(v.ko)})).filter(v=>v.ko&&v.mn&&v.koNorm.length>=2&&v.koNorm.length<=size);
  if(base.length>=6)return base;
  return (items||[]).map((v,i)=>({id:String(v.id||`w${i+1}`),ko:String(v.ko||'').trim(),mn:String(v.mn||'').trim(),koNorm:normalizeSearchWord(v.ko)})).filter(v=>v.ko&&v.mn&&v.koNorm.length>=1&&v.koNorm.length<=size);
}
export function buildWordSearchRounds(items,{roundCount=3,wordsPerRound=6,size=7,sizes=null}={}){
  const count=Math.max(1,Number(roundCount)||3);
  const plan=Array.isArray(sizes)&&sizes.length
    ? Array.from({length:count},(_,i)=>Math.max(5,Math.min(10,Number(sizes[i]??sizes[sizes.length-1])||7)))
    : Array.from({length:count},()=>Math.max(5,Math.min(10,Number(size)||7)));
  const rounds=[];
  const used=new Set();
  for(let r=0;r<count;r++){
    const roundSize=plan[r];
    const eligible=eligibleWordSearchItems(items,{size:roundSize});
    if(eligible.length<wordsPerRound)throw new Error(`ROUND ${r+1}의 ${roundSize}×${roundSize} 글자판에 사용할 수 있는 한국어 어휘가 ${wordsPerRound}개 이상 필요합니다.`);
    // Smaller boards favor shorter words so 5×5/6×6 rounds remain readable and reliably placeable.
    const preferred=shuffle(eligible.filter(v=>!used.has(v.id))).sort((a,b)=>a.koNorm.length-b.koNorm.length+Math.random()-.5);
    const fallback=shuffle(eligible).sort((a,b)=>a.koNorm.length-b.koNorm.length+Math.random()-.5);
    const picked=[];
    for(const v of [...preferred,...fallback]){
      if(picked.some(x=>x.id===v.id))continue;
      picked.push(v);
      if(picked.length>=wordsPerRound)break;
    }
    picked.forEach(v=>used.add(v.id));
    rounds.push(buildRound(picked,r,roundSize));
  }
  return {rounds,roundCount:count,wordsPerRound,size:plan[0],sizes:plan};
}
export function calculateWordSearchScore({roundTime=60,remainingMs=0,combo=0}={}){
  const total=Math.max(1000,Number(roundTime)*1000);
  const ratio=Math.max(0,Math.min(1,Number(remainingMs)/total));
  return Math.round(500+ratio*500+Math.min(8,Math.max(0,Number(combo)))*75);
}
export function reverseText(value){return Array.from(String(value||'')).reverse().join('');}
