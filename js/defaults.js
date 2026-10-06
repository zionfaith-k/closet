// 모든 기준의 출발값. 사이트의 「기준 설정」 화면에서 고치면 이 값 대신 저장된 값이 쓰인다.
// 숫자는 측정값이 아니라 출발값이다.

export const DEFAULT_SETTINGS = {
  updatedAt: 0,

  // 내 몸 (cm). 비운 항목은 옷끼리 비교만 한다.
  body: { height: null, shoulder: null, chest: null, waist: null, hip: null, thigh: null, inseam: null },

  // 핏 경계값은 내가 직접 넣기 전까지 비워 둔다(null). 비어 있으면 자동 판정을 하지 않는다.
  fit: {
    // 상의·이너: 가슴 여유(가슴단면×2 − 내 가슴둘레) 경계. 신체 치수가 없으면 가슴단면 절대값 경계.
    top: { stages: ['슬림', '레귤러', '세미오버', '오버'], easeBounds: [null, null, null], absBounds: [null, null, null] },
    outer: { stages: ['슬림', '레귤러', '세미오버', '오버'], easeBounds: [null, null, null], absBounds: [null, null, null] },
    // 하의 통: 밑단단면 경계
    bottomWidth: { stages: ['슬림', '스트레이트', '세미와이드', '와이드'], bounds: [null, null, null] },
    // 하의 형태: 허벅지단면 − 밑단단면 (작을수록 밑단이 넓다)
    bottomShape: { stages: ['부츠컷', '일자', '테이퍼드'], bounds: [null, null] },
    length: {
      stages: ['크롭', '기본', '롱'],
      topRatio: [null, null], outerRatio: [null, null],   // 총장 ÷ 키
      topAbs: [null, null], outerAbs: [null, null],               // 키가 없을 때 총장 절대값
      bottomDiff: [null, null],                                // (총장 − 밑위) − 내 다리 안쪽 길이
      bottomAbs: [null, null],
    },
    shortSleeve: 35, // 소매길이가 이보다 짧으면 반팔
    shortPants: 65,  // 하의 총장이 이보다 짧으면 반바지
    shortCoef: 0.7,  // 반팔·반바지의 보온 계수
    // 「입어 보니」 기록으로 맞는 범위를 잡을 때
    stretchPct: 3,       // 폴리우레탄이 이 % 이상이거나 니트 조직이면 신축성 있는 옷으로 본다
    stretchAllow: 2,     // 신축성 있는 옷의 둘레 부위(가슴·허리·엉덩이·허벅지)는 단면을 이만큼 더 넉넉하게 본다 (cm)
    rangeTol: 0.5,       // 맞았던 범위에서 이만큼 벗어나는 것까지는 범위 안으로 본다 (cm)
    bodyChangeAlert: 2,  // 표시했을 때보다 몸 치수가 이만큼 바뀌면 알린다 (cm)
  },

  // 소재: 보온 기본점수 + 질감 보정 [표면감, 광택, 드레이프, 두께감] (100%일 때 더해지는 값)
  materials: [
    { name: '면', warmth: 2, d: [0, 0, 0, 0] },
    { name: '린넨', warmth: 1, d: [1, 0, -0.5, 0] },
    { name: '레이온', warmth: 1.5, d: [-0.5, 1, 1.5, 0] },
    { name: '텐셀', warmth: 1.5, d: [-0.5, 1, 1.5, 0] },
    { name: '모달', warmth: 1.5, d: [-0.5, 0.5, 1.5, 0] },
    { name: '폴리에스터', warmth: 2.5, d: [-0.5, 0.5, 0, 0] },
    { name: '나일론', warmth: 2.5, d: [-0.5, 1, 0, 0] },
    { name: '아크릴', warmth: 3.5, d: [0.5, 0, 0, 0.5] },
    { name: '울', warmth: 4, d: [0.5, -0.5, 0, 0.5] },
    { name: '캐시미어', warmth: 4.5, d: [-0.5, 0.5, 1, 0.5] },
    { name: '실크', warmth: 2, d: [-1, 2, 1.5, -0.5] },
    { name: '폴리우레탄', warmth: 2, d: [0, 0, 0.5, 0] },
    { name: '가죽', warmth: 3.5, d: [0, 0, 0, 0] },
  ],
  unknownMaterialWarmth: 2.5,

  // 조직: 보온 계수 + 질감 기본값 [표면감, 광택, 드레이프, 두께감] + 견본 무늬
  // 보온 계수는 2026-10-06 자료 조사로 조정한 값. ev = 근거 강도(강/중/약). 근거는 「조직 보온 근거.md」.
  weaves: [
    { name: '포플린', group: '우븐', warmth: 0.9, ev: '중', tex: [1.5, 2, 2, 1.5], pattern: 'plain' },
    { name: '옥스포드', group: '우븐', warmth: 1, ev: '약', tex: [2.5, 1.5, 2, 2.5], pattern: 'oxford' },
    { name: '트윌(치노)', group: '우븐', warmth: 1, ev: '중', tex: [2.5, 1.5, 2, 3], pattern: 'twill' },
    { name: '데님', group: '우븐', warmth: 1, ev: '중', tex: [3.5, 1, 1.5, 3.5], pattern: 'denim' },
    { name: '코듀로이', group: '우븐', warmth: 1.3, ev: '중', tex: [4.5, 1, 2, 4], pattern: 'cord' },
    { name: '린넨 평직', group: '우븐', warmth: 0.9, ev: '약', tex: [4, 1, 2, 2], pattern: 'linen' },
    { name: '트위드', group: '우븐', warmth: 1.2, ev: '약', tex: [5, 1, 1.5, 4.5], pattern: 'tweed' },
    { name: '새틴', group: '우븐', warmth: 0.9, ev: '약', tex: [1, 5, 4.5, 1.5], pattern: 'satin' },
    { name: '나일론 타프타', group: '우븐', warmth: 1, ev: '중', tex: [1.5, 3.5, 2, 1.5], pattern: 'taffeta' },
    { name: '저지', group: '니트', warmth: 1, ev: '중', tex: [1.5, 1.5, 3.5, 2], pattern: 'jersey' },
    { name: '와플', group: '니트', warmth: 1.1, ev: '중', tex: [4, 1, 3, 3], pattern: 'waffle' },
    { name: '골지', group: '니트', warmth: 1.1, ev: '중', tex: [3.5, 1.5, 3.5, 2.5], pattern: 'rib' },
    { name: '하이게이지 니트', group: '니트', warmth: 1.1, ev: '약', tex: [2, 2, 4, 2.5], pattern: 'fineknit' },
    { name: '로우게이지 니트', group: '니트', warmth: 1.2, ev: '약', tex: [4.5, 1, 3, 4.5], pattern: 'chunky' },
    { name: '기모 스웨트', group: '기모', warmth: 1.3, ev: '강', tex: [2.5, 1, 2.5, 4], pattern: 'sweat' },
    { name: '플리스', group: '기모', warmth: 1.5, ev: '중', tex: [4, 1, 2.5, 4.5], pattern: 'fleece' },
    { name: '가죽', group: '기타', warmth: 1.2, ev: '중', tex: [1.5, 4, 1.5, 4], pattern: 'leather' },
    { name: '스웨이드', group: '기타', warmth: 1.2, ev: '약', tex: [3.5, 1, 2, 3.5], pattern: 'suede' },
    { name: '메쉬', group: '기타', warmth: 0.7, ev: '중', tex: [3.5, 2, 3, 1], pattern: 'mesh' },
  ],

  thickness: { '얇음': 0.6, '보통': 1, '두꺼움': 1.5 },
  fill: { '없음': 0, '솜': 3, '다운': 5 },

  // 체감온도 구간별 보온 합계 목표 (상의+하의+아우터+이너). min 이상인 첫 구간을 쓴다.
  bands: [
    { min: 28, label: '반팔, 반바지, 린넨', lo: 2, hi: 3 },
    { min: 23, label: '반팔, 얇은 셔츠, 면바지', lo: 3, hi: 4 },
    { min: 20, label: '긴팔, 얇은 가디건', lo: 4, hi: 6 },
    { min: 17, label: '맨투맨, 얇은 니트, 얇은 재킷', lo: 6, hi: 8 },
    { min: 12, label: '재킷, 가디건, 니트', lo: 8, hi: 11 },
    { min: 9, label: '트렌치, 두꺼운 재킷', lo: 11, hi: 14 },
    { min: 5, label: '코트, 히트텍', lo: 14, hi: 18 },
    { min: -99, label: '패딩, 두꺼운 코트', lo: 18, hi: 24 },
  ],

  weather: {
    startHour: 8, endHour: 20,   // 밖에 있는 시간대
    diurnal: 10,                 // 일교차가 이 이상이면 겉옷 포함
    rainProb: 60,                // 강수확률이 이 이상이면 비에 약한 옷 제외
    rainAvoidWeaves: ['스웨이드'],
    region: { name: '서울', lat: 37.5665, lon: 126.978 }, // 위치 권한이 없을 때
  },

  recommend: {
    count: 5,
    excludeDays: 7,     // 최근 며칠 안에 입은 조합 제외
    noOuterAbove: 23,   // 기준 온도가 이 이상이면 아우터 없이
    innerBelow: 12,     // 기준 온도가 이 미만일 때만 이너 사용
    fillBelow: 10,      // 솜·다운 아우터는 기준 온도가 이 미만일 때만
    shortAbove: 20,     // 반팔·반바지는 기준 온도가 이 이상일 때만
    feelStep: 0.25,     // 「추웠다」 1건당 목표 점수 이동
    feelWindow: 30,     // 최근 몇 건의 체감 기록을 볼지
    feelMax: 3,
    likeBonus: 0.6,     // 좋아요 룩에 함께 나온 옷 쌍 1개당 가산
  },

  // 계절 정리: 달력이 아니라 앞으로의 기온으로 판단한다
  season: {
    horizonDays: 14,    // 앞으로 며칠의 예보를 볼지
    bandTol: 1,         // 보온 합계가 목표에서 이만큼 벗어나도 입을 수 있는 것으로 본다
    reviewMonths: 12,   // 보유한 지 이 개월이 지난 옷만 처분 검토
    reviewMaxWears: 1,  // 최근 1년 착용이 이 횟수 이하면 처분 검토
    minChanceDays: 20,  // 그 옷에 맞는 기온이었던 날이 이보다 적었으면 「기회가 적었음」으로 유지
    snoozeMonths: 6,    // 「유지」를 누르면 이 개월 동안 다시 묻지 않는다
  },
  // 등록할 때 비슷한 옷 알림
  dup: { colorDist: 60, measureDist: 1.5 },
  bodyLog: [],          // 신체 치수를 바꾼 날짜별 기록

  color: { maxChromatic: 1, clashPenalty: 3, toneOnToneBonus: 1 },
  occasions: ['출근', '주말'],
};

export const TEX_AXES = [
  { name: '표면감', lo: '매끈', hi: '거침' },
  { name: '광택', lo: '무광', hi: '윤기' },
  { name: '드레이프', lo: '빳빳', hi: '흐름' },
  { name: '두께감', lo: '얇음', hi: '묵직' },
];

export const PATTERNS = ['plain', 'oxford', 'twill', 'denim', 'cord', 'linen', 'tweed', 'satin', 'taffeta',
  'jersey', 'waffle', 'rib', 'fineknit', 'chunky', 'sweat', 'fleece', 'leather', 'suede', 'mesh'];
