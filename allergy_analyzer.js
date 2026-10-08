// 팀원 C: OCR 텍스트 → 알레르기 성분 분석
// Node.js에서 바로 실행 가능 (외부 패키지 없음)
//
// 사용법 (다른 파일에서):
//   const { analyzeText } = require("./allergy_analyzer");
//   const result = analyzeText(OCR로_읽은_글자, ["마늘", "토마토"]);

const fs = require("fs");

// ========================================
// 알레르기 성분 사전 (성분표에 적히는 여러 이름들)
// ========================================

const ALIAS = {
  "마늘": [
    "마늘", "마늘베이스", "다진마늘", "마늘분말", "garlic"
  ],
  "토마토": [
    "토마토", "토마토소스", "토마토페이스트", "토마토농축", "tomato"
  ]
};

// ========================================
// 텍스트 정리
// OCR은 "마 늘"처럼 글자 사이에 공백/줄바꿈을 넣는 일이 많아서
// 공백을 전부 지우고 비교한다.
// ========================================

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, "");
}

// ========================================
// 제조시설(혼입) 안내 문장 찾기
// ========================================

// 이 표현이 나오면 "같은 시설에서 제조" 안내 문장으로 본다.
const FACILITY_KEYWORDS = [
  "사용한제품과같은",
  "같은제조시설",
  "같은시설",
  "같은생산라인",
  "같은제조라인",
  "제조시설에서제조",
  "혼입가능",
  "혼입될수"
];

// 안내 문장은 보통 이 말로 시작한다.
const SENTENCE_STARTERS = ["이제품은", "본제품은", "이제품에는", "본제품에는"];

// 가장 먼저 나오는 제조시설 표현의 위치 (없으면 -1)
function findFacilityKeyword(text) {
  let first = -1;

  for (const keyword of FACILITY_KEYWORDS) {
    const index = text.indexOf(keyword);
    if (index !== -1 && (first === -1 || index < first)) first = index;
  }

  return first;
}

function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

// 안내 문장이 시작되는 위치 찾기.
// 성분표에는 "이 제품은 토마토를 사용한 제품과 같은 제조시설에서..."처럼
// 알레르기 성분 이름이 "같은 제조시설"보다 앞에 나오므로,
// 문장의 시작점부터 잘라야 원재료로 잘못 판정하지 않는다.
function findSentenceStart(text, keywordIndex) {
  const head = text.slice(0, keywordIndex);

  // 1순위: "이 제품은 / 본 제품은"
  let start = -1;
  for (const starter of SENTENCE_STARTERS) {
    start = Math.max(start, head.lastIndexOf(starter));
  }
  if (start !== -1) return start;

  // 2순위: 바로 앞 문장의 마침표 (단, "1.5%" 같은 소수점은 제외)
  for (let i = head.length - 1; i >= 0; i--) {
    if (head[i] !== ".") continue;
    if (isDigit(head[i - 1] || "") && isDigit(head[i + 1] || "")) continue;
    return i + 1;
  }

  // 못 찾으면 표현이 나온 자리부터 (앞부분은 원재료로 취급 = 더 조심하는 쪽)
  return keywordIndex;
}

// 안내 문장이 끝나는 위치 (다음 마침표까지, 없으면 끝까지)
function findSentenceEnd(text, keywordIndex) {
  const index = text.indexOf(".", keywordIndex);
  return index === -1 ? text.length : index + 1;
}

// OCR 전체 글자를 "원재료 부분"과 "제조시설 안내 부분"으로 나눈다.
function splitFacility(text) {
  let rest = normalize(text);
  let ingredientsText = "";
  let facilityText = "";

  while (true) {
    const keywordIndex = findFacilityKeyword(rest);
    if (keywordIndex === -1) break;

    const start = findSentenceStart(rest, keywordIndex);
    const end = findSentenceEnd(rest, keywordIndex);

    ingredientsText += rest.slice(0, start);
    facilityText += rest.slice(start, end);
    rest = rest.slice(end);
  }

  ingredientsText += rest;

  return { ingredientsText, facilityText };
}

// ========================================
// 알레르기 분석
// ========================================

function hasIngredient(text, allergy) {
  const normalized = normalize(text);
  return (ALIAS[allergy] || [allergy]).some(keyword =>
    normalized.includes(normalize(keyword))
  );
}

// 원재료 글자 / 제조시설 글자가 이미 나뉘어 있을 때
function analyze({ ingredientsText = "", facilityText = "", allergies = [] }) {
  const direct = [];
  const facility = [];

  for (const allergy of allergies) {
    if (hasIngredient(ingredientsText, allergy)) direct.push(allergy);
    else if (hasIngredient(facilityText, allergy)) facility.push(allergy);
  }

  let status = "none";
  if (direct.length > 0) status = "danger";
  else if (facility.length > 0) status = "caution";

  return {
    status,
    statusText: {
      danger: "알레르기 성분이 원재료에 포함되어 있습니다.",
      caution: "알레르기 유발 성분이 같은 제조시설에서 취급되어 주의가 필요합니다.",
      none: "등록된 알레르기 성분이 확인되지 않았습니다. OCR/표시 누락 가능성이 있으므로 포장지 확인이 필요합니다."
    }[status],
    directMatches: direct,
    facilityMatches: facility
  };
}

// OCR로 읽은 글자 전체를 그대로 넣을 때 (나누기 + 분석을 한 번에)
function analyzeText(ocrText = "", allergies = []) {
  const { ingredientsText, facilityText } = splitFacility(ocrText);
  return analyze({ ingredientsText, facilityText, allergies });
}

// ========================================
// 예시 실행: node allergy_analyzer.js
// ========================================

if (require.main === module) {
  const data = JSON.parse(fs.readFileSync("./food_data.json", "utf-8"));

  for (const food of data.foods) {
    const result = analyze({
      ingredientsText: food.ingredients_text,
      facilityText: food.facility_text,
      allergies: data.user_allergies
    });

    console.log(`\n[${food.name}] ${food.product}`);
    console.log(result);
  }
}

module.exports = { analyze, analyzeText, splitFacility };