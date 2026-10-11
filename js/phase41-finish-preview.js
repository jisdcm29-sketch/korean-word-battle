/* KGA41 preview only. No network requests, writes, authentication or identity resolution. */
export function phase41BuildPreview(room, classContext) {
  if (!room || room.status !== 'finished') return {status:'SKIPPED', reason:'NOT_FINISHED'};
  if (room.demoMode || room.config?.demoMode) return {status:'SKIPPED', reason:'DEMO'};
  const classId=String(classContext?.classId || '').trim();
  if (!classId) return {status:'SKIPPED', reason:'NO_CLASS'};
  const pin=String(room.pin || '').trim();
  const createdAt=Number(room.createdAt);
  if (!pin || !Number.isSafeInteger(createdAt) || createdAt<=0) return {status:'INVALID', reason:'ROOM_ID'};
  const members=Object.values(room.players||{}).filter(x=>x&&!x.bot);
  if (!members.length || members.length>100) return {status:'SKIPPED', reason:'PLAYER_COUNT'};
  const uids=new Set();
  const sorted=[...members].sort((a,b)=>Number(b.score)-Number(a.score)||String(a.name||'').localeCompare(String(b.name||''),'ko'));
  const players=[];
  for (const [index,p] of sorted.entries()) {
    const uid=String(p.uid||p.id||'').trim();
    const name=String(p.name||'').trim();
    const rawScore=Number(p.score);
    if (!uid||uids.has(uid)||!name||!Number.isSafeInteger(rawScore)||rawScore<0) return {status:'INVALID',reason:'PLAYER_DATA'};
    uids.add(uid);
    players.push({uid,enteredName:name,rawScore,dailyRank:index+1});
  }
  // Do not put phone numbers or player-supplied identity claims into this payload.
  return {status:'PREVIEW_ONLY',classId,gameSessionId:`word-${pin}-${createdAt}`,gameId:'word',players};
}
export function phase41AfterFinish(room, classContext, reporter=()=>{}) {
  try {
    const result=phase41BuildPreview(room,classContext);
    reporter({status:result.status,reason:result.reason||'',playerCount:result.players?.length||0,gameSessionId:result.gameSessionId||''});
    return result;
  } catch (_) { return {status:'INVALID',reason:'UNEXPECTED'}; }
}
