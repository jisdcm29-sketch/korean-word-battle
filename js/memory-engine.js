const shuffle=(arr)=>{
  const out=[...arr];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
};
const cleanText=(v)=>String(v||'').trim().replace(/\s+/g,' ');

export function buildMemoryRounds(items,config={}){
  const raw=(items||[]).map((item,index)=>({id:String(item.id||`v-${index+1}`),ko:cleanText(item.ko),mn:cleanText(item.mn)})).filter(v=>v.ko&&v.mn);
  const exactSeen=new Set();
  const clean=raw.filter((item)=>{const k=`${item.ko.toLowerCase()}\u0000${item.mn.toLowerCase()}`;if(exactSeen.has(k))return false;exactSeen.add(k);return true;});
  const pairsPerRound=Math.max(2,Math.min(10,Number(config.pairsPerRound)||6));
  const roundCount=Math.max(1,Math.min(10,Number(config.roundCount)||3));
  if(clean.length<pairsPerRound)throw new Error(`한 판에 ${pairsPerRound}쌍을 사용하려면 어휘를 최소 ${pairsPerRound}개 선택해야 합니다.`);
  const usage=new Map(clean.map(v=>[v.id,0]));
  const rounds=[];
  for(let r=0;r<roundCount;r++){
    const randomized=shuffle(clean).sort((a,b)=>(usage.get(a.id)||0)-(usage.get(b.id)||0));
    const usedKo=new Set(),usedMn=new Set(),selected=[];
    for(const item of randomized){
      const kk=item.ko.toLowerCase(),mk=item.mn.toLowerCase();
      if(usedKo.has(kk)||usedMn.has(mk))continue;
      selected.push(item);usedKo.add(kk);usedMn.add(mk);
      if(selected.length>=pairsPerRound)break;
    }
    if(selected.length<pairsPerRound)throw new Error(`현재 선택한 어휘에는 뜻이 중복되는 항목이 많아 한 판 ${pairsPerRound}쌍을 만들 수 없습니다. 카드 쌍 수를 줄이거나 어휘를 더 선택해 주세요.`);
    selected.forEach(v=>usage.set(v.id,(usage.get(v.id)||0)+1));
    const cards=[];
    selected.forEach((item,i)=>{
      const pairId=`m${r+1}-p${i+1}-${item.id}`;
      cards.push({id:`${pairId}-ko`,pairId,lang:'ko',text:item.ko,sourceId:item.id});
      cards.push({id:`${pairId}-mn`,pairId,lang:'mn',text:item.mn,sourceId:item.id});
    });
    rounds.push({id:`memory-round-${r+1}`,number:r+1,pairs:selected.map((item,i)=>({pairId:`m${r+1}-p${i+1}-${item.id}`,ko:item.ko,mn:item.mn,sourceId:item.id})),cards:shuffle(cards)});
  }
  return {rounds,roundCount,pairsPerRound,createdAt:Date.now()};
}

export function calculateMemoryPairScore(attemptNumber=1,combo=1,remainingRatio=0){
  const n=Math.max(1,Number(attemptNumber)||1);
  const base=n<=1?100:n===2?80:n===3?65:n===4?50:35;
  const comboBonus=Math.min(30,Math.max(0,(Number(combo)-1)*10));
  const timeBonus=Math.floor(40*Math.max(0,Math.min(1,Number(remainingRatio)||0)));
  return base+comboBonus+timeBonus;
}

export function memoryCompletionBonus(rank=1){
  const r=Math.max(1,Number(rank)||1);
  if(r===1)return 200;if(r===2)return 150;if(r===3)return 120;if(r===4)return 100;if(r===5)return 80;
  return Math.max(20,70-(r-6)*10);
}

export function memoryGameProgress(room,atMs=Date.now()){
  const total=Math.max(1,Number(room?.memory?.roundCount||room?.config?.roundCount||1));
  const index=Math.max(0,Number(room?.roundIndex||0));
  if(room?.status==='finished')return 1;
  if(['lobby','countdown','preview'].includes(room?.status))return Math.min(1,index/total);
  if(room?.status==='round-result')return Math.min(1,(index+1)/total);
  const start=Number(room?.roundStartAt||0),end=Number(room?.roundEndAt||0);
  const f=end>start?Math.max(0,Math.min(1,(Number(atMs)-start)/(end-start))):0;
  return Math.min(1,(index+f)/total);
}

export function isMemoryBlind(room,atMs=Date.now()){
  return memoryGameProgress(room,atMs)>=0.70&&room?.status!=='finished';
}
