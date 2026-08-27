import { CATALOG } from './catalog.js';

const cache = new Map();

async function getJson(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다: ${path}`);
  const data = await res.json();
  cache.set(path, data);
  return data;
}

export async function loadPreliminary() {
  const data = await getJson('data/preliminary/preliminary40.json');
  return {
    title: `${data.title_kr || '예비편 어휘'} 40`,
    description: data.description || '',
    items: (data.vocab || []).map((v, idx) => ({
      id: `pre-${v.id ?? idx + 1}`,
      ko: String(v.ko || '').trim(),
      mn: String(v.mn || '').trim(),
      source: v.snu_source || ''
    })).filter(v => v.ko && v.mn)
  };
}

export async function loadSnu(book, lesson) {
  const lessonNo = String(lesson).padStart(2, '0');
  const data = await getJson(`data/snu/${book}/lesson${lessonNo}.json`);
  return {
    title: `${book} ${Number(lesson)}과`,
    items: (data.vocab || []).map((v, idx) => ({ id: `${book}-${lessonNo}-${idx+1}`, ko: String(v.ko || '').trim(), mn: String(v.mn || '').trim() })).filter(v => v.ko && v.mn)
  };
}

export async function loadCollocation(setId) {
  if (setId === 'all') {
    const results = await Promise.all(CATALOG.collocationSets.map(s => loadCollocation(String(s.id))));
    return { title: 'TOPIK 1 연어 1-500', items: results.flatMap(r => r.items) };
  }
  const n = Number(setId);
  const data = await getJson(`data/topik1/collocation/set${String(n).padStart(2,'0')}.json`);
  return {
    title: `TOPIK 1 연어 ${data.range || ''}`.trim(),
    items: (data.vocab || []).map((v, idx) => ({ id: `topik1-c${n}-${v.id ?? idx+1}`, ko: String(v.ko || '').trim(), mn: String(v.mn || '').trim() })).filter(v => v.ko && v.mn)
  };
}

export async function loadByConfig(config) {
  if (config.sourceType === 'preliminary') return loadPreliminary();
  if (config.sourceType === 'topik1') return loadCollocation(String(config.collocationSet));
  return loadSnu(config.snuBook, Number(config.snuLesson));
}
