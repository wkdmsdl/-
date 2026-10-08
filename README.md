# 캡스톤 팀원 C 작업본 - OCR & 성분 분석

## 현재 구현한 것
1. 사용자의 알레르기 설정: `마늘`, `토마토`
2. 만두/샌드위치/신라면의 라벨 정보를 테스트 데이터로 저장
3. OCR 결과에서 알레르기 성분을 찾는 분석 함수 구현
4. 원재료에 직접 포함되면 `danger`
5. 같은 제조시설/혼입 가능 문구에서 발견되면 `caution`
6. 아무것도 없으면 `none`으로 처리하되 '안전'이라고 단정하지 않음

## 실행
```bash
node allergy_analyzer.js
```

## 예상 결과
- 비비고 왕교자: 마늘 직접 포함 → danger / 토마토 시설 혼입 가능 → facilityMatches
- 호밀BLT샌드: 토마토 직접 포함 → danger
- 신라면: 마늘베이스 직접 포함 → danger / 토마토 동일 시설 → facilityMatches

## 다음 단계
React Native에서 사진을 보내면 OCR 결과를 `ingredientsText`, `facilityText`로 나눠 이 분석기에 전달하면 됩니다.
