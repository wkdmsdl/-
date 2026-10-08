// 팀원 C: OCR 텍스트 → 알레르기 성분 분석
// Node.js에서 바로 실행 가능 (외부 패키지 없음)

const fs = require("fs");

const ALIAS = {
  "마늘": [
    "마늘", "마늘베이스", "다진마늘", "마늘분말", "garlic"
  ],
  "토마토": [
    "토마토", "토마토소스", "토마토페이스트", "토마토농축", "tomato"
  ]
};

function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasIngredient(text, allergy) {
  const normalized = normalize(text);
  return (ALIAS[allergy] || [allergy]).some(keyword =>
    normalized.includes(normalize(keyword))
  );
}

function analyze({ ingredientsText = "", facilityText = "", allergies = [] }) {
  const direct = [];
  const facility = [];

  for (const allergy of allergies) {
    if (hasIngredient(ingredientsText, allergy)) direct.push(allergy);
    if (hasIngredient(facilityText, allergy)) facility.push(allergy);
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

// 예시 실행
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

module.exports = { analyze };
