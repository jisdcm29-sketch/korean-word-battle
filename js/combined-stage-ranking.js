const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function combinedTotal(player){
  const scores=player?.scores||{};
  return Math.round((Number(scores.word)||0)+(Number(scores.matching)||0)+(Number(scores.sentence)||0));
}

export function sortedCombinedPlayers(players){
  return [...(players||[])].sort((a,b)=>combinedTotal(b)-combinedTotal(a)||String(a.name).localeCompare(String(b.name),'ko'));
}

export function combinedRankingRows(players){
  return sortedCombinedPlayers(players).map((player,index)=>`<div class="combined-score-row"><span class="combined-score-place">${index+1}</span><span class="combined-score-avatar">${esc(player.avatar)}</span><strong class="combined-score-name">${esc(player.name)}</strong><strong class="combined-score-points">${combinedTotal(player).toLocaleString()} pt</strong></div>`).join('');
}
