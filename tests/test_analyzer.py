from app.analyzer import analyze_label
from app.schemas import Verdict


def test_declared_allergen_is_danger():
    lines = ["원재료명: 밀가루, 설탕, 정제소금", "알레르기 유발물질: 우유, 대두, 밀 함유"]
    assert analyze_label(lines, ["우유"]).verdict == Verdict.DANGER


def test_cross_contact_is_caution():
    lines = ["원재료명: 정제수, 설탕", "이 제품은 땅콩을 사용한 제품과 같은 제조시설에서 제조하였습니다"]
    assert analyze_label(lines, ["땅콩"]).verdict == Verdict.CAUTION


def test_buckwheat_is_not_wheat():
    lines = ["알레르기 유발물질: 메밀 함유"]
    assert analyze_label(lines, ["밀"]).verdict == Verdict.NOT_DETECTED


def test_garbled_text_is_unreadable():
    lines = ["MAME 미국산 85M BF"]
    assert analyze_label(lines, ["우유"]).verdict == Verdict.UNREADABLE


def test_garbled_cross_contact_list_is_caution():
    lines = ["원재료명: 돼지고기, 양파, 마늘",
             "ㆍ알류,우유,메밀,땅콩,고등어,게,새우,복숭아,토마토,아황산류,호두 가능"]
    assert analyze_label(lines, ["토마토"]).verdict == Verdict.CAUTION


def test_custom_allergen_in_ingredients_is_danger():
    lines = ["원재료명: 돼지고기, 양파, 마늘"]
    assert analyze_label(lines, ["마늘"]).verdict == Verdict.DANGER

    def test_low_confidence_needs_review():
    lines = ["알레르기 유발물질: 메밀 함유"]
    assert analyze_label(lines, ["밀"], 0.40).verdict == Verdict.NEEDS_REVIEW


def test_high_confidence_not_detected():
    lines = ["알레르기 유발물질: 메밀 함유"]
    assert analyze_label(lines, ["밀"], 0.90).verdict == Verdict.NOT_DETECTED


def test_danger_overrides_low_confidence():
    lines = ["알레르기 유발물질: 우유, 대두 함유"]
    assert analyze_label(lines, ["우유"], 0.30).verdict == Verdict.DANGER