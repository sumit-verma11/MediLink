from app.red_flags import check_red_flag


def test_detects_chest_pain():
    assert check_red_flag("I have crushing chest pain") is not None


def test_detects_breathlessness():
    assert check_red_flag("severe breathlessness since this morning") is not None


def test_detects_suicidal_ideation():
    assert check_red_flag("I have been having suicidal thoughts") is not None


def test_detects_severe_bleeding():
    assert check_red_flag("severe bleeding from a wound that won't stop") is not None


def test_detects_sudden_vision_loss():
    assert check_red_flag("sudden vision loss in my left eye") is not None


def test_does_not_flag_ordinary_symptoms():
    assert check_red_flag("itchy red patches on my elbow for 2 weeks") is None


def test_is_case_insensitive():
    assert check_red_flag("CHEST PAIN and sweating") is not None


def test_detects_hindi_chest_pain_devanagari():
    assert check_red_flag("सीने में तेज दर्द हो रहा है", language="hi") is not None


def test_detects_hindi_chest_pain_transliterated():
    assert check_red_flag("mujhe seene mein dard ho raha hai", language="hi") is not None


def test_detects_hindi_breathlessness():
    assert check_red_flag("saans lene mein bahut takleef ho rahi hai", language="hi") is not None


def test_detects_hindi_suicidal_ideation():
    assert check_red_flag("mujhe khudkushi karne ka man kar raha hai", language="hi") is not None


def test_detects_hindi_severe_bleeding():
    assert check_red_flag("bahut khoon beh raha hai aur ruk nahi raha", language="hi") is not None


def test_does_not_flag_ordinary_hindi_symptoms():
    assert check_red_flag("mere kohni par laal khujli wale daane hain", language="hi") is None


def test_hindi_keywords_do_not_leak_into_english_check():
    # An English-language call must not match against the Hindi list.
    assert check_red_flag("seene mein dard", language="en") is None
