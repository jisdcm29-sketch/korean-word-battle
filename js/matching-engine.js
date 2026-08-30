const shuffle = (arr) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const cleanText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

export function buildMatchingRounds(items, config = {}) {
  const raw = items
    .map((item, index) => ({
      id: String(item.id || `v-${index + 1}`),
      ko: cleanText(item.ko),
      mn: cleanText(item.mn)
    }))
    .filter((item) => item.ko && item.mn);

  // Remove exact duplicate pairs. A matching board must never show two cards
  // that look identical but point to different internal answers.
  const exactSeen = new Set();
  const clean = raw.filter((item) => {
    const key = `${item.ko.toLowerCase()}\u0000${item.mn.toLowerCase()}`;
    if (exactSeen.has(key)) return false;
    exactSeen.add(key);
    return true;
  });

  const pairsPerRound = Math.max(2, Math.min(10, Number(config.pairsPerRound) || 6));
  const roundCount = Math.max(1, Math.min(10, Number(config.roundCount) || 3));
  if (clean.length < pairsPerRound) {
    throw new Error(`한 판에 ${pairsPerRound}쌍을 사용하려면 어휘를 최소 ${pairsPerRound}개 선택해야 합니다.`);
  }

  const usage = new Map(clean.map((item) => [item.id, 0]));
  const rounds = [];

  for (let r = 0; r < roundCount; r++) {
    // Prefer vocabulary that has been used fewer times, but randomize ties.
    const randomized = shuffle(clean).sort((a, b) => (usage.get(a.id) || 0) - (usage.get(b.id) || 0));
    const usedKo = new Set();
    const usedMn = new Set();
    const selected = [];

    for (const item of randomized) {
      const koKey = item.ko.toLowerCase();
      const mnKey = item.mn.toLowerCase();
      if (usedKo.has(koKey) || usedMn.has(mnKey)) continue;
      selected.push(item);
      usedKo.add(koKey);
      usedMn.add(mnKey);
      if (selected.length >= pairsPerRound) break;
    }

    if (selected.length < pairsPerRound) {
      throw new Error(`현재 선택한 어휘에는 뜻이 중복되는 항목이 많아 한 판 ${pairsPerRound}쌍을 1:1로 만들 수 없습니다. 카드 쌍 수를 줄이거나 어휘를 더 선택해 주세요.`);
    }

    selected.forEach((item) => usage.set(item.id, (usage.get(item.id) || 0) + 1));
    const cards = [];
    selected.forEach((item, pairIndex) => {
      const pairId = `r${r + 1}-p${pairIndex + 1}-${item.id}`;
      cards.push({ id:`${pairId}-ko`, pairId, lang:'ko', text:item.ko, sourceId:item.id });
      cards.push({ id:`${pairId}-mn`, pairId, lang:'mn', text:item.mn, sourceId:item.id });
    });

    rounds.push({
      id: `round-${r + 1}`,
      number: r + 1,
      pairs: selected.map((item, pairIndex) => ({
        pairId: `r${r + 1}-p${pairIndex + 1}-${item.id}`,
        ko: item.ko,
        mn: item.mn,
        sourceId: item.id
      })),
      cards: shuffle(cards)
    });
  }

  return { rounds, roundCount, pairsPerRound, createdAt: Date.now() };
}

export function calculateMatchingPairScore(durationMs, elapsedMs, combo = 1) {
  const duration = Math.max(1000, Number(durationMs) || 1000);
  const elapsed = Math.max(0, Math.min(duration, Number(elapsedMs) || 0));
  const remainingRatio = Math.max(0, (duration - elapsed) / duration);
  const timeBonus = Math.floor(450 * remainingRatio);
  const comboBonus = Math.min(200, Math.max(0, (Number(combo) - 1) * 40));
  return 450 + timeBonus + comboBonus;
}

export function calculateRoundClearBonus(durationMs, elapsedMs) {
  const duration = Math.max(1000, Number(durationMs) || 1000);
  const elapsed = Math.max(0, Math.min(duration, Number(elapsedMs) || 0));
  const remainingRatio = Math.max(0, (duration - elapsed) / duration);
  return 300 + Math.floor(700 * remainingRatio);
}

export function matchingGameProgress(room, atMs = Date.now()) {
  const total = Math.max(1, Number(room?.matching?.roundCount || room?.config?.roundCount || 1));
  const index = Math.max(0, Number(room?.roundIndex || 0));
  if (room?.status === 'finished') return 1;
  if (room?.status === 'lobby' || room?.status === 'countdown') return 0;
  if (room?.status === 'round-result') return Math.min(1, (index + 1) / total);
  const start = Number(room?.roundStartAt || 0);
  const end = Number(room?.roundEndAt || 0);
  const fraction = end > start ? Math.max(0, Math.min(1, (Number(atMs) - start) / (end - start))) : 0;
  return Math.min(1, (index + fraction) / total);
}

export function isMatchingBlind(room, atMs = Date.now()) {
  return matchingGameProgress(room, atMs) >= 0.70 && room?.status !== 'finished';
}
