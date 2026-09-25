// Sentence Battle card-unit rules v1.0
// Pedagogy baseline:
// 1) Noun + particles stay as separate cards.
// 2) Adverbs stay independent.
// 3) Predicate/connective endings stay attached to the verb/adjective stem.
// 4) Multiword sentence-final grammar such as -(으)ㄹ 거예요 / -(으)ㄹ 수 있다
//    is presented as one predicate chunk.
// 5) Interrogative punctuation belongs to the final predicate card.

const RESPONSE_PREFIX_RE=/^(?:네|아니요|아니오)\s*[,，]\s*/;
const PARTICLES=['에서','에게','한테','께','부터','까지','으로','보다','처럼','하고','은','는','이','가','을','를','에','도','만','와','과','로','의'];
const COPULAS=['입니다','입니까','이에요','예요'];
const PUNCT_RE=/[.。!！?？]+$/g;

// These are words that the old suffix splitter divided even though the apparent
// suffix is part of the lexical word or of a predicate/connective ending.
const FORCE_JOIN_WORDS=new Set([
  '가다가','갔다가','걷다가','먹다가','보다가','사다가','오다가','자다가','입었다가','껐다가','썼다가','쓰려다가','데다가','게다가',
  '나가','담가','함께','전라도','떡볶이','에이','휴가','까만','속도','정도','년도','따로','대로','차례대로',
  '가도','기다려도','써도','여쭤봐도','와서도','덥지도','춥지도','추울지도','쓰는데도','단어인데도','바쁘신데도','비싼데도','고프더라도','지더라도',
  '라면이라도','옷이라도','자전거라도','설악산이라도','찬밥이라도','아쉽게도','불구하고',
  '부른다는','좋다는','많다는','먹기는','맛있기는','멀쩡하지는','좋아하지는','하겠다고는','좋다기보다는',
  '짧은','젊은','밝은','같은','맡은','부은','들은','끼는','내리는','노는','다니는','드는','따지는','맡기는','사귀는','싸우는','아는','어두워지는','화내는',
  '고장인가','공휴일인가','시간인가','그런가','많은가','배고픈가','주는가','행복한가',
  '먹을','받을','있을','좋을','어렸을','믿을','늦을','읽을','작을','끝났을','닫을','앉을','않을','스트레스받을','웃을','맛있을','재미없을','소용없을','없을','갔을','왔을','괜찮을','그랬을','만났을','도착했을','먹었을',
  '아이','나이','없이','어른같이','달리','삼만','많이','별로','주로','서로','바로','새로','제대로'
]);
const HADA_CONNECTIVE_BASES=new Set(['공부','요리','이사','전화','지각','운동','청소','일','말','사용','정리','준비','시작','연습','여행','생각','걱정','설명','신청']);

function cleanText(v){return String(v??'').trim();}
function terminalBase(v){return cleanText(v).replace(PUNCT_RE,'');}
function startsAny(text,stems){return stems.some(s=>text.startsWith(s));}
function endsAny(text,suffixes){return suffixes.some(s=>text.endsWith(s));}
function isQuestion(display){return /[?？]\s*$/.test(String(display||''));}
function normalizeForMatch(text){return String(text||'').normalize('NFC').replace(/[\s\u00a0]+/g,'').replace(/[.,!?;:'"“”‘’()，。！？·…]/g,'').trim();}
function jongIndex(ch){const code=String(ch||'').charCodeAt(0);if(code<0xAC00||code>0xD7A3)return-1;return(code-0xAC00)%28;}
function endsRieul(text){const s=terminalBase(text);return s?jongIndex(s.at(-1))===8:false;}
function endsNieun(text){const s=terminalBase(text);return s?jongIndex(s.at(-1))===4:false;}
function looksAdnominal(text){const s=terminalBase(text);return !!s&&(s.endsWith('는')||s.endsWith('은')||s.endsWith('인')||s.endsWith('던')||s.endsWith('았던')||s.endsWith('었던')||endsRieul(s)||endsNieun(s));}
function isAux(text,roots){const s=terminalBase(text);return roots.some(r=>s.startsWith(r));}

function canCollapseAll(orders,ids){
  return orders.every(order=>{
    const idx=order.indexOf(ids[0]);
    if(idx<0)return !ids.some(id=>order.includes(id));
    return ids.every((id,j)=>order[idx+j]===id);
  });
}
function collapseOrders(orders,ids,keepId){
  return orders.map(order=>{
    const idx=order.indexOf(ids[0]);
    if(idx<0)return [...order];
    return [...order.slice(0,idx),keepId,...order.slice(idx+ids.length)];
  });
}

const SMART_ATTACH=new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','도','만','부터','까지','으로','로','의','보다','처럼','와','과','예요','이에요','입니다','입니까']);
function joinParts(parts,mode){
  if(mode==='')return parts.map(terminalBase).join('');
  if(mode!=='smart')return parts.map(terminalBase).join(mode);
  let out='';
  for(const raw of parts){const p=terminalBase(raw);if(!p)continue;if(!out)out=p;else if(SMART_ATTACH.has(p))out+=p;else out+=' '+p;}
  return out.replace(/\s+/g,' ').trim();
}
function mergeRange(state,start,count,joiner='smart'){
  if(count<2||start<0||start+count>state.seq.length)return false;
  const group=state.seq.slice(start,start+count);const ids=group.map(x=>x.id);
  if(!canCollapseAll(state.orders,ids))return false;
  const keep=group[0];
  keep.text=joinParts(group.map(x=>x.text),joiner);
  state.seq.splice(start,count,keep);
  state.orders=collapseOrders(state.orders,ids,keep.id);
  ids.slice(1).forEach(id=>state.removed.add(id));
  return true;
}

function mergeForcedWithinWords(state){
  let changed=true;
  while(changed){changed=false;
    for(let i=0;i<state.seq.length-1;i++){
      const a=terminalBase(state.seq[i].text),b=terminalBase(state.seq[i+1].text),whole=a+b;
      let join=FORCE_JOIN_WORDS.has(whole);
      // -기로 하다: old data often has 가기 | 로 | 했어요.
      if(!join&&b==='로'&&a.endsWith('기')&&i+2<state.seq.length&&isAux(state.seq[i+2].text,['하','했','해']))join=true;
      // Common connective endings accidentally interpreted as particles.
      if(!join&&b==='도'&&endsAny(a,['아','어','여','해','워','줘','봐','지','는데','은데','인데','더라','서','면서','고서','다가','려']))join=true;
      if(!join&&b==='가'&&FORCE_JOIN_WORDS.has(whole))join=true;
      if(!join&&b==='하고'&&HADA_CONNECTIVE_BASES.has(a))join=true;
      if(join&&mergeRange(state,i,2,'')){changed=true;break;}
    }
  }
}

function mergeGrammarChunks(state){
  let changed=true,guard=0;
  while(changed&&guard++<20){
    changed=false;
    const s=state.seq;
    const t=i=>terminalBase(s[i]?.text||'');
    for(let i=0;i<s.length;i++){
      const a=t(i),b=t(i+1),c=t(i+2),d=t(i+3),e=t(i+4);
      if(!a||!b)continue;

      // Raw stem + adnominal ending + bound-noun grammar + sentence ending.
      if(['은','는','을'].includes(b)&&['거','것'].includes(c)&&isAux(d,['예요','이에요','입니다','입니까','같','맞','아니'])){
        if(mergeRange(state,i,4,'smart')){changed=true;break;}
      }
      if(b==='을'&&['수','줄'].includes(c)&&isAux(d,c==='수'?['있','없']:['알','모르','아','몰'])){
        if(mergeRange(state,i,4,'smart')){changed=true;break;}
      }

      // Already-inflected modifier + multiword grammar.
      if(['거','것'].includes(b)&&isAux(c,['예요','이에요','입니다','입니까','같','맞','아니'])&&looksAdnominal(a)){
        if(mergeRange(state,i,3,'smart')){changed=true;break;}
      }
      if(b==='수'&&isAux(c,['있','없'])&&looksAdnominal(a)){
        if(mergeRange(state,i,3,'smart')){changed=true;break;}
      }
      if(b==='줄'&&isAux(c,['알','모르','아','몰'])&&looksAdnominal(a)){
        if(mergeRange(state,i,3,'smart')){changed=true;break;}
      }
      if(['모양','편','셈','법'].includes(b)&&isAux(c,['이에요','예요','입니다','입니까','이다','아니'])&&looksAdnominal(a)){
        if(mergeRange(state,i,3,'smart')){changed=true;break;}
      }

      // Auxiliary predicate constructions. Keep adverbs (안/못/잘/더/아마...) separate.
      if(a.endsWith('면')&&isAux(b,['되','돼'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(a.endsWith('야')&&isAux(b,['되','돼','하'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(endsAny(a,['아도','어도','여도','해도','라도'])&&isAux(b,['되','돼'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(a.endsWith('고')&&isAux(b,['싶','있','계'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(endsAny(a,['려고','으려고','을까','ㄹ까'])&&isAux(b,['하','해','했','봐','보'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(a.endsWith('게')&&isAux(b,['되','돼'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(a.endsWith('기로')&&isAux(b,['하','해','했'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(endsAny(a,['아','어','여','해','워','줘'])&&isAux(b,['보','봐','봤','주','줘','드리'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(a.endsWith('지')&&isAux(b,['않','못'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}
      if(a.endsWith('기')&&isAux(b,['쉽','어렵','힘들'])){if(mergeRange(state,i,2,'smart')){changed=true;break;}}

    }
  }
}

function removeResponsePrefix(display,state){
  if(!RESPONSE_PREFIX_RE.test(display)||!state.orders.length)return display;
  const first=state.orders[0]?.[0];const firstText=terminalBase(state.seq.find(x=>x.id===first)?.text||'');
  if(!['네','아니요','아니오'].includes(firstText))return display;
  state.seq=state.seq.filter(x=>x.id!==first);
  state.orders=state.orders.map(order=>order.filter(id=>id!==first)).filter(order=>order.length);
  state.removed.add(first);
  return display.replace(RESPONSE_PREFIX_RE,'').trim();
}

function addQuestionMark(display,state){
  if(!isQuestion(display))return;
  const finals=new Set(state.orders.map(o=>o[o.length-1]).filter(Boolean));
  state.seq.forEach(item=>{if(finals.has(item.id))item.text=terminalBase(item.text)+'?';});
}

export function normalizeSentenceCards(displaySentence,tokens,acceptedOrders){
  let display=cleanText(displaySentence);
  const sourceTokens=(tokens||[]).map(t=>[String(t[0]),cleanText(t[1])]);
  const tokenMap=new Map(sourceTokens);
  let orders=(acceptedOrders||[]).map(o=>o.map(String)).filter(o=>o.length);
  if(!orders.length&&sourceTokens.length)orders=[sourceTokens.map(t=>t[0])];
  const first=orders[0]||[];
  const seq=first.map(id=>({id,text:tokenMap.get(id)||''}));
  // Preserve any token not present in the canonical order at the end (defensive only).
  for(const [id,text] of sourceTokens)if(!seq.some(x=>x.id===id))seq.push({id,text});
  const state={seq,orders,removed:new Set()};
  display=removeResponsePrefix(display,state);
  mergeForcedWithinWords(state);
  mergeGrammarChunks(state);
  addQuestionMark(display,state);
  const outTokens=state.seq.filter(x=>!state.removed.has(x.id)).map(x=>[x.id,x.text]);
  return{displaySentence:display,tokens:outTokens,acceptedOrders:state.orders};
}

export function suggestSentenceCards(sentence){
  const display=cleanText(sentence);if(!display)return[];
  const clean=display.replace(/[.!?。！？]+$/g,'');
  const words=clean.split(/\s+/).filter(Boolean),cards=[];
  for(const word of words){
    let done=false;
    for(const suffix of COPULAS){
      if(word.length>suffix.length&&word.endsWith(suffix)){
        cards.push(word.slice(0,-suffix.length),suffix);done=true;break;
      }
    }
    if(done)continue;
    for(const suffix of PARTICLES){
      if(word.length<=suffix.length||!word.endsWith(suffix))continue;
      const base=word.slice(0,-suffix.length);
      cards.push(base,suffix);done=true;break;
    }
    if(!done)cards.push(word);
  }
  const id='AUTO';const tokens=cards.map((c,i)=>[`${id}_${i}`,c]),order=tokens.map(t=>t[0]);
  const normalized=normalizeSentenceCards(display,tokens,[order]);
  const m=new Map(normalized.tokens);
  return(normalized.acceptedOrders[0]||[]).map(x=>m.get(x)).filter(Boolean);
}

export function sentenceCardRuleVersion(){return'1.0';}
