import re
from dataclasses import dataclass

from .allergens import ALLERGENS
from .schemas import AllergenFinding, Level, Verdict

CROSS_MARKERS = ["제조시설", "제조설비", "같은시설", "같은설비", "같은제조", "혼입", "사용한제품", "사용한식품", "제품과같은"]
DECLARE_AFTER_MARKERS = ["알레르기유발", "알레르기성분", "알레르기표시"]   # 이 문구 뒤에 성분이 나열됨
DECLARE_BEFORE_MARKERS = ["함유"]                                       # 이 문구 앞에 성분이 나열됨
READABLE_KEYWORDS = ["원재료", "알레르기", "함유"]

CROSS_BEFORE, CROSS_AFTER = 100, 30
DECL_SPAN = 80

# 혼입 문구가 깨져 읽혀도, 알레르기 성분이 이만큼 몰려 있으면 '혼입 가능 목록'으로 판단
CLUSTER_SPAN = 150
CLUSTER_MIN = 6

# OCR 인식 신뢰도가 이 값보다 낮으면 '발견 안 됨' 대신 '확인 필요'로 판정
# 처음 값이라 여러 사진의 ocr_confidence를 보고 조정하세요
LOW_CONFIDENCE = 0.60

# OCR이 자주 틀리는 글자 (사진을 돌려 보며 계속 추가)
OCR_FIXES = {
    "메민": "메밀",
    "돼시고기": "돼지고기",
}

_PRIORITY = {Level.CONTAINS: 3, Level.INGREDIENT: 2, Level.CROSS_CONTACT: 1}


@dataclass
class Analysis:
    verdict: Verdict
    message: str
    findings: list[AllergenFinding]


def _spaced(word: str) -> str:
    """3글자 이상 단어는 OCR이 끼워 넣은 공백을 허용. 2글자 이하는 오탐 방지를 위해 그대로."""
    if len(word) >= 3:
        return r"\s*".join(re.escape(c) for c in word)
    return re.escape(word)


def _canonical(name: str) -> str:
    n = re.sub(r"\s+", "", name)
    if n in ALLERGENS:
        return n
    for canon, (words, window_only) in ALLERGENS.items():
        if n in words or n in window_only:
            return canon
    return n  # 사전에 없는 사용자 지정 알레르기


def _build_patterns(user_set: set[str]):
    pats = []
    for name, (words, window_only) in ALLERGENS.items():
        if words:
            pats.append((name, re.compile("|".join(_spaced(w) for w in words)), False))
        for token in window_only:
            pats.append((name, re.compile(rf"(?<![가-힣]){re.escape(token)}(?![가-힣])"), True))
    for u in user_set:                      # 사전에 없는 알레르기도 직접 검색
        if u not in ALLERGENS:
            pats.append((u, re.compile(_spaced(u)), False))
    return pats


def _windows(text: str, markers: list[str], before: int, after: int):
    wins = []
    for marker in markers:
        for m in re.finditer(r"\s*".join(re.escape(c) for c in marker), text):
            wins.append((max(0, m.start() - before), min(len(text), m.end() + after), m.start()))
    return wins


def _inside(pos: int, wins) -> bool:
    return any(s <= pos < e for s, e, *_ in wins)


def _classify(pos: int, cross_wins, decl_wins) -> Level:
    if _inside(pos, cross_wins):
        return Level.CROSS_CONTACT
    if _inside(pos, decl_wins):
        return Level.CONTAINS
    return Level.INGREDIENT


def analyze_label(
    lines: list[str],
    user_allergies: list[str],
    ocr_confidence: float | None = None,
) -> Analysis:
    text = re.sub(r"\s+", " ", " ".join(lines)).strip()
    for wrong, right in OCR_FIXES.items():
        text = text.replace(wrong, right)
    compact = text.replace(" ", "")
    readable = any(k in compact for k in READABLE_KEYWORDS)
    user_set = {_canonical(a) for a in user_allergies if a.strip()}

    cross_wins = _windows(text, CROSS_MARKERS, CROSS_BEFORE, CROSS_AFTER)
    decl_wins = [
        w for w in (
            _windows(text, DECLARE_AFTER_MARKERS, 0, DECL_SPAN)
            + _windows(text, DECLARE_BEFORE_MARKERS, DECL_SPAN, 0)
        )
        if not _inside(w[2], cross_wins)   # 혼입 문구 속의 '함유'는 제외
    ]

    # 1) 성분 단어가 나온 모든 위치를 모으고, 위치로 분류
    hits = []  # [성분, 시작, 끝, 분류]
    for name, pat, window_only in _build_patterns(user_set):
        for m in pat.finditer(text):
            level = _classify(m.start(), cross_wins, decl_wins)
            if window_only and level == Level.INGREDIENT:
                continue
            hits.append([name, m.start(), m.end(), level])

    # 2) 혼입 문구를 못 읽었어도, 성분이 한 곳에 6종 이상 몰려 있으면 '혼입 가능 목록'으로 판단
    dict_hits = sorted(
        (h for h in hits if h[0] in ALLERGENS and h[3] == Level.INGREDIENT),
        key=lambda h: h[1],
    )
    for h in dict_hits:
        group = [g for g in dict_hits if h[1] <= g[1] < h[1] + CLUSTER_SPAN]
        if len({g[0] for g in group}) >= CLUSTER_MIN:
            for g in group:
                g[3] = Level.CROSS_CONTACT

    # 3) 성분별로 가장 강한 근거 하나만 남김
    best: dict[str, tuple[Level, str]] = {}
    for name, start, end, level in hits:
        cur = best.get(name)
        if cur is None or _PRIORITY[level] > _PRIORITY[cur[0]]:
            best[name] = (level, text[max(0, start - 10): end + 10])

    findings = [
        AllergenFinding(allergen=n, level=lv, evidence=ev, is_user_allergen=n in user_set)
        for n, (lv, ev) in best.items()
    ]
    findings.sort(key=lambda f: (not f.is_user_allergen, -_PRIORITY[f.level]))

    danger = [f.allergen for f in findings
              if f.is_user_allergen and f.level in (Level.CONTAINS, Level.INGREDIENT)]
    caution = [f.allergen for f in findings
               if f.is_user_allergen and f.level == Level.CROSS_CONTACT]

    if danger:
        msg = f"주의! {', '.join(danger)} 성분이 들어 있어요."
        if caution:
            msg += f" {', '.join(caution)}은(는) 같은 제조시설 등에서 섞일 수 있어요."
        return Analysis(Verdict.DANGER, msg, findings)
    if caution:
        return Analysis(Verdict.CAUTION,
                        f"{', '.join(caution)} 성분이 같은 제조시설 등에서 섞일 수 있다고 표시되어 있어요. "
                        "포장지를 직접 확인해 주세요.",
                        findings)
    if not readable:
        return Analysis(Verdict.UNREADABLE,
                        "원재료 표시를 인식하지 못했어요. 글씨가 잘 보이게 가까이에서 다시 촬영해 주세요.",
                        findings)
    if not user_set:
        return Analysis(Verdict.INFO,
                        "알레르기 설정이 없어 발견된 알레르기 유발물질만 보여드려요.", findings)
    if ocr_confidence is not None and ocr_confidence < LOW_CONFIDENCE:
        return Analysis(Verdict.NEEDS_REVIEW,
                        "설정하신 알레르기 성분은 발견되지 않았지만, 글자 인식 상태가 좋지 않아 "
                        "놓친 부분이 있을 수 있어요. 더 선명하게 다시 촬영하거나 포장지를 직접 확인해 주세요.",
                        findings)
    return Analysis(Verdict.NOT_DETECTED,
                    "인식된 범위에서는 설정하신 알레르기 성분이 발견되지 않았어요. "
                    "인식이 완벽하지 않을 수 있으니 포장지의 표시를 직접 한 번 더 확인해 주세요.",
                    findings)