import sys

from app.analyzer import analyze_label
from app.ocr import decode_image, extract

path = sys.argv[1] if len(sys.argv) > 1 else "samples/menu1.png"
allergies = sys.argv[2].split(",") if len(sys.argv) > 2 else ["우유", "땅콩"]

with open(path, "rb") as f:
    img = decode_image(f.read())

ocr = extract(img)
print("===== [1] OCR 원문 =====")
print("\n".join(ocr.lines))
print(f"\nOCR 신뢰도: {ocr.confidence}")

with open("result.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(ocr.lines))

result = analyze_label(ocr.lines, allergies, ocr.confidence)
print("\n===== [2] 판정 =====")
print(result.verdict.value, "|", result.message)

print("\n===== [3] 발견된 알레르기 유발물질 =====")
for fd in result.findings:
    mark = "★내 알레르기" if fd.is_user_allergen else "     "
    print(f"{mark} {fd.allergen} | {fd.level.value} | ...{fd.evidence}...")