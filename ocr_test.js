// 팀원 C: 성분표 사진 → OCR → 알레르기 분석
//
// 터미널에서 실행:
//   node ocr_test.js              (food.png 분석)
//   node ocr_test.js 라면.png      (다른 사진 분석)
//
// 다른 파일(앱/서버)에서 사용:
//   const { analyzeImage } = require("./ocr_test");
//   const result = await analyzeImage("사진경로", ["마늘", "토마토"]);

const { createWorker } = require("tesseract.js");
const { analyzeText } = require("./allergy_analyzer");

// 사용자 알레르기 목록을 따로 안 넘기면 이 값을 쓴다.
const DEFAULT_ALLERGIES = ["마늘", "토마토"];

// ========================================
// 사진 한 장 분석
// image: 사진 파일 경로 (또는 이미지 Buffer)
// allergies: 사용자 알레르기 목록
// 반환: { ocrText, status, statusText, directMatches, facilityMatches }
// ========================================

async function analyzeImage(image, allergies = DEFAULT_ALLERGIES) {
  const worker = await createWorker("kor+eng");

  try {
    const { data } = await worker.recognize(image);
    const result = analyzeText(data.text, allergies);

    return { ocrText: data.text, ...result };
  } finally {
    await worker.terminate();
  }
}

// ========================================
// 결과 출력
// ========================================

function printResult(result, allergies) {
  console.log("\n================================");
  console.log("           OCR 결과");
  console.log("================================\n");
  console.log(result.ocrText);

  console.log("\n================================");
  console.log("      최종 알레르기 분석 결과");
  console.log("================================");

  for (const allergy of allergies) {
    console.log(`\n[${allergy}]`);

    if (result.directMatches.includes(allergy)) {
      console.log(`🔴 위험: 원재료에 ${allergy} 성분이 들어 있습니다.`);
    } else if (result.facilityMatches.includes(allergy)) {
      console.log(`🟡 주의: ${allergy} 사용 제품과 같은 제조시설에서 제조됩니다.`);
    } else {
      console.log(`✅ OCR 결과에서 ${allergy} 성분이 확인되지 않았습니다.`);
    }
  }

  console.log(`\n종합 판정: ${result.status}`);
  console.log(result.statusText);
}

// ========================================
// 프로그램 실행
// ========================================

if (require.main === module) {
  const imagePath = process.argv[2] || "./food.png";

  console.log(`OCR 시작... (${imagePath})`);

  analyzeImage(imagePath, DEFAULT_ALLERGIES)
    .then(result => {
      printResult(result, DEFAULT_ALLERGIES);

      console.log("\n================================");
      console.log("OCR + 알레르기 분석 완료");
      console.log("================================");
    })
    .catch(error => {
      console.error("분석 중 오류가 발생했습니다:", error.message);
      process.exit(1);
    });
}

module.exports = { analyzeImage };