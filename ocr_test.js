const { createWorker } = require("tesseract.js");

// ========================================
// 알레르기 성분 설정
// ========================================

const ALLERGIES = {
    마늘: [
        "마늘",
        "마늘베이스",
        "다진마늘",
        "마늘분말",
        "garlic"
    ],

    토마토: [
        "토마토",
        "토마토소스",
        "토마토페이스트",
        "토마토농축",
        "tomato"
    ]
};


// ========================================
// 텍스트 정리
// ========================================

function normalize(text = "") {
    return text
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/,/g, "")
        .replace(/\./g, "")
        .trim();
}


// ========================================
// 제조시설/혼입 관련 문구 찾기
// ========================================

function findFacilityStart(text) {

    const keywords = [
        "같은제조시설",
        "제조시설에서제조",
        "같은시설에서제조",
        "혼입가능",
        "사용한제품과같은",
        "사용한제품과같은제조시설"
    ];

    for (const keyword of keywords) {
        const index = text.indexOf(keyword);

        if (index !== -1) {
            return index;
        }
    }

    return -1;
}


// ========================================
// 알레르기 분석
// ========================================

function analyzeAllergy(text) {

    const normalizedText = normalize(text);

    // 원재료 / 제조시설 문구 분리
    const facilityStart = findFacilityStart(normalizedText);

    let ingredientText = normalizedText;
    let facilityText = "";

    if (facilityStart !== -1) {

        ingredientText = normalizedText.substring(0, facilityStart);

        facilityText = normalizedText.substring(facilityStart);

    }


    const result = {};


    // ====================================
    // 각각의 알레르기 검사
    // ====================================

    for (const allergy of Object.keys(ALLERGIES)) {

        const keywords = ALLERGIES[allergy];

        let direct = false;
        let facility = false;


        // 원재료에 포함되어 있는지 검사
        for (const keyword of keywords) {

            if (
                ingredientText.includes(
                    normalize(keyword)
                )
            ) {

                direct = true;
                break;

            }

        }


        // 제조시설 관련 문구에서 발견되는지 검사
        for (const keyword of keywords) {

            if (
                facilityText.includes(
                    normalize(keyword)
                )
            ) {

                facility = true;
                break;

            }

        }


        result[allergy] = {
            direct: direct,
            facility: facility
        };

    }


    return result;
}


// ========================================
// 결과 출력
// ========================================

function printResult(results) {

    console.log("\n================================");
    console.log("      최종 알레르기 분석 결과");
    console.log("================================");


    // 마늘
    console.log("\n[마늘]");

    if (results["마늘"].direct) {

        console.log(
            "🔴 알레르기 성분 포함: 마늘이 원재료에 들어 있습니다."
        );

    } else if (results["마늘"].facility) {

        console.log(
            "🟡 주의: 마늘을 사용하는 제품과 같은 제조시설에서 제조됩니다."
        );

    } else {

        console.log(
            "✅ OCR 결과에서 마늘 성분이 확인되지 않았습니다."
        );

    }


    // 토마토
    console.log("\n[토마토]");

    if (results["토마토"].direct) {

        console.log(
            "🔴 알레르기 성분 포함: 토마토가 원재료에 들어 있습니다."
        );

    } else if (results["토마토"].facility) {

        console.log(
            "🟡 주의: 토마토를 사용하는 제품과 같은 제조시설에서 제조됩니다."
        );

    } else {

        console.log(
            "✅ OCR 결과에서 토마토 성분이 확인되지 않았습니다."
        );

    }

}


// ========================================
// OCR 실행
// ========================================

async function runOCR() {

    console.log("OCR 시작...");

    const worker = await createWorker("kor+eng");


    // food.png 사진 OCR
    const { data } = await worker.recognize("./food.png");

    const ocrText = data.text;


    // OCR 결과 출력
    console.log("\n================================");
    console.log("           OCR 결과");
    console.log("================================\n");

    console.log(ocrText);


    // 알레르기 분석
    const results = analyzeAllergy(ocrText);


    // 분석 결과 출력
    printResult(results);


    await worker.terminate();

    console.log("\n================================");
    console.log("OCR + 알레르기 분석 완료");
    console.log("================================");

}


// 프로그램 실행
runOCR();