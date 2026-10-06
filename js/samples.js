// 화면을 미리 둘러보기 위한 예시 데이터. 설정 화면에서 한 번에 지울 수 있다.
const I = (id, cat, name, color, colorFamily, occasion, materials, weave, thickness, m, extra = {}) => ({
  id: 's_' + id, sample: true, cat, name, brand: '예시', size: '', color, colorFamily, occasion,
  materials: materials.map(([n, p]) => ({ name: n, pct: p })), weave, thickness, fill: '없음', m,
  fitLabel: {}, texOverride: null, photo: null, bought: '', memo: '', ...extra,
});

export function makeSamples(today) {
  const day = (n) => { const d = new Date(Date.parse(today) - n * 864e5); return d.toISOString().slice(0, 10); };
  const items = [
    I('t1', 'top', '화이트 옥스포드 셔츠', '#f3f1ea', '무채색', '둘 다', [['면', 100]], '옥스포드', '보통', { length: 74, shoulder: 47, chest: 56, sleeve: 62, hem: 54 }),
    I('t2', 'top', '네이비 반팔 티셔츠', '#27324a', '뉴트럴', '주말', [['면', 100]], '저지', '얇음', { length: 70, shoulder: 50, chest: 57, sleeve: 23 }),
    I('t3', 'top', '오트밀 울 니트', '#d8cdb8', '뉴트럴', '둘 다', [['울', 70], ['나일론', 30]], '로우게이지 니트', '두꺼움', { length: 66, shoulder: 54, chest: 60, sleeve: 58 }, { fitLabel: { main: 2 } }),
    I('t4', 'top', '그레이 기모 맨투맨', '#9a9a98', '무채색', '주말', [['면', 80], ['폴리에스터', 20]], '기모 스웨트', '보통', { length: 68, shoulder: 58, chest: 63, sleeve: 59 }, { fitLabel: { main: 3 } }),
    I('t5', 'top', '차콜 하이게이지 니트', '#3c3c3e', '무채색', '출근', [['울', 100]], '하이게이지 니트', '얇음', { length: 67, shoulder: 46, chest: 53, sleeve: 61 }, { fitLabel: { main: 1 } }),
    I('b1', 'bottom', '생지 데님', '#2b3550', '뉴트럴', '주말', [['면', 100]], '데님', '보통', { length: 104, waist: 41, hip: 53, thigh: 31, rise: 30, hem: 20 }, { fitLabel: { main: 1 } }),
    I('b2', 'bottom', '베이지 치노', '#c9b594', '뉴트럴', '둘 다', [['면', 98], ['폴리우레탄', 2]], '트윌(치노)', '보통', { length: 102, waist: 42, hip: 55, thigh: 33, rise: 31, hem: 23 }, { fitLabel: { main: 2 } }),
    I('b3', 'bottom', '차콜 울 슬랙스', '#404044', '무채색', '출근', [['울', 60], ['폴리에스터', 40]], '트윌(치노)', '보통', { length: 103, waist: 41, hip: 54, thigh: 34, rise: 32, hem: 26 }, { fitLabel: { main: 3 } }),
    I('b4', 'bottom', '블랙 코듀로이 팬츠', '#222222', '무채색', '주말', [['면', 100]], '코듀로이', '보통', { length: 101, waist: 42, hip: 55, thigh: 32, rise: 30, hem: 21.5 }),
    I('o1', 'outer', '네이비 울 재킷', '#1f2a40', '뉴트럴', '출근', [['울', 90], ['캐시미어', 10]], '트윌(치노)', '보통', { length: 74, shoulder: 46, chest: 55, sleeve: 63 }),
    I('o2', 'outer', '카키 나일론 바람막이', '#6d6f52', '뉴트럴', '주말', [['나일론', 100]], '나일론 타프타', '얇음', { length: 72, shoulder: 56, chest: 64, sleeve: 62 }),
    I('o3', 'outer', '블랙 다운 패딩', '#1b1b1c', '무채색', '둘 다', [['나일론', 100]], '나일론 타프타', '보통', { length: 70, shoulder: 55, chest: 66, sleeve: 64 }, { fill: '다운' }),
    I('n1', 'inner', '발열 내의 상의', '#2a2a2a', '무채색', '둘 다', [['폴리에스터', 40], ['레이온', 35], ['아크릴', 20], ['폴리우레탄', 5]], '저지', '얇음', { length: 66, shoulder: 40, chest: 44, sleeve: 58 }),
    I('s1', 'shoes', '화이트 가죽 스니커즈', '#f1efe9', '무채색', '둘 다', [['가죽', 100]], '가죽', '보통', {}),
    I('s2', 'shoes', '브라운 스웨이드 로퍼', '#7a5a3c', '뉴트럴', '출근', [['가죽', 100]], '스웨이드', '보통', {}),
  ];
  const L = (id, n, ids, tmin, tmax, feel, liked) => ({
    id: 's_l' + id, sample: true, date: day(n), itemIds: ids.map((x) => 's_' + x), photos: [],
    weather: { tmin, tmax, rain: 10, code: 1 }, occasion: '주말', feel, liked, memo: '',
  });
  const looks = [
    L(1, 9, ['t3', 'b1', 's1'], 11, 17, 'ok', true),
    L(2, 12, ['t1', 'b3', 'o1', 's2'], 9, 15, 'cold', false),
    L(3, 16, ['t4', 'b2', 's1'], 13, 19, 'ok', false),
    L(4, 21, ['t2', 'b2', 's1'], 22, 27, 'hot', true),
  ];
  return { items, looks };
}
