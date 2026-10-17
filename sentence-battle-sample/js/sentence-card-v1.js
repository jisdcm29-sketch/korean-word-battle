/**
 * Korean Game Arena - Sentence Card Presentation V1 (isolated pilot).
 * Scope: SNU 1A 01-08 + 1B 09-11 beginner; SNU 2B 10-18 + 3A 01-02 intermediate.
 * Never changes original lesson JSON, persisted teacher edits, or scores.
 */
const PARTICLES = new Set(['은','는','이','가','을','를','에','에서','에게','한테','께','도','만','부터','까지','으로','로','의','보다','처럼','와','과','하고']);
const ENDINGS = new Set(['이에요','예요','입니다','입니까']);
const ADVERBS = new Set(['어제','오늘','제일','가장','자주','먼저','천천히','조금','그냥','열심히','잘','아주','푹','많이','아침마다','다시','요즘','밤마다','날마다','깨끗이','미리','충분히',"재미있게","짧게","예쁘게","더","걸어서","혼자","따로"]);
const TEMPORAL_ADVERBS = new Set(['어제','오늘','아침마다','요즘','밤마다','날마다','미리']);




const TWO_B_CARDS = Object.freeze({
  'SNU-2B-10-001':['한국','음식','중에서','김치찌개를','제일','좋아해요.'],
  'SNU-2B-10-002':['이','식당','메뉴','중에서','순두부찌개가','제일','인기 있어요.'],
  'SNU-2B-10-003':['맛집','중에서','이','식당을','가장','추천해요.'],
  'SNU-2B-10-004':['고기','음식','중에서','삼겹살을','가장','자주','먹어요.'],
  'SNU-2B-10-005':['여러','메뉴','중에서','갈비찜을','먼저','주문할래요.'],
  'SNU-2B-10-006':['저는','오늘','냉면을','먹을래요.'],
  'SNU-2B-10-007':['후식으로','과일을','먹을래요.'],
  'SNU-2B-10-008':['오늘은','배달','음식을','시킬래요.'],
  'SNU-2B-10-009':['삼겹살을','구워 먹을래요.'],
  'SNU-2B-10-010':['메뉴를 보고','천천히','고를래요.'],
  'SNU-2B-10-011':['이','식당은','분위기가 좋은데','음식값도','싸요.'],
  'SNU-2B-10-012':['된장찌개는','맛있는데','국물이','조금','짜요.'],
  'SNU-2B-10-013':['떡갈비는','비싼데','돈이','아깝지 않아요.'],
  'SNU-2B-10-014':['직원은','친절한데','주문이','조금','늦어요.'],
  'SNU-2B-10-015':['메뉴가 다양한데','자리가','많지 않아요.'],
  'SNU-2B-10-016':['나는','오늘','비빔국수','먹을래.'],
  'SNU-2B-10-017':['이','식당은','분위기는 좋은데','조금','비싸.'],
  'SNU-2B-10-018':['너는','매운탕','먹을래?'],
  'SNU-2B-10-019':['나는','설렁탕 먹고','후식도','먹을래.'],
  'SNU-2B-10-020':['오늘은','사람이 많은데','그냥','여기서','먹자.']
});





/* Exact, manually checked next-lesson card breaks; no changes to textbook sentences. */
const TWO_B_ELEVEN_CARDS = Object.freeze({
  'SNU-2B-11-001':['감기가','나으려면','푹','쉬는 게','어때요?'],
  'SNU-2B-11-002':['눈이','많이','부었으면','안과에','가는 게','어때요?'],
  'SNU-2B-11-003':['몸살이','나면','내과에','가는 게','어때요?'],
  'SNU-2B-11-004':['이가','아프면','치과에','가는 게','어때요?'],
  'SNU-2B-11-005':['피부가','가려우면','연고를','바르는 게','어때요?'],
  'SNU-2B-11-006':['저는','아침마다','스트레칭을','하기로 했어요.'],
  'SNU-2B-11-007':['건강을 위해','계단을','이용하기로 했어요.'],
  'SNU-2B-11-008':['감기가','나으면','다시','운동하기로 했어요.'],
  'SNU-2B-11-009':['저녁에는','커피를','안 마시기로 했어요.'],
  'SNU-2B-11-010':['병원에서','하루에','세 번','약을','먹기로 했어요.'],
  'SNU-2B-11-011':['요즘','밤마다','기침이 나서','잠을','잘','못 자요.'],
  'SNU-2B-11-012':['열이 날 때마다','체온을','재요.'],
  'SNU-2B-11-013':['약은','여덟 시간마다','한 번씩','드세요.'],
  'SNU-2B-11-014':['저는','날마다','이를','깨끗이','닦아요.'],
  'SNU-2B-11-015':['주말마다','한 시간씩','산책을','해요.'],
  'SNU-2B-11-016':['속이','안 좋으면','물을','마시는 게','어때요?'],
  'SNU-2B-11-017':['소화가','안 되면','소화제를','먹는 게','어때요?'],
  'SNU-2B-11-018':['멀미가','심하면','멀미약을','미리','먹는 게','어때요?'],
  'SNU-2B-11-019':['얼굴이 부어서','오늘은','충분히','쉬기로 했어요.'],
  'SNU-2B-11-020':['배탈이 나서','찬','음식을','먹지 않기로 했어요.']
});

/* Curated card boundaries for existing 2B lesson 12 sentences only. */
const TWO_B_TWELVE_CARDS = Object.freeze({
  "SNU-2B-12-001":["오늘은", "기분이", "아주", "좋아 보여요."],
  "SNU-2B-12-002":["저", "운동화는", "편해 보여요."],
  "SNU-2B-12-003":["무거운", "가방을 들어서", "힘들어 보여요."],
  "SNU-2B-12-004":["새", "머리", "모양이", "잘", "어울려 보여요."],
  "SNU-2B-12-005":["제", "친구는", "인형처럼", "눈이", "커요."],
  "SNU-2B-12-006":["형은", "가수처럼", "노래를", "잘해요."],
  "SNU-2B-12-007":["동생은", "어른같이", "말을", "재미있게", "해요."],
  "SNU-2B-12-008":["이", "아이는", "인형같이", "생겼어요."],
  "SNU-2B-12-009":["저는", "친구들보다", "조용한 편이에요."],
  "SNU-2B-12-010":["언니는", "성격이", "활발한 편이에요."],
  "SNU-2B-12-011":["제", "친구는", "눈썹이", "진한 편이에요."],
  "SNU-2B-12-012":["동생은", "어깨가", "넓은 편이에요."],
  "SNU-2B-12-013":["저는", "매운", "음식을", "잘", "먹는 편이에요."],
  "SNU-2B-12-014":["미용실에서", "머리를", "짧게", "잘랐어요."],
  "SNU-2B-12-015":["오늘은", "옷을", "예쁘게", "입었어요."],
  "SNU-2B-12-016":["친구가", "말을", "아주", "재미있게", "해요."],
  "SNU-2B-12-017":["머리를", "짧게", "다듬어 주세요."],
  "SNU-2B-12-018":["안경을 쓰니까", "더", "똑똑해 보여요."],
  "SNU-2B-12-019":["키가 크고", "어깨가 넓어서", "운동선수처럼", "보여요."],
  "SNU-2B-12-020":["제", "룸메이트는", "성격이", "급한 편이에요."]
});

/* Manually verified existing 2B lesson 13: word/eojeol cards and intact grammar clauses. */
const TWO_B_THIRTEEN_CARDS = Object.freeze({
  "SNU-2B-13-001":["학교", "근처에", "괜찮은", "원룸이", "있을지 모르겠어요."],
  "SNU-2B-13-002":["이번", "주", "안에", "집을", "구할 수 있을지 모르겠어요."],
  "SNU-2B-13-003":["방값이", "얼마일지 몰라서", "부동산에", "가려고 해요."],
  "SNU-2B-13-004":["이", "집은", "넓기는 하지만", "월세가", "비싸요."],
  "SNU-2B-13-005":["교통이", "편리하기는 하지만", "주변이", "시끄러워요."],
  "SNU-2B-13-006":["오피스텔은", "깨끗하기는 하지만", "관리비가", "많이", "나와요."],
  "SNU-2B-13-007":["학교가", "가깝기 때문에", "걸어서", "다닐 수 있어요."],
  "SNU-2B-13-008":["지하철역이", "가깝기 때문에", "생활하기", "편해요."],
  "SNU-2B-13-009":["주변이", "조용하기 때문에", "공부하기", "좋아요."],
  "SNU-2B-13-010":["방이", "넓어서", "가구를", "놓기가", "좋아요."],
  "SNU-2B-13-011":["현관이", "좁아서", "큰", "짐을", "옮기기가", "불편해요."],
  "SNU-2B-13-012":["시설이", "잘되어 있어서", "혼자", "살기가", "편해요."],
  "SNU-2B-13-013":["계약이", "끝나기 때문에", "다음", "달에", "이사해야 해요."],
  "SNU-2B-13-014":["룸메이트가", "생길지 몰라서", "방을", "하나", "더", "알아보고 있어요."],
  "SNU-2B-13-015":["집주인이", "친절할지 몰라서", "먼저", "만나 보려고 해요."],
  "SNU-2B-13-016":["전세로", "살기는 하지만", "관리비는", "따로", "내요."],
  "SNU-2B-13-017":["기숙사는", "싸기는 하지만", "방이", "조금", "좁아요."],
  "SNU-2B-13-018":["생활비가", "많이", "들기 때문에", "월세를", "아껴야 해요."],
  "SNU-2B-13-019":["시장이", "가까워서", "장을", "보기가", "편해요."],
  "SNU-2B-13-020":["전망이", "좋아서", "아침에", "일어나기가", "즐거워요."]
});

/* Existing 2B lesson 14: Korean culture, experience, -았/었을 때, -아/어도 되다,
 * -(으)면 안 되다. Word/eojeol cards; grammar chunks remain intact. */
const TWO_B_FOURTEEN_CARDS = Object.freeze({
  'SNU-2B-14-001':['한국에서','한복을','입어 본 적이 있어요.'],
  'SNU-2B-14-002':['선물을','두','손으로','드린 적이 있어요.'],
  'SNU-2B-14-003':['지하철에서','자리를','양보한 적이 있어요.'],
  'SNU-2B-14-004':['공공장소에서','실수한 적이 있어요.'],
  'SNU-2B-14-005':['한국','친구에게','반말을','해 본 적이 있어요.'],
  'SNU-2B-14-006':['한국에','처음','왔을 때','존댓말이','어려웠어요.'],
  'SNU-2B-14-007':['결혼식에','갔을 때','한복을','많이','봤어요.'],
  'SNU-2B-14-008':['술을','마셨을 때','고개를','돌렸어요.'],
  'SNU-2B-14-009':['기숙사에','살았을 때','밤에는','아주','조용했어요.'],
  'SNU-2B-14-010':['박물관에서','사진을','찍어도 돼요?'],
  'SNU-2B-14-011':['이','자리에서','휴대','전화를','사용해도 돼요?'],
  'SNU-2B-14-012':['공연장','안에서','물을','마셔도 돼요?'],
  'SNU-2B-14-013':['도서관에서는','큰','소리로','떠들면 안 돼요.'],
  'SNU-2B-14-014':['금연','구역에서는','담배를','피우면 안 돼요.'],
  'SNU-2B-14-015':['전시','작품을','손으로','만지면 안 돼요.'],
  'SNU-2B-14-016':['어른께','물건을','한','손으로','드리면 안 돼요.'],
  'SNU-2B-14-017':['기숙사에서는','밤늦게','음악을','크게','틀면 안 돼요.'],
  'SNU-2B-14-018':['공공장소에서는','쓰레기를','아무 데나','버리면 안 돼요.'],
  'SNU-2B-14-019':['규칙을','잘','모를 때는','먼저','질문해도 돼요.'],
  'SNU-2B-14-020':['문화가','다를 때','서로','예절을','존중해야 해요.']
});

/* Source-audited 2B lesson 15: -게 되다, -기 전에, -(으)ㄴ 후에 and causal/contrast chunks. */
const TWO_B_FIFTEEN_CARDS = Object.freeze({
  "SNU-2B-15-001":["한국", "생활에", "많이", "익숙해졌어요."],
  "SNU-2B-15-002":["요즘", "한국어", "실력이", "많이", "늘었어요."],
  "SNU-2B-15-003":["매운", "음식을", "잘", "먹게 되었어요."],
  "SNU-2B-15-004":["한국에 와서", "좋은", "친구를", "많이", "사귀게 되었어요."],
  "SNU-2B-15-005":["무역", "회사에", "취직하게 되었어요."],
  "SNU-2B-15-006":["다음", "달부터", "중국에서", "일하게 되었어요."],
  "SNU-2B-15-007":["대학에", "입학하기 전에", "한국어를", "배웠어요."],
  "SNU-2B-15-008":["출근하기 전에", "아침을", "꼭", "먹어요."],
  "SNU-2B-15-009":["여행을", "떠나기 전에", "가족에게", "연락했어요."],
  "SNU-2B-15-010":["대학교를", "졸업한 후에", "회사에", "취직했어요."],
  "SNU-2B-15-011":["결혼한 후에", "새", "집으로", "이사했어요."],
  "SNU-2B-15-012":["아이를", "낳은 후에", "생활이", "많이", "달라졌어요."],
  "SNU-2B-15-013":["도로가 넓어져서", "교통이", "편리해졌어요."],
  "SNU-2B-15-014":["공원이 생겨서", "동네가", "조용해졌어요."],
  "SNU-2B-15-015":["월세가 올라서", "생활비가", "많아졌어요."],
  "SNU-2B-15-016":["한국 생활에 적응하면서", "성격도", "적극적으로", "바뀌었어요."],
  "SNU-2B-15-017":["처음에는", "외로웠지만", "친구가 생겨서", "즐거워졌어요."],
  "SNU-2B-15-018":["운동을", "시작한 후에", "몸무게가", "줄었어요."],
  "SNU-2B-15-019":["한국에", "오기 전에", "회사에", "다녔어요."],
  "SNU-2B-15-020":["과장으로", "승진한 후에", "일이", "더", "많아졌어요."]
});

/* Source-audited 2B lesson 16, sentence-based word and grammar chunks. */
const TWO_B_SIXTEEN_CARDS = Object.freeze({
  "SNU-2B-16-001": [
    "설날",
    "전에",
    "기차표를",
    "미리",
    "예매해 놓았어요."
  ],
  "SNU-2B-16-002": [
    "손님이",
    "오기 전에",
    "방을",
    "닦아 놓았어요."
  ],
  "SNU-2B-16-003": [
    "차례를 지낼",
    "음식을",
    "미리",
    "준비해 놓았어요."
  ],
  "SNU-2B-16-004": [
    "여행 가기 전에",
    "숙소를",
    "예약해 놓았어요."
  ],
  "SNU-2B-16-005": [
    "설날에는",
    "밥",
    "대신",
    "떡국을",
    "먹어요."
  ],
  "SNU-2B-16-006": [
    "아침에는",
    "커피",
    "대신",
    "식혜를",
    "마실까 해요."
  ],
  "SNU-2B-16-007": [
    "이번",
    "연휴에는",
    "고향에",
    "내려갈까 해요."
  ],
  "SNU-2B-16-008": [
    "주말에",
    "부모님과",
    "윷놀이를",
    "할까 해요."
  ],
  "SNU-2B-16-009": [
    "제가",
    "장을",
    "볼 테니까",
    "집에서",
    "청소해 주세요."
  ],
  "SNU-2B-16-010": [
    "저는",
    "설거지를",
    "할 테니까",
    "세탁기를",
    "돌려 주세요."
  ],
  "SNU-2B-16-011": [
    "길이",
    "막힐 테니까",
    "일찍",
    "출발하세요."
  ],
  "SNU-2B-16-012": [
    "날씨가",
    "추울 테니까",
    "두꺼운",
    "옷을",
    "가져가세요."
  ],
  "SNU-2B-16-013": [
    "손님이",
    "많을 테니까",
    "음식을",
    "넉넉히",
    "준비해 놓으세요."
  ],
  "SNU-2B-16-014": [
    "이번에는",
    "비행기",
    "대신",
    "기차를",
    "타고",
    "갈까 해요."
  ],
  "SNU-2B-16-015": [
    "저는",
    "청소기",
    "대신",
    "걸레로",
    "방을",
    "닦을까 해요."
  ],
  "SNU-2B-16-016": [
    "연휴가",
    "짧을 테니까",
    "가까운",
    "곳으로",
    "여행할까 해요."
  ],
  "SNU-2B-16-017": [
    "부모님이",
    "오실 테니까",
    "거실을",
    "정리해 놓았어요."
  ],
  "SNU-2B-16-018": [
    "친구들이",
    "놀러 올 테니까",
    "음식을",
    "많이",
    "준비했어요."
  ],
  "SNU-2B-16-019": [
    "세배를",
    "한 후에",
    "윷놀이를",
    "할까 해요."
  ],
  "SNU-2B-16-020": [
    "집안일은",
    "제가",
    "할 테니까",
    "조금",
    "쉬세요."
  ]
});

/* Audited 2B lesson 17 only: -아/어다 주다, -는 길에, -(으)ㄹ 뻔하다, -아/어 있다.
 * Each list joins back to the unchanged original sentence, including whitespace/punctuation. */
const TWO_B_SEVENTEEN_CARDS = Object.freeze({
  "SNU-2B-17-001":["아침에", "어머니를", "공항까지", "모셔다 드렸어요."],
  "SNU-2B-17-002":["집에", "오는 길에", "신문을", "사다 주세요."],
  "SNU-2B-17-003":["부엌에서", "물을", "가져다 주세요."],
  "SNU-2B-17-004":["동생을", "학교에", "데려다 주고 왔어요."],
  "SNU-2B-17-005":["늦게", "일어나서", "비행기를", "놓칠 뻔했어요."],
  "SNU-2B-17-006":["길이 막혀서", "약속", "시간에", "늦을 뻔했어요."],
  "SNU-2B-17-007":["계단에서", "미끄러져서", "넘어질 뻔했어요."],
  "SNU-2B-17-008":["휴대", "전화를", "떨어뜨릴 뻔했어요."],
  "SNU-2B-17-009":["지하철에서", "가방을 놓고", "내릴 뻔했어요."],
  "SNU-2B-17-010":["길에서", "자동차와", "부딪힐 뻔했어요."],
  "SNU-2B-17-011":["창문이", "열려 있어서", "바람이", "많이", "들어와요."],
  "SNU-2B-17-012":["교실", "문이", "닫혀 있어서", "안으로", "들어갈 수 없어요."],
  "SNU-2B-17-013":["벽에", "여행", "사진이", "걸려 있어요."],
  "SNU-2B-17-014":["가방에", "이름표가", "붙어 있어요."],
  "SNU-2B-17-015":["분실물", "센터에", "까만", "가방이", "놓여 있어요."],
  "SNU-2B-17-016":["파란색", "구두가", "의자", "밑에", "놓여 있어요."],
  "SNU-2B-17-017":["하얀 모자를 쓴", "사람이", "저쪽에", "서 있어요."],
  "SNU-2B-17-018":["빨간색", "옷을 입으니까", "얼굴이", "더", "하얘 보여요."],
  "SNU-2B-17-019":["노란색이", "잘", "어울려서", "재킷을", "하나", "샀어요."],
  "SNU-2B-17-020":["사고가 나서", "길", "한가운데", "차가", "멈춰 있어요."]
});

/* 22nd non-operational stage: curated 1B 09 beginner noun/particle cards only. */
const ONE_B_NINE_CARDS = Object.freeze({
  "SNU-1B-09-001":["이분", "은", "우리", "할머니세요."],
  "SNU-1B-09-002":["할아버지", "는", "아침마다", "신문", "을", "읽으세요."],
  "SNU-1B-09-003":["어머니", "는", "회사", "에", "다니세요."],
  "SNU-1B-09-004":["아버지", "는", "요리", "를", "아주", "잘하세요."],
  "SNU-1B-09-005":["누나", "는", "수영", "을", "잘해요."],
  "SNU-1B-09-006":["남동생", "은", "역사", "를", "잘", "못해요."],
  "SNU-1B-09-007":["언니", "는", "대학생", "이에요."],
  "SNU-1B-09-008":["형", "은", "신문사", "에", "다녀요."],
  "SNU-1B-09-009":["여동생", "은", "중학교", "에", "다녀요."],
  "SNU-1B-09-010":["할머니", "는", "지금", "댁", "에", "계세요."],
  "SNU-1B-09-011":["할아버지", "는", "밤", "에", "일찍", "주무세요."],
  "SNU-1B-09-012":["어머니", "는", "아침", "을", "드셨어요."],
  "SNU-1B-09-013":["아버지", "는", "항상", "친절하세요."],
  "SNU-1B-09-014":["우리", "가족", "은", "모두", "여섯", "명", "이에요."],
  "SNU-1B-09-015":["저분", "성함", "이", "어떻게 되세요?"],
  "SNU-1B-09-016":["우리", "아버지", "는", "마흔여덟", "살이세요."],
  "SNU-1B-09-017":["할머니", "연세", "가", "어떻게 되세요?"],
  "SNU-1B-09-018":["누나", "는", "같은", "과", "친구", "를", "소개했어요."],
  "SNU-1B-09-019":["제", "아내", "는", "요리", "를", "잘해요."],
  "SNU-1B-09-020":["우리", "남편", "은", "회사원", "이에요."]
});
/* Explicitly reviewed, natural placements of time/frequency expressions only. */
const ONE_B_NINE_EXTRA_PATHS = Object.freeze({
  'SNU-1B-09-002':[[2,0,1,3,4,5]],
  'SNU-1B-09-010':[[2,0,1,3,4,5]],
  'SNU-1B-09-011':[[2,3,0,1,4,5]],
  'SNU-1B-09-013':[[2,0,1,3]]
});

/* 22nd non-operational stage: curated 2B 18 intermediate eojeol/clause cards only. */
const TWO_B_EIGHTEEN_CARDS = Object.freeze({
  "SNU-2B-18-001":["한국에", "온 지", "벌써", "여섯 달이", "되었어요."],
  "SNU-2B-18-002":["이", "집에", "산 지", "한 달밖에", "안 되었어요."],
  "SNU-2B-18-003":["친구를", "만난 지", "벌써", "일 년이", "되었어요."],
  "SNU-2B-18-004":["운동을", "시작한 지", "세 달이", "되었어요."],
  "SNU-2B-18-005":["한국어를", "배운 지", "얼마나", "되었어요?"],
  "SNU-2B-18-006":["어제는", "눈이", "삼십 센티미터나", "내렸어요."],
  "SNU-2B-18-007":["한국에 와서", "친구가", "열 명이나", "생겼어요."],
  "SNU-2B-18-008":["어제는", "기온이", "영하 십 도나", "내려갔어요."],
  "SNU-2B-18-009":["장마가 시작돼서", "비가", "일주일이나", "내렸어요."],
  "SNU-2B-18-010":["오늘은", "바람이", "아주 세게", "분다."],
  "SNU-2B-18-011":["봄에는", "꽃이", "많이", "핀다."],
  "SNU-2B-18-012":["여름에는", "습도가 높아서", "땀이", "많이", "난다."],
  "SNU-2B-18-013":["가을에는", "단풍이 들고", "나뭇잎이", "떨어진다."],
  "SNU-2B-18-014":["겨울에는", "기온이", "영하로 내려가고", "눈이", "내린다."],
  "SNU-2B-18-015":["한국의", "여름은", "덥고", "습하다."],
  "SNU-2B-18-016":["오늘", "밤은", "날씨가", "아주", "쌀쌀하다."],
  "SNU-2B-18-017":["저는", "한국에서 공부하는", "학생이다."],
  "SNU-2B-18-018":["고향이 그리울 때", "친구들과", "이야기한다."],
  "SNU-2B-18-019":["시험에 합격해서", "정말", "기쁘다."],
  "SNU-2B-18-020":["친구와 헤어져서", "마음이", "많이", "슬프다."]
});

/* 23rd staging: exact 1B 10 beginner lesson cards; the original JSON remains untouched. */
const ONE_B_TEN_CARDS = Object.freeze({
  "SNU-1B-10-001":["저", "는", "오전", "일곱 시", "에", "일어나요."],
  "SNU-1B-10-002":["아침", "에", "세수하고", "이", "를", "닦아요."],
  "SNU-1B-10-003":["오전", "아홉 시", "부터", "열두 시", "까지", "수업", "이", "있어요."],
  "SNU-1B-10-004":["점심", "은", "한 시쯤", "에", "먹어요."],
  "SNU-1B-10-005":["오후", "두 시", "에", "회의", "를", "시작해요."],
  "SNU-1B-10-006":["회의", "는", "오후", "네 시", "에", "끝나요."],
  "SNU-1B-10-007":["저", "는", "여섯 시", "에", "퇴근해요."],
  "SNU-1B-10-008":["집", "에", "와서", "바로", "샤워해요."],
  "SNU-1B-10-009":["저녁", "을", "먹고", "빨래할 거예요."],
  "SNU-1B-10-010":["오늘", "밤", "에", "방", "을", "청소할 거예요."],
  "SNU-1B-10-011":["내일", "오전", "에", "박물관", "에", "갈 거예요."],
  "SNU-1B-10-012":["주말", "에", "친구", "하고", "케이크", "를", "만들 거예요."],
  "SNU-1B-10-013":["오후", "세 시", "에", "꽃집", "에서", "친구", "를", "만나요."],
  "SNU-1B-10-014":["친구", "를", "만나서", "선물", "을", "같이", "골랐어요."],
  "SNU-1B-10-015":["아침", "부터", "낮", "까지", "운전했어요."],
  "SNU-1B-10-016":["저녁", "에", "어머니", "께", "전화할 거예요."],
  "SNU-1B-10-017":["내일", "약속", "시간", "을", "정할 거예요."],
  "SNU-1B-10-018":["퇴근해서", "집", "에서", "그림", "을", "그렸어요."],
  "SNU-1B-10-019":["오늘", "은", "별일", "이", "없어서", "일찍", "잘 거예요."],
  "SNU-1B-10-020":["매일", "아침", "한국어", "발음", "을", "연습할 거예요."]
});

/* Explicit natural temporal alternatives in this lesson only (card indexes, no permutations). */
const ONE_B_TEN_EXTRA_PATHS = Object.freeze({
  'SNU-1B-10-017':[[1,2,3,0,4]],
  'SNU-1B-10-020':[[2,3,4,0,1,5]]
});

/* 23rd staging: exact 3A 01 intermediate eojeol + quoted/clausal grammar cards. */
const THREE_A_ONE_CARDS = Object.freeze({
  "SNU-3A-01-001":["크리스 씨는", "요즘", "바쁘다고 해요."],
  "SNU-3A-01-002":["마이클 씨는", "모임에", "참석 못 한다고 했어요."],
  "SNU-3A-01-003":["민수 씨", "동생은", "고등학생이라고 해요."],
  "SNU-3A-01-004":["저도", "한번", "읽어 봐야겠네요."],
  "SNU-3A-01-005":["이번", "주말에는", "방을", "청소해야겠어요."],
  "SNU-3A-01-006":["약을 먹고", "쉬어야겠어요."],
  "SNU-3A-01-007":["감기에", "걸린 것 같아요."],
  "SNU-3A-01-008":["수미 씨가", "요즘", "회사 일 때문에", "바쁘다고 들었어요."],
  "SNU-3A-01-009":["다니엘 씨가", "방학에", "고향에", "간다고 들었어요."],
  "SNU-3A-01-010":["한국 사람들은", "매일", "김치를", "먹는다고 들었는데", "맞아요?"],
  "SNU-3A-01-011":["10월 9일이", "한글날이라고 들었어요."],
  "SNU-3A-01-012":["요즘", "아침을", "안 먹는 사람들이", "많대요."],
  "SNU-3A-01-013":["이번", "학기에", "시험을", "두 번", "본대요."],
  "SNU-3A-01-014":["토니 씨의", "취미는", "요리하는 거래요."],
  "SNU-3A-01-015":["우리 대학", "신입생 환영회를", "한다고 해요."],
  "SNU-3A-01-016":["이번 주", "금요일", "저녁", "6시예요."],
  "SNU-3A-01-017":["유진 씨도", "신입생 환영회에", "참석할 거예요?"],
  "SNU-3A-01-018":["네,", "선배들도", "많이 오고", "교수님도", "오실 거라고 해요."],
  "SNU-3A-01-019":["여러 사람들과", "인사할 수 있는", "좋은", "기회인 것 같아요."],
  "SNU-3A-01-020":["그럼", "저도", "꼭", "가야겠네요."]
});

/* 24th stage only: curated 1B 11 beginner noun/particle + intact negative and -지 마세요 / -아어야 돼요. */
const ONE_B_ELEVEN_CARDS = Object.freeze({
  "SNU-1B-11-001": [
    "감기",
    "에",
    "걸려서",
    "기침",
    "이",
    "심해요."
  ],
  "SNU-1B-11-002": [
    "오늘",
    "은",
    "열",
    "이",
    "있지만",
    "수업",
    "에",
    "왔어요."
  ],
  "SNU-1B-11-003": [
    "목",
    "이",
    "아파서",
    "말",
    "을",
    "많이",
    "안 해요."
  ],
  "SNU-1B-11-004": [
    "허리",
    "가",
    "아프지만",
    "천천히",
    "걸을 수 있어요."
  ],
  "SNU-1B-11-005": [
    "여기",
    "에서는",
    "담배",
    "를",
    "피우지 마세요."
  ],
  "SNU-1B-11-006": [
    "감기",
    "에",
    "걸렸을 때",
    "술",
    "을",
    "마시지 마세요."
  ],
  "SNU-1B-11-007": [
    "머리",
    "가",
    "아프면",
    "너무",
    "걱정하지 마세요."
  ],
  "SNU-1B-11-008": [
    "오늘",
    "은",
    "물",
    "만",
    "많이",
    "마셨어요."
  ],
  "SNU-1B-11-009": [
    "아침",
    "에는",
    "빵",
    "만",
    "먹었어요."
  ],
  "SNU-1B-11-010": [
    "저",
    "는",
    "오른쪽",
    "다리",
    "만",
    "아파요."
  ],
  "SNU-1B-11-011": [
    "내일",
    "까지",
    "리포트",
    "를",
    "써야 돼요."
  ],
  "SNU-1B-11-012": [
    "오늘",
    "저녁",
    "에는",
    "일찍",
    "자야 돼요."
  ],
  "SNU-1B-11-013": [
    "밥",
    "을",
    "먹고",
    "약",
    "을",
    "먹어야 돼요."
  ],
  "SNU-1B-11-014": [
    "수업",
    "전에",
    "휴대폰",
    "을",
    "꺼야 돼요."
  ],
  "SNU-1B-11-015": [
    "몸",
    "이",
    "아프면",
    "충분히",
    "쉬어야 돼요."
  ],
  "SNU-1B-11-016": [
    "무릎",
    "이",
    "아파서",
    "운동",
    "을",
    "안 했어요."
  ],
  "SNU-1B-11-017": [
    "콧물",
    "이",
    "나지만",
    "열",
    "은",
    "없어요."
  ],
  "SNU-1B-11-018": [
    "어깨",
    "가",
    "아파서",
    "무거운",
    "가방",
    "을",
    "안 들어요."
  ],
  "SNU-1B-11-019": [
    "안내문",
    "을",
    "읽고",
    "규칙",
    "을",
    "지켜야 돼요."
  ],
  "SNU-1B-11-020": [
    "친구",
    "에게",
    "걱정거리",
    "를",
    "이야기하고",
    "조언",
    "을",
    "들었어요."
  ]
});
/* 24th stage only: curated 3A 02 middle grammar chunks for -자마자, reported commands, -느라고, negative verbs. */
const THREE_A_TWO_CARDS = Object.freeze({
  "SNU-3A-02-001": [
    "시험이",
    "끝나자마자",
    "고향에",
    "돌아갈 거예요."
  ],
  "SNU-3A-02-002": [
    "내 친구는",
    "항상",
    "밥을",
    "먹자마자",
    "이를",
    "닦아."
  ],
  "SNU-3A-02-003": [
    "동생한테",
    "청소하라고 했어요."
  ],
  "SNU-3A-02-004": [
    "어머니께서",
    "게임을",
    "하지 말라고 하셨어요."
  ],
  "SNU-3A-02-005": [
    "친구가",
    "나에게",
    "돈을",
    "빌려 달라고 했어요."
  ],
  "SNU-3A-02-006": [
    "선생님께서",
    "나나 씨에게",
    "책을",
    "보여 주라고 하셨어요."
  ],
  "SNU-3A-02-007": [
    "청소하느라고",
    "점심을",
    "못 먹었어요."
  ],
  "SNU-3A-02-008": [
    "요즘",
    "결혼 준비하느라고",
    "바쁘시죠?"
  ],
  "SNU-3A-02-009": [
    "어젯밤에",
    "책을",
    "읽느라고",
    "잠을",
    "못 잤어요."
  ],
  "SNU-3A-02-010": [
    "한국 사람은",
    "누구나",
    "김치를",
    "좋아하는 것 같아요."
  ],
  "SNU-3A-02-011": [
    "출퇴근 시간에는",
    "언제나",
    "길이",
    "막혀요."
  ],
  "SNU-3A-02-012": [
    "스티븐 씨는",
    "무슨 운동이나",
    "잘해요."
  ],
  "SNU-3A-02-013": [
    "네,",
    "요즘",
    "잠을",
    "잘 못 자서",
    "그래요."
  ],
  "SNU-3A-02-014": [
    "할 일이",
    "많아요?"
  ],
  "SNU-3A-02-015": [
    "어제도",
    "룸메이트 때문에",
    "한숨도",
    "못 잤어요."
  ],
  "SNU-3A-02-016": [
    "매일",
    "새벽에",
    "들어와요."
  ],
  "SNU-3A-02-017": [
    "그리고",
    "눕자마자",
    "코를",
    "골아요."
  ],
  "SNU-3A-02-018": [
    "게다가",
    "밤새도록",
    "시끄럽게",
    "잠꼬대도",
    "해요."
  ],
  "SNU-3A-02-019": [
    "기숙사 조교한테",
    "방을",
    "바꿔 달라고 했어요."
  ],
  "SNU-3A-02-020": [
    "알람이",
    "울리자마자",
    "일어나서",
    "스트레칭을",
    "해요."
  ]
});

/* Two checked positions of 요즘; no cross-clause automatic permutation. */
const THREE_A_ONE_EXTRA_PATHS = Object.freeze({
  'SNU-3A-01-001':[[1,0,2]],
  'SNU-3A-01-008':[[1,0,2,3]]
});

/* Only audited 1A-06 noun + conjunctive particle 하고; predicates such as 쇼핑하고 are NOT split. */
const ONE_A_SIX_HAGO_IDS = new Set([
  'SNU-1A-06-009','SNU-1A-06-010','SNU-1A-06-011','SNU-1A-06-012','SNU-1A-06-020'
]);

/* Explicit alternate for temporal location in existing 1A lesson 3, and audited 1A lesson 4. */
const ONE_A_EXTRA_PATHS = Object.freeze({
  'SNU-1A-03-020':[[2,3,0,1,4,5,6]],
  'SNU-1A-04-011':[[2,0,1,3,4,5]],
  'SNU-1A-04-012':[[2,3,0,1,4,5,6]],
  'SNU-1A-04-014':[[2,3,0,1,4,5,6]],
  'SNU-1A-07-001':[[1,2,0,3,4]],
  'SNU-1A-07-008':[[2,3,0,1,4]],
  'SNU-1A-07-016':[[1,2,0,3]]
});

/* Only audited, naturally acceptable additional paths; never permute clauses. */
const TWO_B_EXTRA_PATHS = Object.freeze({
  'SNU-2B-10-006':[[1,0,2,3]],
  'SNU-2B-10-016':[[1,0,2,3]],
  'SNU-2B-11-006':[[1,0,2,3]],
  'SNU-2B-11-014':[[1,0,2,3,4]],
  'SNU-2B-12-001':[[1,0,2,3]],
  'SNU-2B-15-002':[[1,2,0,3,4]],
  'SNU-2B-16-001':[[0,1,3,2,4]]
});




function terminalBase(value) {
  return String(value || '').trim().replace(/[.!?。！？]+$/g, '');
}
function normalizedDisplay(value) {
  return String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
}
function getCardType(text, last) {
  if (last) return 'predicate';
  if (ADVERBS.has(text)) return 'adverb';
  if (/(?:는데|은데|인데|한데|싼데|지만|때문에|먹고|보고|자서|어서|아서|는 게|는 게 어때요\?|나으려면|부었으면|나면|아프면|가려우면|나으면|심하면|들어서|쓰니까|크고|넓어서|안 좋으면|안 되면|건강을 위해|열이 날 때마다|얼굴이 부어서|배탈이 나서|기침이 나서)$/.test(text)) return 'clause';
  return 'noun_phrase';
}
function isPermutation(order, total) {
  return Array.isArray(order) && order.length === total &&
    new Set(order).size === total &&
    order.every(n => Number.isInteger(n) && n >= 0 && n < total);
}
export function isSentenceCardV1Pilot({source,book,lesson}) {
  return source === 'snu' &&
    ((book === '1A' && (Number(lesson) === 1 || Number(lesson) === 2 || Number(lesson) === 3 || Number(lesson) === 4 || Number(lesson) === 5 || Number(lesson) === 6 || Number(lesson) === 7 || Number(lesson) === 8)) ||
      (book === '1B' && (Number(lesson) === 9 || Number(lesson) === 10 || Number(lesson) === 11)) ||
      (book === '3A' && (Number(lesson) === 1 || Number(lesson) === 2)) ||
      (book === '2B' && (Number(lesson) === 10 || Number(lesson) === 11 || Number(lesson) === 12 || Number(lesson) === 13 || Number(lesson) === 14 || Number(lesson) === 15 || Number(lesson) === 16 || Number(lesson) === 17 || Number(lesson) === 18)));
}
export function prepareSentenceCardV1(question, {source,book,lesson}) {
  if (!isSentenceCardV1Pilot({source,book,lesson})) return question;
  const q = {...question};
  if (book === '1B') {
    const parts = ONE_B_NINE_CARDS[q.id] || ONE_B_TEN_CARDS[q.id] || ONE_B_ELEVEN_CARDS[q.id];
    if (!parts) return question; // Never touch unscreened or teacher-created questions.
    const tokens = parts.map((text,i) => [String(q.id) + '__v1_' + i,text]);
    const meta = {};
    tokens.forEach(([id,text],i) => {
      const base = terminalBase(text);
      // '과' in '같은 과 친구' means a university department, NOT a particle.
      const isDepartment = q.id === 'SNU-1B-09-018' && base === '과';
      // '이' in '이를 닦아요' is the noun tooth, not the nominative particle.
      const isToothNoun = q.id === 'SNU-1B-10-002' && base === '이';
      const ending = ENDINGS.has(base);
      const particle = (PARTICLES.has(base) || (Number(lesson) === 11 && ['에는','에서는'].includes(base))) && !isDepartment && !isToothNoun;
      const attach = particle || ending;
      const timeAdverb = (Number(lesson) === 11 && ['오늘','내일','일찍'].includes(base) && !['은','는'].includes(terminalBase(tokens[i+1]?.[1]))) || ['아침마다','지금','항상','일찍'].includes(base) ||
        (Number(lesson) === 10 && ['내일','매일','오전','오후','오늘'].includes(base) &&
        // Today + topic particle: [오늘][은] must allow the bound topic particle.
        !PARTICLES.has(terminalBase(tokens[i+1]?.[1] || '')));
      const mannerAdverb = (Number(lesson) === 11 && ['많이','천천히','너무','충분히'].includes(base)) || ['아주','잘','모두'].includes(base) ||
        (Number(lesson) === 10 && ['바로','같이'].includes(base));
      const type = ending ? 'ending' : particle ? 'particle' : i === tokens.length - 1 ? 'predicate' :
        timeAdverb || mannerAdverb ? 'adverb' : 'noun';
      meta[id] = {type,attachToPrev:attach,attachToId:attach ? (tokens[i - 1]?.[0] || null) : null,
        ...(type === 'adverb' ? {subType:timeAdverb ? 'time' : 'manner'} : {})};
    });
    const assembled = tokens.map(([id,text],i) => (i && !meta[id].attachToPrev ? ' ' : '') + text).join('');
    if (normalizedDisplay(assembled) !== normalizedDisplay(q.displaySentence)) {
      console.warn('Sentence Card V1 skipped: 1B sentence differs from audited original',q.id);
      return question;
    }
    const primary = tokens.map(t => t[0]);
    const paths = [primary];
    (ONE_B_NINE_EXTRA_PATHS[q.id] || ONE_B_TEN_EXTRA_PATHS[q.id] || []).forEach(indices => {
      if (!isPermutation(indices,tokens.length)) throw new Error('Invalid 1B alternate: ' + q.id);
      paths.push(indices.map(i => tokens[i][0]));
    });
    return {...q,tokens,acceptedOrders:paths.map(x => [...x]),validPaths:paths.map(x => [...x]),
      cardMeta:meta,flexibleFrames:[],cardRuleVersion:'V1-PILOT'};
  }
  if (book === '1A') {
    // Preserve 1A lesson-1 copula cards, the original token IDs and all teacher materials.
    const sourceTokens = (q.tokens || []).map(([id,text]) => [String(id),String(text)]);
    // A lexical card holds one written word; beginner particles remain separate.
    // Expand only space-containing source cards in the audited 1A lesson.
    const splitMap = new Map();
    const lexicalSplitIds = new Set();
    const tokens = sourceTokens.flatMap(([id,text]) => {
      // 1A6 conjunctive noun particle 하고: split just the five verified nouns.
    // Do not change conjugated verbs such as 쇼핑하고 / 세수하고 / 만나고.
    if (Number(lesson) === 6 && ONE_A_SIX_HAGO_IDS.has(q.id) && text.endsWith('하고') && text.length > 2) {
      const head = [id+'__v1_conj_noun', text.slice(0,-2)];
      const particle = [id+'__v1_conj_particle','하고'];
      splitMap.set(id,[head[0],particle[0]]);
      lexicalSplitIds.add(head[0]);
      return [head,particle];
    }
    const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length <= 1) {splitMap.set(id,[id]);return [[id,text]];}
      const pieces = words.map((word,i) => [id + '__v1_word_' + i,word]);
      splitMap.set(id,pieces.map(item => item[0]));
      pieces.forEach(item => lexicalSplitIds.add(item[0]));
      return pieces;
    });
    const originalPaths = (q.acceptedOrders || []).length ? q.acceptedOrders : [sourceTokens.map(x => x[0])];
    const extraOrders = (ONE_A_EXTRA_PATHS[q.id] || []).map(indices => {
      if (!isPermutation(indices,sourceTokens.length)) throw new Error('Invalid 1A alternate: ' + q.id);
      return indices.map(i => sourceTokens[i][0]);
    });
    const paths = [...originalPaths,...extraOrders].map(order => order.flatMap(id => splitMap.get(id) || [id]));
    const path = paths[0];
    // The specification requires the sentence-final punctuation on the final card.
    const suffix = String(q.displaySentence || '').trim().match(/[.!?]$/)?.[0] || '';
    const finalId = path[path.length - 1];
    const finalToken = tokens.find(t => t[0] === finalId);
    if (suffix && finalToken && !/[.!?]$/.test(finalToken[1])) finalToken[1] += suffix;
    const label = new Map(tokens);
    const meta = {};
    path.forEach((id,index) => {
      const text = label.get(id) || '';
      const base = terminalBase(text);
      // 1A-05 '이를 닦다': 이 means tooth (noun), not nominative '이'.
      // Scope the exception to this audited source sentence so older lessons stay byte-identical.
      const isToothNoun = q.id === 'SNU-1A-05-017' && base === '이' &&
        terminalBase(label.get(path[index + 1])) === '를';
      const newDeterminer = Number(lesson) === 7 && index === 0 &&
        (q.id === 'SNU-1A-07-010' || q.id === 'SNU-1A-07-013');
      const newCompoundParticle = Number(lesson) === 7 && base === '에는';
      const newTimeAdverb = (q.id === 'SNU-1A-05-013' && base === '내일') ||
        (Number(lesson) === 7 && (base === '오늘' || base === '요즘')) ||
        (Number(lesson) === 8 && (base === '오늘' || base === '내일'));
      const newMannerAdverb = (q.id === 'SNU-1A-05-019' && base === '같이') ||
        (Number(lesson) === 6 && (base === '같이' || base === '잠깐만')) ||
        (Number(lesson) === 7 && ['아주','너무','조금','많이'].includes(base)) ||
        (Number(lesson) === 8 && (base === '같이' || base === '또'));
      const attach = !isToothNoun && !newDeterminer && !lexicalSplitIds.has(id) && (PARTICLES.has(base) || newCompoundParticle || ENDINGS.has(base));
      const type = isToothNoun || newDeterminer || lexicalSplitIds.has(id) ? 'noun' : (PARTICLES.has(base) || newCompoundParticle) ? 'particle' :
        ENDINGS.has(base) ? 'ending' : (newTimeAdverb || newMannerAdverb || ADVERBS.has(base)) ? 'adverb' :
        (Number(lesson) === 8 && index === path.length - 1 ? 'predicate' : 'noun');
      meta[id] = {type, attachToPrev:attach, attachToId:attach ? (path[index - 1] || null) : null,
        ...(newTimeAdverb ? {subType:'time'} : newMannerAdverb ? {subType:'manner'} : {})};
    });
    // Only the textbook-approved orders. Do NOT use global flexible permutations.
    return {...q, tokens, acceptedOrders:paths.map(x => [...x]), cardMeta:meta, validPaths:paths.map(x => [...x]), flexibleFrames:[], cardRuleVersion:'V1-PILOT'};
  }
  if (book === '3A') {
    // Only audited textbook sentences; preserve any teacher-edited or unknown question.
    const parts = THREE_A_ONE_CARDS[q.id] || THREE_A_TWO_CARDS[q.id];
    if (!parts) return question;
    if (normalizedDisplay(parts.join(' ')) !== normalizedDisplay(q.displaySentence)) {
      console.warn('Sentence Card V1 skipped: 3A sentence differs from audited original',q.id);
      return question;
    }
    const tokens = parts.map((text,i) => [String(q.id) + '__v1_' + i,text]);
    const timeWords = new Set(['요즘','매일','한번','항상','언제나','어제도','그리고','게다가','어젯밤에']);
    const mannerWords = new Set(['꼭','밤새도록','시끄럽게']);
    const internalClauses = new Set(['약을 먹고','회사 일 때문에','먹는다고 들었는데',
      '안 먹는 사람들이','많이 오고','인사할 수 있는','먹자마자','끝나자마자','울리자마자','눕자마자','청소하느라고','결혼 준비하느라고','읽느라고','잘 못 자서','하지 말라고 하셨어요.','빌려 달라고 했어요.','보여 주라고 하셨어요.','바꿔 달라고 했어요.']);
    const meta = {};
    tokens.forEach(([id,text],i) => {
      const last = i === tokens.length-1;
      const type = last ? 'predicate' : timeWords.has(text) || mannerWords.has(text) ? 'adverb' :
        internalClauses.has(text) ? 'clause' : 'noun_phrase';
      const subType = timeWords.has(text) ? 'time' : 'manner';
      meta[id] = {type,attachToPrev:false,attachToId:null,
        ...(type === 'adverb'?{subType}:{}),
        ...(/(^|\s)(?:안|못)\s/.test(text)?{hasNegative:true}:{})};
    });
    const primary = tokens.map(t=>t[0]);
    const paths = [primary];
    (THREE_A_ONE_EXTRA_PATHS[q.id] || []).forEach(indices => {
      if (!isPermutation(indices,tokens.length)) throw new Error('Invalid 3A alternate: ' + q.id);
      paths.push(indices.map(i=>tokens[i][0]));
    });
    return {...q,tokens,acceptedOrders:paths.map(x=>[...x]),validPaths:paths.map(x=>[...x]),
      cardMeta:meta,flexibleFrames:[],cardRuleVersion:'V1-PILOT'};
  }
  const parts = TWO_B_CARDS[q.id] || TWO_B_ELEVEN_CARDS[q.id] || TWO_B_TWELVE_CARDS[q.id] || TWO_B_THIRTEEN_CARDS[q.id] || TWO_B_FOURTEEN_CARDS[q.id] || TWO_B_FIFTEEN_CARDS[q.id] || TWO_B_SIXTEEN_CARDS[q.id] || TWO_B_SEVENTEEN_CARDS[q.id] || TWO_B_EIGHTEEN_CARDS[q.id];
  if (!parts) return question; // Fail closed if a custom/new question is not audited.
  if (normalizedDisplay(parts.join(' ')) !== normalizedDisplay(q.displaySentence)) {
    console.warn('Sentence Card V1 skipped: 2B sentence text differs from audited original', q.id);
    return question;
  }
  const tokens = parts.map((text,i) => [String(q.id) + '__v1_' + i,text]);
  const primary = tokens.map(t => t[0]);
  const validPaths = [primary];
  const extras = TWO_B_EXTRA_PATHS[q.id] || [];
  extras.forEach(indices => {
    if (!isPermutation(indices,tokens.length)) throw new Error('Invalid alternate path: ' + q.id);
    validPaths.push(indices.map(i => tokens[i][0]));
  });
  const meta = {};
  tokens.forEach(([id,text],i) => {
    // Keep -(으)ㄹ 때 clauses and time/manner adverb cards typed correctly for 2B-14 only.
    const grammarTimeClause = Number(lesson) === 14 && /^(?:왔을|갔을|마셨을|살았을|모를|다를) 때(?:는)?$/.test(text);
    const lesson14Adverb = Number(lesson) === 14 && ['처음','밤늦게','크게','서로','아무 데나'].includes(text);
    const lesson15Adverb = Number(lesson) === 15 && ['꼭','적극적으로','처음에는'].includes(text);
    const lesson15GrammarClause = Number(lesson) === 15 && /(?:기 전에|한 후에|은 후에|와서|면서|지만|져서|겨서|라서)$/.test(text);
    const lesson16GrammarClause = Number(lesson) === 16 && /(?:기 전에|한 후에|테니까|차례를 지낼)$/.test(text);
    const lesson16Adverb = Number(lesson) === 16 && ['넉넉히','일찍','조금'].includes(text);
    const lesson17GrammarClause = Number(lesson) === 17 && /(?:오는 길에|일어나서|막혀서|미끄러져서|가방을 놓고|열려 있어서|닫혀 있어서|모자를 쓴|옷을 입으니까|어울려서|사고가 나서)$/.test(text);
    const lesson17Adverb = Number(lesson) === 17 && text === '늦게';
    const lesson18Clause = Number(lesson) === 18 && /(?:온 지|산 지|만난 지|시작한 지|배운 지|한국에 와서|장마가 시작돼서|습도가 높아서|단풍이 들고|영하로 내려가고|한국에서 공부하는|고향이 그리울 때|시험에 합격해서|친구와 헤어져서|덥고)$/.test(text);
    const lesson18Adverb = Number(lesson) === 18 && ['벌써','얼마나','어제는','오늘은','오늘','많이','정말','아주'].includes(text);
    const type = grammarTimeClause || lesson15GrammarClause || lesson16GrammarClause || lesson17GrammarClause || lesson18Clause ? 'clause' : lesson14Adverb || lesson15Adverb || lesson16Adverb || lesson17Adverb || lesson18Adverb ? 'adverb' : getCardType(text,i === tokens.length-1);
    const subType = (Number(lesson) === 16 && text === '일찍') ? 'time' : ['처음','처음에는','밤늦게'].includes(text) ? 'time' : (Number(lesson) === 18 && ['벌써','어제는','오늘은','오늘'].includes(text)) ? 'time' : TEMPORAL_ADVERBS.has(text) ? 'time' : 'manner';
    meta[id] = {type,attachToPrev:false,attachToId:null,...(type==='adverb'?{subType}:{}),...(/(^|\s)(?:안|못)\s/.test(text)?{hasNegative:true}:{})};
  });
  return {...q,tokens,acceptedOrders:validPaths.map(x => [...x]),validPaths,
    cardMeta:meta,flexibleFrames:[],cardRuleVersion:'V1-PILOT'};
}




/* Reject bare/misattached 1A particles and endings without revealing the full answer. */
export function canPlaceSentenceCardV1(placedIds, cardId, cardMeta) {
  const item = cardMeta && cardMeta[cardId];
  if (!item || !item.attachToPrev) return true;
  const prior = Array.isArray(placedIds) ? placedIds[placedIds.length - 1] : null;
  return Boolean(prior && item.attachToId === prior);
}
/* Visually bind each particle/ending to its head; other tokens keep their gap. */
export function groupPlacedSentenceCardsV1(chosenTokens, cardMeta) {
  const groups = [];
  (chosenTokens || []).forEach(token => {
    const item = cardMeta && cardMeta[String(token[0])];
    if (item && item.attachToPrev && groups.length &&
        String(groups[groups.length - 1][groups[groups.length - 1].length - 1][0]) === String(item.attachToId)) {
      groups[groups.length - 1].push(token);
    }
    else groups.push([token]);
  });
  return groups;
}
export function sentenceCardV1ExpectedCount() {
  return {beginner:160 + Object.keys(ONE_B_NINE_CARDS).length + Object.keys(ONE_B_TEN_CARDS).length + Object.keys(ONE_B_ELEVEN_CARDS).length, intermediate:Object.keys(TWO_B_CARDS).length + Object.keys(TWO_B_ELEVEN_CARDS).length + Object.keys(TWO_B_TWELVE_CARDS).length + Object.keys(TWO_B_THIRTEEN_CARDS).length + Object.keys(TWO_B_FOURTEEN_CARDS).length + Object.keys(TWO_B_FIFTEEN_CARDS).length + Object.keys(TWO_B_SIXTEEN_CARDS).length + Object.keys(TWO_B_SEVENTEEN_CARDS).length + Object.keys(TWO_B_EIGHTEEN_CARDS).length + Object.keys(THREE_A_ONE_CARDS).length + Object.keys(THREE_A_TWO_CARDS).length};
}