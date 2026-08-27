const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function uniqueReverseItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = norm(item.mn);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(norm(item.ko));
  }
  return items.filter(item => map.get(norm(item.mn))?.size === 1);
}

function optionPool(items, direction) {
  const prop = direction === 'ko-mn' ? 'mn' : 'ko';
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = item[prop];
    const key = norm(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function makeQuestion(item, direction, allItems, index) {
  const prompt = direction === 'ko-mn' ? item.ko : item.mn;
  const answer = direction === 'ko-mn' ? item.mn : item.ko;
  const pool = optionPool(allItems, direction).filter(v => norm(v) !== norm(answer));
  const distractors = shuffle(pool).slice(0, 3);
  if (distractors.length < 3) throw new Error('4지선다를 만들기에 서로 다른 선택지가 부족합니다.');
  const options = shuffle([answer, ...distractors]);
  return {
    id: `${item.id}-${index}-${direction}`,
    direction,
    prompt,
    answer,
    options,
    correctIndex: options.findIndex(v => norm(v) === norm(answer)),
    sourceKo: item.ko,
    sourceMn: item.mn
  };
}

export function getQuizCapacity(items, direction) {
  const clean = items.filter(v => v.ko && v.mn);
  if (direction === 'mn-ko') return uniqueReverseItems(clean).length;
  return clean.length;
}

export function buildQuiz(items, config) {
  const clean = items.filter(v => v.ko && v.mn);
  const reverseSafe = uniqueReverseItems(clean);
  const capacity = getQuizCapacity(clean, config.direction);
  const requested = Math.max(1, Number(config.questionCount) || 10);
  const count = Math.min(requested, capacity);
  if (clean.length < 4) throw new Error('문제를 만들 수 있는 어휘가 4개 이상 필요합니다.');
  if (capacity < 4) throw new Error('현재 출제 방향에서 4지선다 문제를 만들 수 있는 항목이 부족합니다.');

  let selected;
  if (config.direction === 'mn-ko') {
    selected = shuffle(reverseSafe).slice(0, count).map((item, i) => makeQuestion(item, 'mn-ko', reverseSafe, i));
  } else if (config.direction === 'ko-mn') {
    selected = shuffle(clean).slice(0, count).map((item, i) => makeQuestion(item, 'ko-mn', clean, i));
  } else {
    const reverseIds = new Set(reverseSafe.map(v => v.id));
    const picked = shuffle(clean).slice(0, count);
    selected = picked.map((item, i) => {
      const canReverse = reverseIds.has(item.id);
      const direction = Math.random() < 0.5 && canReverse ? 'mn-ko' : 'ko-mn';
      return makeQuestion(item, direction, direction === 'mn-ko' ? reverseSafe : clean, i);
    });
  }

  return { questions: selected, createdAt: Date.now(), capacity };
}

export function calculateScore(durationMs, elapsedMs, isCorrect) {
  if (!isCorrect) return 0;
  const elapsed = Math.max(0, Math.min(durationMs, elapsedMs));
  return Math.floor(500 + 500 * ((durationMs - elapsed) / durationMs));
}

export function directionLabel(direction) {
  return direction === 'ko-mn' ? '한국어 → 몽골어' : '몽골어 → 한국어';
}
