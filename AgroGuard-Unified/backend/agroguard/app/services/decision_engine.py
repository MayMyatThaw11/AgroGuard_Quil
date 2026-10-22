# ruff: noqa: E501 (the farmer-facing sentences are kept on one line each so they are easy to review)
"""Whether a detected class needs a spray and a fertilizer change, and what to tell the farmer.

The table in app/data/disease_decisions.json covers the 63 disease and pest classes. Healthy,
not-a-plant and fruit-grading classes get a fixed "no action" answer. The text names a kind of
product and a direction for each nutrient (more or less); it never gives a dose or a brand.
"""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "disease_decisions.json"
LANGUAGES = ("en", "my")
FRUIT_GRADE_CLASSES = {
    "Pepper_Fruit",
    "Tomato_Fruit_Ripe",
    "Tomato_Fruit_Unripe",
    "Tomato_Fruit_Reject",
}

NO_ACTION = {
    "healthy": {
        "en": "Routine maintenance; no corrective spray or fertilizer adjustment needed.",
        "my": "ပုံမှန်ထိန်းသိမ်းမှုသာ လုပ်ပါ။ ပြင်ဆင်ရန် ဆေးဖျန်းခြင်း သို့မဟုတ် မြေဩဇာပြောင်းလဲခြင်း မလိုပါ။",
    },
    "not_a_plant": {
        "en": "Invalid input; please retake photo of the plant.",
        "my": "ပုံမမှန်ပါ။ အပင်ဓာတ်ပုံကို ပြန်ရိုက်ပါ။",
    },
    "fruit_grade": {
        "en": "Post-harvest sorting/grading only; field sprays and fertilizers do not apply.",
        "my": (
            "ရိတ်သိမ်းပြီးနောက် အမျိုးအစားခွဲခြင်း/အဆင့်သတ်မှတ်ခြင်းသာ ဖြစ်သည်။ "
            "လယ်ထဲဖျန်းဆေးနှင့် မြေဩဇာ မသက်ဆိုင်ပါ။"
        ),
    },
}

SPRAY = {
    "fungicide": {
        "en": "Spray a registered fungicide if the disease keeps spreading or the weather favours it. Remove infected leaves first.",
        "my": "ရောဂါဆက်ပျံ့နေလျှင် သို့မဟုတ် ရာသီဥတုက အားပေးနေလျှင် မှတ်ပုံတင်ထားသော မှိုသတ်ဆေး ဖျန်းပါ။ ရောဂါကူးစက်သော အရွက်များကို အရင်ဖယ်ရှားပါ။",
    },
    "fungicide_copper": {
        "en": "Spray a registered copper fungicide to protect healthy tissue. Remove infected parts first.",
        "my": "ကျန်းမာသော အစိတ်အပိုင်းများကို ကာကွယ်ရန် မှတ်ပုံတင်ထားသော ကြေးနီပါ မှိုသတ်ဆေး ဖျန်းပါ။ ရောဂါကူးစက်သော အစိတ်အပိုင်းများကို အရင်ဖယ်ရှားပါ။",
    },
    "fungicide_conditional": {
        "en": "Spray a fungicide only after an agronomist confirms a fungus. The cause is hard to tell from a photo.",
        "my": "စိုက်ပျိုးရေးပညာရှင်က မှိုဖြစ်ကြောင်း အတည်ပြုမှသာ မှိုသတ်ဆေး ဖျန်းပါ။ ဓာတ်ပုံမှ အကြောင်းရင်း ခွဲခြားရန် ခက်ခဲသည်။",
    },
    "bactericide_copper": {
        "en": "Spray a registered copper-based product to protect healthy leaves. It slows bacterial disease but does not cure it, so remove infected leaves too.",
        "my": "ကျန်းမာသော အရွက်များကို ကာကွယ်ရန် မှတ်ပုံတင်ထားသော ကြေးနီပါ ဆေး ဖျန်းပါ။ ဘက်တီးရီးယားရောဂါကို နှေးစေသော်လည်း မကုသနိုင်သဖြင့် ရောဂါကူးစက်သော အရွက်များကိုလည်း ဖယ်ရှားပါ။",
    },
    "algaecide_copper": {
        "en": "If algal spot keeps spreading, spray a registered copper product. Improve airflow and drainage first.",
        "my": "ရေညှိအစက် ဆက်ပျံ့နေလျှင် မှတ်ပုံတင်ထားသော ကြေးနီပါ ဆေး ဖျန်းပါ။ လေဝင်လေထွက်နှင့် ရေစီးကို အရင်ပြုပြင်ပါ။",
    },
    "oomyceticide": {
        "en": "Spray early, in wet weather, a registered fungicide made for late blight and downy mildew type diseases.",
        "my": "စိုစွတ်သောရာသီတွင် ဖျတ်ရောဂါနှင့် ဆင်တူသော ရောဂါများအတွက် မှတ်ပုံတင်ထားသော မှိုသတ်ဆေးကို စောစောဖျန်းပါ။",
    },
    "insecticide_vector": {
        "en": "Control the insect that spreads the virus with a registered insecticide. Spraying does not cure infected plants, so pull them out too.",
        "my": "ဗိုင်းရပ်စ်ကူးစက်စေသော ပိုးကောင်ကို မှတ်ပုံတင်ထားသော ပိုးသတ်ဆေးဖြင့် ထိန်းချုပ်ပါ။ ဆေးဖျန်းခြင်းသည် ရောဂါကူးစက်ပြီးသော အပင်များကို မကုသနိုင်သဖြင့် ၎င်းတို့ကိုလည်း နုတ်ပစ်ပါ။",
    },
    "insecticide_vector_conditional": {
        "en": "Spray for the virus-carrying insects (aphids, whiteflies or thrips) only if you can see them. Pull out infected plants.",
        "my": "ဗိုင်းရပ်စ်သယ်ဆောင်သော ပိုးကောင်များ (ပိုးကျ၊ ယင်ဖြူ၊ သရက်စ်) ကို မြင်ရမှသာ ဖျန်းပါ။ ရောဂါကူးစက်သော အပင်များကို နုတ်ပစ်ပါ။",
    },
    "insecticide_pest": {
        "en": "Spray a registered insecticide for this pest, timed to when it is active.",
        "my": "ဤပိုးမွှားအတွက် မှတ်ပုံတင်ထားသော ပိုးသတ်ဆေးကို ပိုးမွှားလှုပ်ရှားသည့်အချိန်တွင် ဖျန်းပါ။",
    },
    "miticide": {
        "en": "Spray a registered miticide if mites keep increasing. Check under the leaves first.",
        "my": "မိုက်များ ဆက်တိုးနေလျှင် မှတ်ပုံတင်ထားသော မိုက်သတ်ဆေး ဖျန်းပါ။ အရွက်အောက်ဘက်ကို အရင်စစ်ဆေးပါ။",
    },
    "none": {
        "en": "No spray is needed.",
        "my": "ဆေးဖျန်းရန် မလိုပါ။",
    },
}

# Classes whose spray advice needs more than the generic sentence for their spray type.
SPRAY_OVERRIDE = {
    "Corn - Cercospora gray leaf spot": {
        "en": "Spray a registered fungicide if the disease keeps spreading, and manage crop residue: plough in or clear old stalks and leaves after harvest.",
        "my": "ရောဂါဆက်ပျံ့နေလျှင် မှတ်ပုံတင်ထားသော မှိုသတ်ဆေး ဖျန်းပါ။ ရိတ်သိမ်းပြီးနောက် ကောက်ရိုးနှင့် အရွက်ဟောင်းများကို မြေထဲမြှုပ်ပါ သို့မဟုတ် ရှင်းလင်းပါ။",
    },
    "Cassava - Brown streak disease": {
        "en": "Control whiteflies, which spread this virus, with a registered insecticide, and plant only clean cuttings.",
        "my": "ဤဗိုင်းရပ်စ်ကို ကူးစက်စေသော ယင်ဖြူများကို မှတ်ပုံတင်ထားသော ပိုးသတ်ဆေးဖြင့် ထိန်းချုပ်ပြီး သန့်ရှင်းသော အကိုင်းများကိုသာ စိုက်ပါ။",
    },
    "Mango (leaf) - Cutting weevil": {
        "en": "Spray a registered insecticide directly on the new flush while the weevils are active.",
        "my": "ပိုးဖောက်ကောင်များ လှုပ်ရှားနေစဉ် အညှောက်သစ်ပေါ်တွင် မှတ်ပုံတင်ထားသော ပိုးသတ်ဆေးကို တိုက်ရိုက်ဖျန်းပါ။",
    },
    "Rice - Leaf smut": {
        "en": "No spray is needed for this late-season problem.",
        "my": "ဤရာသီနောက်ပိုင်းပြဿနာအတွက် ဆေးဖျန်းရန် မလိုပါ။",
    },
    "Cassava - Green mottle": {
        "en": "No spray is needed. Rogue infected plants and use virus-free stem cuttings.",
        "my": "ဆေးဖျန်းရန် မလိုပါ။ ရောဂါကူးစက်သော အပင်များကို နုတ်ပစ်ပြီး ဗိုင်းရပ်စ်ကင်းစင်သော အကိုင်းများကို သုံးပါ။",
    },
}

NO_FERTILIZER = {
    "en": "No fertilizer change is needed.",
    "my": "မြေဩဇာ ပြောင်းလဲရန် မလိုပါ။",
}
FERTILIZER_CAUTION = {
    "en": "Change fertilizer in small steps, follow your soil test or extension officer, and watch the plant.",
    "my": "မြေဩဇာကို အနည်းငယ်စီ ပြောင်းလဲပြီး မြေစစ်ဆေးမှု သို့မဟုတ် တိုးချဲ့ရေးအရာရှိ၏ အကြံအတိုင်း လုပ်ကာ အပင်ကို စောင့်ကြည့်ပါ။",
}
VIRUS_NOTE = {
    "en": "Fertilizer does not cure a virus; it only helps the plant grow healthy new leaves.",
    "my": "မြေဩဇာက ဗိုင်းရပ်စ်ကို မကုသနိုင်ပါ။ ကျန်းမာသော အရွက်သစ်များ ပေါက်စေရန်သာ အထောက်အကူပြုသည်။",
}

NUTRIENTS = {
    "N": {"en": "nitrogen", "my": "နိုက်ထရိုဂျင်"},
    "P": {"en": "phosphorus", "my": "ဖော့စဖရပ်စ်"},
    "K": {"en": "potassium", "my": "ပိုတက်စီယမ်"},
    "Ca": {"en": "calcium", "my": "ကယ်လ်စီယမ်"},
    "Mg": {"en": "magnesium", "my": "မဂ္ဂနီစီယမ်"},
    "Si": {"en": "silicon", "my": "ဆီလီကွန်"},
    "B": {"en": "boron", "my": "ဘိုရွန်"},
    "Zn": {"en": "zinc", "my": "သွပ်"},
    "Cu": {"en": "copper", "my": "ကြေးနီ"},
    "Cl": {"en": "chloride", "my": "ကလိုရိုက်"},
    "NPK": {"en": "nitrogen, phosphorus and potassium", "my": "နိုက်ထရိုဂျင်၊ ဖော့စဖရပ်စ်နှင့် ပိုတက်စီယမ်"},
    "micronutrients": {"en": "micronutrients", "my": "ဓာတ်သတ္တုအနည်းငယ်လိုသော အာဟာရများ"},
}
MODIFIERS = {
    "late": {"en": "late-season ", "my": "ရာသီနောက်ပိုင်း "},
    "ammonium": {"en": "ammonium ", "my": "အမိုနီယမ် "},
}
VERBS = {
    "reduce": {"en": "Use less {x}.", "my": "{x} ကို လျှော့ထည့်ပါ။"},
    "boost": {"en": "Give more {x}.", "my": "{x} ကို ပိုထည့်ပါ။"},
    "balance": {"en": "Keep {x} in balance.", "my": "{x} ကို မျှတအောင် ထိန်းပါ။"},
    "maintain": {"en": "Keep {x} steady, with no big swings.", "my": "{x} ကို အတက်အကျမများစေဘဲ တည်ငြိမ်စွာ ထိန်းပါ။"},
}
CHECK_SHORTAGE = {
    "en": "Check for a nutrient shortage and correct it.",
    "my": "အာဟာရ ချို့တဲ့မှု ရှိမရှိ စစ်ပြီး ပြင်ပါ။",
}
FOLIAR = {"en": " Apply it as a leaf feed (foliar).", "my": " အရွက်ဖြန်းနည်းဖြင့် ပေးပါ။"}


def _join(parts: list[str], lang: str) -> str:
    if len(parts) == 1:
        return parts[0]
    if lang == "my":
        return "၊ ".join(parts[:-1]) + " နှင့် " + parts[-1]
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def fertilizer_text(action: str, lang: str) -> str:
    """Turn an action code such as reduce_N_boost_K_Si into a sentence for the farmer."""
    clauses: list[str] = []
    verb: str | None = None
    items: list[str] = []
    pending = ""
    foliar = False

    def close() -> None:
        if verb is not None and items:
            clauses.append(VERBS[verb][lang].format(x=_join(items, lang)))

    for token in action.split("_"):
        if token == "correct":
            close()
            verb, items, pending = None, [], ""
            clauses.append(CHECK_SHORTAGE[lang])
        elif token in ("reduce", "boost", "balance", "maintain"):
            close()
            verb, items, pending = token, [], ""
        elif token == "foliar":
            foliar = True
        elif token in MODIFIERS:
            pending += MODIFIERS[token][lang]
        elif token in NUTRIENTS:
            items.append(pending + NUTRIENTS[token][lang])
            pending = ""
    close()
    text = " ".join(clauses)
    return text + FOLIAR[lang] if foliar else text


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


@lru_cache(maxsize=1)
def _table() -> dict[str, Any]:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _by_key() -> dict[str, str]:
    """'crop+disease' with punctuation stripped, mapped to the table's own label."""
    table = _table()["decisions"]
    return {_key(label.replace(" - ", "")): label for label in table}


def label_for(class_name: str) -> str | None:
    """The table label for a model class name like Rice___Rice_Blast, or None."""
    table = _table()
    if class_name in table["aliases"]:
        return table["aliases"][class_name]
    crop, _, disease = class_name.partition("___")
    return _by_key().get(_key(crop + disease))


def category_of(class_name: str) -> str | None:
    lowered = class_name.lower()
    if "background" in lowered or "not_a_plant" in lowered:
        return "not_a_plant"
    if class_name in FRUIT_GRADE_CLASSES:
        return "fruit_grade"
    if lowered.endswith("___healthy"):
        return "healthy"
    return "disease" if label_for(class_name) else None


def disease_classes() -> list[str]:
    return sorted(_table()["decisions"])


def decide(class_name: str, language: str = "en") -> dict[str, Any] | None:
    """The decision for one model class, or None when the class is not known."""
    lang = language if language in LANGUAGES else "en"
    category = category_of(class_name)
    if category is None:
        return None
    if category != "disease":
        message = NO_ACTION[category][lang]
        return {
            "class_name": class_name,
            "label": class_name.replace("___", " - ").replace("_", " "),
            "category": category,
            "needs_spray": False,
            "spray_type": "none",
            "spray_recommendation": message,
            "needs_fertilizer": False,
            "fertilizer_action": "none",
            "fertilizer_recommendation": message,
        }
    label = label_for(class_name)
    row = _table()["decisions"][label]
    spray = SPRAY_OVERRIDE.get(label) or SPRAY[row["spray_type"]]
    if row["needs_fertilizer"]:
        fertilizer = fertilizer_text(row["fertilizer_action"], lang)
        if row["spray_type"].startswith("insecticide_vector"):
            fertilizer += " " + VIRUS_NOTE[lang]
        fertilizer += " " + FERTILIZER_CAUTION[lang]
    else:
        fertilizer = NO_FERTILIZER[lang]
    return {
        "class_name": class_name,
        "label": label,
        "category": "disease",
        "needs_spray": row["needs_spray"],
        "spray_type": row["spray_type"],
        "spray_recommendation": spray[lang],
        "needs_fertilizer": row["needs_fertilizer"],
        "fertilizer_action": row["fertilizer_action"],
        "fertilizer_recommendation": fertilizer,
    }
