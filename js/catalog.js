export const CATALOG = {
  snuBooks: [
    { id: '1A', title: '서울대 1A', lessons: [1,2,3,4,5,6,7,8] },
    { id: '1B', title: '서울대 1B', lessons: [9,10,11,12,13,14,15,16] },
    { id: '2A', title: '서울대 2A', lessons: [1,2,3,4,5,6,7,8,9] },
    { id: '2B', title: '서울대 2B', lessons: [10,11,12,13,14,15,16,17,18] },
    { id: '3A', title: '서울대 3A', lessons: [1,2,3,4,5,6,7,8,9] },
    { id: '3B', title: '서울대 3B', lessons: [10,11,12,13,14,15,16,17,18] },
    { id: '4A', title: '서울대 4A', lessons: [1,2,3,4,5,6,7,8,9] },
    { id: '4B', title: '서울대 4B', lessons: [10,11,12,13,14,15,16,17,18] }
  ],
  collocationSets: Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    label: `${i * 50 + 1}-${(i + 1) * 50}`
  }))
};
