import re
from typing import List, Dict, Any

LANGUAGE_ALIASES: Dict[str, str] = {
    "en": "en",
    "en-us": "en",
    "en-gb": "en",
    "my": "my",
    "mm": "my",
    "my-mm": "my",
    "bur": "my",
}

# 1. Exact Glossary for Crops, Statuses, Severity, and Common Diseases
MYANMAR_AGRI_GLOSSARY: Dict[str, str] = {
    # Status & Severity
    "Healthy": "ကျန်းမာသောအပင်",
    "Invalid Image": "မှားယွင်းသောပုံ (အပင်မဟုတ်ပါ)",
    "Non-Plant / Background Detected": "အပင်မဟုတ်ပါ / နောက်ခံပုံဖြစ်နေသည်",
    "None (Invalid Plant Image)": "မရှိပါ (မှားယွင်းသော အပင်ပုံ)",
    "No Disease Detected": "ရောဂါလက္ခဏာ မတွေ့ရှိပါ",
    "None (Healthy Plant)": "ရောဂါမရှိပါ (ကျန်းမာသည်)",
    "Diseased (Action Needed)": "ရောဂါကျရောက်နေသည် (ကုသရန်လိုအပ်သည်)",
    "Moderate Infection": "အသင့်အတင့် ရောဂါကျရောက်မှု",
    "Early Symptoms Detected": "ကနဦး ရောဂါလက္ခဏာ တွေ့ရှိရသည်",
    "Severe Infection": "ပြင်းထန်သော ရောဂါကျရောက်မှု",
    "None": "မရှိပါ",
    "None (0%)": "မရှိပါ (0%)",
    "0%": "0% (မရှိပါ)",
    "< 2%": "၂% အောက်",
    "5% – 15%": "၅% – ၁၅%",
    "15% – 25%": "၁၅% – ၂၅%",
    "25% – 45%": "၂၅% – ၄၅%",
    "Not Applicable": "သက်ဆိုင်မှုမရှိပါ",
    "N/A": "သက်ဆိုင်မှုမရှိပါ",
    "Unknown": "မသိရှိရပါ",
    "Low": "အနည်းငယ်",
    "Mild": "အနည်းငယ်",
    "Mild / Early Stage": "အနည်းငယ် (ကနဦးအဆင့်)",
    "Moderate": "အသင့်အတင့်",
    "Moderate to High": "အသင့်အတင့်မှ ပြင်းထန်",
    "High": "ပြင်းထန်",
    "Severe": "အလွန်ပြင်းထန်",

    # Crops
    "Rice": "စပါး",
    "Corn": "ပြောင်းဖူး",
    "Corn (Maize)": "ပြောင်းဖူး",
    "Maize": "ပြောင်းဖူး",
    "Soybean": "ပဲပုပ်",
    "Peanut": "မြေပဲ",
    "Peanut (Groundnut)": "မြေပဲ",
    "Groundnut": "မြေပဲ",
    "Sesame": "နှမ်း",
    "Coconut": "အုန်းပင်",
    "Oil Palm": "ဆီအုန်း",
    "Rubber": "ရာဘာ",
    "Cashew": "သီဟိုဠ်သရက်",
    "Black Pepper": "ငရုတ်ကောင်း",
    "Cassava": "ပီလောပီနံ",
    "Coffee": "ကော်ဖီ",
    "Sugarcane": "ကြံ",
    "Tea": "လက်ဖက်",
    "Cacao": "ကိုကိုး",
    "Banana": "ငှက်ပျော",
    "Durian": "ဒူးရင်း",
    "Mango": "သရက်",
    "Mango Leaf": "သရက်ရွက်",
    "Mango Fruit": "သရက်သီး",
    "Papaya": "သင်္ဘောပင်",
    "Dragon Fruit": "နဂါးမောက်",
    "Tomato": "ခရမ်းချဉ်",
    "Tomato Leaf": "ခရမ်းချဉ်ရွက်",
    "Tomato Fruit": "ခရမ်းချဉ်သီး",
    "Pepper / Chili": "ငရုတ်",
    "Pepper": "ငရုတ်",
    "Chili": "ငရုတ်",
    "Pepper Leaf": "ငရုတ်ရွက်",
    "Pepper Fruit": "ငရုတ်သီး",
    "Chili Leaf": "ငရုတ်ရွက်",
    "Chili Fruit": "ငရုတ်သီး",
    "Bell Pepper": "ငရုတ်ပွ",
    "Eggplant": "ခရမ်းပင်",
    "Pineapple": "နာနတ်ပင်",
    "Watermelon": "ဖရဲပင်",

    # Common Detected Disease Names
    "Anthracnose": "မှဲ့ပြောက်စွန်းရောဂါ (Anthracnose)",
    "Algal Leaf Spot": "ရေညှိရွက်ပြောက်ရောဂါ (Algal Leaf Spot)",
    "Leaf Spot": "ရွက်ပြောက်ရောဂါ (Leaf Spot)",
    "Brown Spot": "ရွက်ညိုပြောက်ရောဂါ (Brown Spot)",
    "Cercospora Leaf Spot": "ဆာကိုစပိုးရား ရွက်ပြောက်ရောဂါ",
    "Target Spot": "ပစ်မှတ်ပုံ ရွက်ပြောက်ရောဂါ (Target Spot)",
    "Black Rot": "အမည်းပုပ်ရောဂါ (Black Rot)",
    "Bud Rot": "ဖူးပုပ်ရောဂါ (Bud Rot)",
    "Stem Bleeding": "ပင်စည်အစေးယိုရောဂါ (Stem Bleeding)",
    "Root Rot": "အမြစ်ပုပ်ရောဂါ (Root Rot)",
    "Fruit Rot": "အသီးပုပ်ရောဂါ (Fruit Rot)",
    "Blight": "လောင်မည်းရောဂါ (Blight)",
    "Early Blight": "ကနဦး လောင်မည်းရောဂါ (Early Blight)",
    "Late Blight": "နောက်ကျ လောင်မည်းရောဂါ (Late Blight)",
    "Leaf Blight": "ရွက်ခြောက်ရောဂါ (Leaf Blight)",
    "Bacterial Blight": "ဘက်တီးရီးယား ရွက်ခြောက်ရောဂါ",
    "Bacterial Spot": "ဘက်တီးရီးယား ရွက်ပြောက်ရောဂါ",
    "Leaf Scald": "ရွက်ဖျားလောင်ရောဂါ (Leaf Scald)",
    "Citrus Canker": "ရှောက်သံပရာ အနာချိုင့်ရောဂါ (Canker)",
    "Canker": "ပင်စည်အနာချိုင့်ရောဂါ (Canker)",
    "Rust": "သံချေးရောဂါ (Rust)",
    "Common Rust": "သံချေးရောဂါ (Common Rust)",
    "Leaf Rust": "အရွက်သံချေးရောဂါ (Leaf Rust)",
    "Powdery Mildew": "ဖားဥမှိုရောဂါ (Powdery Mildew)",
    "Downy Mildew": "ဒေါင်းနီးမှိုရောဂါ (Downy Mildew)",
    "Mosaic Virus": "မိုဇေ့ဗိုင်းရပ်စ်ရောဂါ (Mosaic Virus)",
    "Yellow Leaf Curl Virus": "ရွက်ဝါတွန့်ဗိုင်းရပ်စ်ရောဂါ",
    "Leaf Curl": "ရွက်တွန့်ရောဂါ (Leaf Curl)",
    "Tungro": "တန်ဂရိုဗိုင်းရပ်စ်ရောဂါ (Tungro)",
    "Bunchy Top": "ငှက်ပျောဖျားစုရောဂါ (Bunchy Top)",
    "Fusarium Wilt": "ဖျူဆေရီယမ် ပင်ညှိုးရောဂါ (Fusarium Wilt)",
    "Wilt": "ပင်ညှိုးရောဂါ (Wilt)",
    "Dieback": "ကိုင်းဖျားခြောက်ရောဂါ (Dieback)",
    "Sooty Mold": "ကျပ်ခိုးမှိုရောဂါ (Sooty Mold)",
    "Sigatoka": "စီဂါတိုကာ ရွက်ပြောက်ရောဂါ (Sigatoka)",
    "Black Sigatoka": "အမည်းရောင် စီဂါတိုကာ ရွက်ပြောက်ရောဂါ",
    "Yellow Sigatoka": "အဝါရောင် စီဂါတိုကာ ရွက်ပြောက်ရောဂါ",
    "Panama Disease": "ပနားမား ပင်ညှိုးရောဂါ",
    "Red Rust": "သံချေးနီရောဂါ (Red Rust)",
    "Blister Blight": "အရည်ကြည်ဖု လောင်မည်းရောဂါ",
    "Pink Disease": "ပန်းရောင်မှိုရောဂါ (Pink Disease)",
    "Ganoderma": "ဂါနိုဒါးမား အမြစ်ပုပ်ရောဂါ",
    "Spider Mites": "ပင့်ကူနီပိုး (Spider Mites)",
    "Mites": "မွှားပင့်ကူပိုး (Mites)",
    "Aphids": "ပျပိုး (Aphids)",
    "Mealybug": "ဂျပိုးဖြူ (Mealybug)",
    "Whitefly": "ယင်ဖြူ (Whitefly)",
    "Thrips": "လှေးပိုး (Thrips)",
    "Leaf Miner": "ရွက်ထွင်းပိုး (Leaf Miner)",
    "Stem Borer": "ပင်စည်ထိုးပိုး (Stem Borer)",
    "Caterpillar": "ခူကောင် / ပိုးတုံးလုံး",
}

# 2. Direct Sentence Dictionary for all static sentences in disease_data.py
DISEASE_SENTENCE_DICTIONARY: Dict[str, str] = {
    # --- 1. Non-Plant / Rejected Background Image ---
    "No clear plant leaf, stem, or fruit surface was detected in the frame.":
        "ပုံထဲတွင် ရှင်းလင်းသော အပင်၏ အရွက်၊ ပင်စည် သို့မဟုတ် အသီးမျက်နှာပြင်ကို မတွေ့ရှိရပါ။",
    "The image may contain background objects, soil, tools, or extreme blur.":
        "ပုံသည် နောက်ခံပစ္စည်းများ၊ မြေကြီး၊ ကိရိယာများ ဖြစ်နေနိုင်သည် သို့မဟုတ် အလွန်ဝါးနေနိုင်ပါသည်။",
    "Camera out of focus or pointed away from the plant organ.":
        "ကင်မရာ ফိုးကပ်စ် မပြတ်သားခြင်း သို့မဟုတ် အပင်အစိတ်အပိုင်းနှင့် လွဲနေခြင်း။",
    "Non-plant photo uploaded.":
        "အပင်မဟုတ်သော ဓာတ်ပုံ တင်ထားခြင်း။",
    "Retake the photo holding the camera 15–30 cm away from a single leaf or fruit.":
        "အရွက် သို့မဟုတ် အသီးတစ်ခုတည်းမှ ကင်မရာကို ၁၅-၃၀ စင်တီမီတာအကွာတွင်ထား၍ ပုံပြန်ရိုက်ပါ။",
    "Ensure the damaged plant part fills at least 60% of the frame.":
        "ရောဂါဖြစ်နေသော အပင်အစိတ်အပိုင်းသည် ပုံဘောင်၏ အနည်းဆုံး ၆၀% အပြည့်ရှိပါစေ။",
    "Use natural daylight and avoid strong shadows or motion blur.":
        "သဘာဝနေ့အလင်းရောင်ကို သုံးပြီး အရိပ်မည်းများ သို့မဟုတ် လက်လှုပ်၍ ပုံဝါးခြင်းကို ရှောင်ကြဉ်ပါ။",

    # --- 2. Healthy Plant Prediction ---
    "Normal green chlorophyll pigmentation and intact leaf/fruit cuticles.":
        "ပုံမှန်အစိမ်းရောင် ကလိုရိုဖီးလ်အရောင်ရှိပြီး အရွက်/အသီး မျက်နှာပြင်များ ကောင်းမွန်နေပါသည်။",
    "No necrotic lesions, fungal spore pustules, or viral mosaic distortion observed.":
        "ဆဲလ်သေအနာကွက်များ၊ မှိုစပိုးအဖုများ သို့မဟုတ် ဗိုင်းရပ်စ်ကြောင့် အရွက်ပုံပျက်ခြင်းများ မတွေ့ရှိရပါ။",
    "Optimal crop nutrition, irrigation, and phytosanitary management.":
        "သင့်တင့်မျှတသော အာဟာရကျွေးမွေးမှု၊ ရေပေးဝေမှုနှင့် စိုက်ခင်းသန့်ရှင်းရေး စနစ်တကျရှိခြင်း။",
    "No chemical fungicide or bactericide treatment is required.":
        "ဓာတုမှိုသတ်ဆေး သို့မဟုတ် ဘက်တီးရီးယားသတ်ဆေး ပက်ဖျန်းရန် မလိုအပ်ပါ။",
    "Continue standard irrigation and balanced NPK + micronutrient fertilization.":
        "ပုံမှန်ရေပေးဝေမှုနှင့် အချိုးညီ NPK + အနည်းလိုအာဟာရ မြေဩဇာကျွေးခြင်းကို ဆက်လက်လုပ်ဆောင်ပါ။",
    "Perform weekly field scouting to catch early seasonal pests or monsoon diseases.":
        "ရာသီအလိုက် ပိုးမွှားများ သို့မဟုတ် မိုးရာသီရောဂါများကို စောစီးစွာသိရှိနိုင်ရန် အပတ်စဉ် ကွင်းဆင်းစစ်ဆေးပါ။",
    "Maintain weed-free field borders and good soil drainage.":
        "စိုက်ခင်းဘေးပတ်လည်တွင် ပေါင်းမြက်ကင်းစင်အောင်ထားပြီး ရေနုတ်မြောင်းကောင်းမွန်အောင် ပြုလုပ်ပါ။",

    # --- 3. PATHOGEN_KNOWLEDGE_BASE: Anthracnose ---
    "Dark brown to black sunken lesions on leaves, stems, or ripening fruit.":
        "အရွက်၊ ပင်စည် သို့မဟုတ် မှည့်စပြုနေသော အသီးများပေါ်တွင် အညိုရင့်ရောင်မှ အမည်းရောင် ချိုင့်ဝင်နေသော အနာကွက်များ ဖြစ်ပေါ်ခြင်း။",
    "Concentric rings or salmon-pink spore masses in humid conditions.":
        "စိုထိုင်းဆများသော အခြေအနေတွင် စက်ဝိုင်းပုံအကွင်းများ သို့မဟုတ် ပန်းရောင်မှိုစပိုးစုများ တွေ့ရခြင်း။",
    "Premature leaf drop and progressive twig dieback.":
        "အရွက်များ အချိန်မတိုင်မီ ကြွေကျခြင်းနှင့် ကိုင်းဖျားများ တဖြည်းဖြည်း ခြောက်သွေ့သေဆုံးခြင်း။",
    "Fungal infection by Colletotrichum species.":
        "Colletotrichum မှိုမျိုးစိတ်ကြောင့် ရောဂါကူးစက်ခံရခြင်း။",
    "High relative humidity (>80%) and warm monsoon rain splash.":
        "လေထုစိုထိုင်းဆ မြင့်မားခြင်း (၈၀% အထက်) နှင့် ပူနွေးသော မိုးရေစက်များမှတစ်ဆင့် ကူးစက်ခြင်း။",
    "Dense canopy with poor air circulation.":
        "အပင်အုပ်ဆိုင်းမှု ထူထပ်ပြီး လေဝင်လေထွက် အားနည်းခြင်း။",
    "Prune and destroy heavily infected leaves, twigs, and mummified fruits.":
        "ရောဂါပြင်းထန်စွာ ကျရောက်နေသော အရွက်များ၊ ကိုင်းများနှင့် ခြောက်ကပ်နေသော အသီးများကို ဖြတ်တောက်ဖျက်ဆီးပါ။",
    "Apply copper-based fungicides (Copper oxychloride) or Mancozeb/Azoxystrobin as directed.":
        "ကြေးနီဓာတ်ပါသော မှိုသတ်ဆေး (Copper oxychloride) သို့မဟုတ် Mancozeb / Azoxystrobin ဆေးကို ညွှန်ကြားချက်အတိုင်း ပက်ဖျန်းပါ။",
    "Sanitize pruning shears with 70% alcohol between cuts.":
        "ကိုင်းဖြတ်ကတ်ကြေးကို တစ်ပင်နှင့်တစ်ပင် ပြောင်းလဲမဖြတ်မီ အရက်ပြန် ၇၀% ဖြင့် ပိုးသန့်စင်ပါ။",
    "Maintain proper tree/plant spacing to improve sunlight and airflow.":
        "နေရောင်ခြည်နှင့် လေဝင်လေထွက် ကောင်းမွန်စေရန် အပင်အကွာအဝေးကို စနစ်တကျ ထားရှိပါ။",
    "Avoid overhead irrigation late in the afternoon.":
        "ညနေပိုင်းတွင် အပင်ပေါ်မှ မိုးရေဖျန်းသကဲ့သို့ ရေပေးဝေခြင်းကို ရှောင်ကြဉ်ပါ။",
    "Use post-harvest hot water treatment (52°C for 5 minutes) on orchard fruits like Mango.":
        "သရက်သီးကဲ့သို့ အသီးများကို ခူးဆွတ်ပြီးနောက် ရေနွေး (52°C တွင် ၅ မိနစ်ခန့်) စိမ်၍ မှိုသန့်စင်ပါ။",

    # --- 4. PATHOGEN_KNOWLEDGE_BASE: Blight ---
    "Water-soaked streaks or concentric target-like brown spots on leaf blades.":
        "အရွက်ပြားပေါ်တွင် ရေစိုနာစင်းများ သို့မဟုတ် ပစ်မှတ်ပုံစံ စက်ဝိုင်းရစ် အညိုရောင်အပြောက်များ ဖြစ်ပေါ်ခြင်း။",
    "Yellowing (chlorosis) halo surrounding necrotic leaf tissue.":
        "သေဆုံးနေသော အရွက်တစ်ရှူးပတ်လည်တွင် အဝါရောင်အကွင်း (Chlorosis) ဖြစ်ပေါ်နေခြင်း။",
    "Rapid drying and scorching of foliage from the tips or margins inward.":
        "အရွက်ဖျား သို့မဟုတ် အရွက်နားများမှ အတွင်းဘက်သို့ လျင်မြန်စွာ ခြောက်သွေ့လောင်ကျွမ်းသွားခြင်း။",
    "Fungal (Alternaria, Phytophthora, Exserohilum) or bacterial (Xanthomonas) pathogens.":
        "မှိုရောဂါပိုး (Alternaria, Phytophthora, Exserohilum) သို့မဟုတ် ဘက်တီးရီးယားပိုး (Xanthomonas) ကြောင့် ဖြစ်ပွားခြင်း။",
    "Wind-driven rain and warm, humid tropical field conditions.":
        "လေနှင့်အတူပါလာသော မိုးရေနှင့် ပူနွေးစိုစွတ်သော အပူပိုင်းဒေသ စိုက်ခင်းအခြေအနေများ။",
    "Excessive nitrogen fertilization weakening cell walls.":
        "နိုက်ထရိုဂျင်မြေဩဇာ (ပုလဲ) လွန်ကဲစွာ သုံးစွဲမှုကြောင့် အပင်ဆဲလ်နံရံများ အားနည်းသွားခြင်း။",
    "Remove infected lower leaves immediately to slow upward spore spread.":
        "ရောဂါပိုး အပေါ်ပိုင်းအရွက်များသို့ မကူးစက်စေရန် ရောဂါကျနေသော အောက်ခြေအရွက်များကို ချက်ချင်းဖယ်ရှားပါ။",
    "For fungal blight, apply Chlorothalonil, Mancozeb, or Metalaxyl; for bacterial blight, use Copper hydroxide.":
        "မှိုလောင်မည်းရောဂါအတွက် Chlorothalonil, Mancozeb သို့မဟုတ် Metalaxyl သုံးပြီး ဘက်တီးရီးယားရွက်ခြောက်ရောဂါအတွက် Copper hydroxide ကို သုံးပါ။",
    "Drain standing water from field furrows.":
        "စိုက်ခင်းမြောင်းများအတွင်း ဝပ်နေသောရေများကို ဖောက်ထုတ်ပါ။",
    "Plant certified disease-free seeds or resistant regional varieties.":
        "ရောဂါကင်းစင်ကြောင်း အသိအမှတ်ပြုထားသော မျိုးစေ့ သို့မဟုတ် ရောဂါဒဏ်ခံနိုင်ရည်ရှိသော ဒေသမျိုးများကို စိုက်ပျိုးပါ။",
    "Balance nitrogen with adequate potassium (K) fertilizer.":
        "နိုက်ထရိုဂျင်မြေဩဇာကို ပိုတက်စီယမ် (K) မြေဩဇာနှင့် အချိုးညီမျှတစွာ တွဲဖက်သုံးစွဲပါ။",
    "Practice crop rotation and plow under infected crop residue after harvest.":
        "သီးလှည့်စိုက်ပျိုးနည်းကို ကျင့်သုံးပြီး ရိတ်သိမ်းပြီးနောက် ရောဂါကျန်အပင်အကြွင်းအကျန်များကို ထယ်ထိုးမြေမြှုပ်ပစ်ပါ။",

    # --- 5. PATHOGEN_KNOWLEDGE_BASE: Rust ---
    "Small yellow, orange, or reddish-brown powdery pustules on the underside of leaves.":
        "အရွက်အောက်မျက်နှာပြင်တွင် သေးငယ်သော အဝါရောင်၊ လိမ္မော်ရောင် သို့မဟုတ် အနီရောင်သမ်းသော အညိုရောင် အမှုန့်ဖုလေးများ ဖြစ်ပေါ်ခြင်း။",
    "Corresponding pale chlorotic spots on the upper leaf surface.":
        "အရွက်အပေါ်မျက်နှာပြင်တွင် အောက်ဘက်ရှိ အဖုများနှင့် တစ်တန်းတည်း အဝါဖျော့ရောင် အစက်အပြောက်များ ပေါ်နေခြင်း။",
    "Premature defoliation reducing crop yield and vigor.":
        "အရွက်များ အချိန်မတိုင်မီ ကြွေကျသဖြင့် အပင်အားနည်းပြီး အထွက်နှုန်း ကျဆင်းခြင်း။",
    "Obligate rust fungi (Puccinia, Hemileia vastatrix, Phakopsora).":
        "သံချေးမှိုရောဂါပိုးများ (Puccinia, Hemileia vastatrix, Phakopsora) ကြောင့် ဖြစ်ပွားခြင်း။",
    "Windborne urediniospores thriving in moderate temperatures with morning dew.":
        "နံနက်ခင်း နှင်းရည်နှင့် အသင့်အတင့် အပူချိန်တွင် လေမှတစ်ဆင့် ပျံ့နှံ့လာသော မှိုစပိုးများ ပေါက်ပွားခြင်း။",
    "Apply systemic triazole fungicides (Hexaconazole, Propiconazole) or strobilurins at early pustule appearance.":
        "သံချေးဖုများ စတင်တွေ့ရှိချိန်တွင် ပင်လုံးပြန့် Triazole မှိုသတ်ဆေး (Hexaconazole, Propiconazole) သို့မဟုတ် Strobilurin ဆေးများ ပက်ဖျန်းပါ။",
    "Use Bordeaux mixture or copper sprays as a protective barrier.":
        "ကြိုတင်ကာကွယ်ရန်အတွက် ဘော်ဒိုဆေးရည် (Bordeaux mixture) သို့မဟုတ် ကြေးနီဓာတ်ပါသော မှိုသတ်ဆေး ပက်ဖျန်းပါ။",
    "Cultivate rust-resistant hybrids or cultivars.":
        "သံချေးရောဂါဒဏ် ခံနိုင်ရည်ရှိသော မျိုးသစ်များကို ရွေးချယ်စိုက်ပျိုးပါ။",
    "Regulate shade trees in coffee/cacao plantations to reduce leaf wetness duration.":
        "ကော်ဖီနှင့် ကိုကိုးစိုက်ခင်းများတွင် အရွက်စိုစွတ်နေချိန် လျော့နည်းစေရန် အရိပ်ပင်များကို စနစ်တကျ ချိန်ညှိဖြတ်တောက်ပါ။",
    "Remove volunteer host plants between growing seasons.":
        "စိုက်ပျိုးရာသီ တစ်ခုနှင့်တစ်ခုကြားတွင် အလေ့ကျပေါက်နေသော လက်ခံပင်များကို ရှင်းလင်းဖယ်ရှားပါ။",

    # --- 6. PATHOGEN_KNOWLEDGE_BASE: Virus ---
    "Mottled light- and dark-green mosaic patterns or yellow vein clearing on leaves.":
        "အရွက်များပေါ်တွင် အစိမ်းဖျော့နှင့် အစိမ်းရင့်ရောင် ရောယှက်နေသော မိုဇေ့အကွက်များ သို့မဟုတ် အကြောဝါခြင်းများ ဖြစ်ပေါ်ခြင်း။",
    "Upward/downward leaf curling, puckering, and stunted shoot growth.":
        "အရွက်များ အပေါ်/အောက်သို့ လိပ်တွန့်နေခြင်း၊ တွန့်ရှုံ့ခြင်းနှင့် အညွန့်များ ပုကွညှပ်နေခြင်း။",
    "Distorted or ringspotted fruit development.":
        "အသီးများ ပုံသဏ္ဌာန်ပျက်ယွင်းခြင်း သို့မဟုတ် အသီးပေါ်တွင် အကွင်းပုံအပြောက်များ ဖြစ်ပေါ်ခြင်း။",
    "Plant viruses (Begomovirus, Potyvirus, Tungro, Mosaic) transmitted by insect vectors.":
        "ရောဂါသယ်ဆောင်သော ပိုးမွှားများမှတစ်ဆင့် ကူးစက်သည့် အပင်ဗိုင်းရပ်စ်ပိုးများ (Begomovirus, Potyvirus, Tungro, Mosaic)။",
    "High populations of whiteflies, aphids, leafhoppers, or mealybugs.":
        "ယင်ဖြူ၊ ပျပိုး၊ ဖြုတ်ပိုး သို့မဟုတ် ဂျပိုးဖြူများ အလွန်အမင်း ပေါက်ပွားကျရောက်နေခြင်း။",
    "Propagation from infected cuttings, tubers, or suckers.":
        "ရောဂါရှိသော ကိုင်းဖြတ်များ၊ မျိုးဥများ သို့မဟုတ် သားတက်များမှတစ်ဆင့် မျိုးပွားမိခြင်း။",
    "Rogue (uproot and destroy) severely virus-infected plants immediately to protect neighboring crops.":
        "ဘေးပတ်ဝန်းကျင်အပင်များသို့ မကူးစက်စေရန် ဗိုင်းရပ်စ်ပြင်းထန်စွာ ကျနေသောအပင်များကို အမြစ်ပါနှုတ်၍ ချက်ချင်းဖျက်ဆီးပါ။",
    "Control insect vectors using Neem oil, sticky yellow traps, or targeted systemic insecticides (Imidacloprid).":
        "ရောဂါသယ်ဆောင်သော ပိုးမွှားများကို တမာဆီ၊ အဝါရောင်ကော်ပြားထောင်ချောက် သို့မဟုတ် ပင်လုံးပြန့်ပိုးသတ်ဆေး (Imidacloprid) သုံး၍ နှိမ်နင်းပါ။",
    "Note: Chemical fungicides cannot cure viral infections once inside the plant.":
        "မှတ်ချက် - ဗိုင်းရပ်စ်ရောဂါသည် အပင်အတွင်းသို့ ဝင်ရောက်ပြီးပါက ဓာတုမှိုသတ်ဆေးများဖြင့် ကုသ၍မရနိုင်ပါ။",
    "Use strictly virus-free tissue culture plantlets, clean cassava stakes, or certified seeds.":
        "ဗိုင်းရပ်စ်ကင်းစင်သော တစ်ရှူးမျိုးပွားပျိုးပင်များ၊ ရောဂါကင်းသော ပီလောပီနံကိုင်းများ သို့မဟုတ် အသိအမှတ်ပြု မျိုးစေ့များကိုသာ သုံးပါ။",
    "Control weeds around field borders that act as alternative hosts for whiteflies and aphids.":
        "ယင်ဖြူနှင့် ပျပိုးများ ခိုအောင်းရာ လက်ခံပင်ဖြစ်သော စိုက်ခင်းဘေးပတ်လည်ရှိ ပေါင်းမြက်များကို ရှင်းလင်းပါ။",
    "Install insect-proof netting in vegetable nurseries.":
        "ဟင်းသီးဟင်းရွက် ပျိုးခင်းများတွင် ပိုးလုံပိုက်ကွန် (Insect-proof net) တပ်ဆင်အသုံးပြုပါ။",

    # --- 7. PATHOGEN_KNOWLEDGE_BASE: Mildew ---
    "White, talcum-like powdery fungal growth on leaves, shoots, or flower panicles (Powdery Mildew).":
        "အရွက်၊ အညွန့် သို့မဟုတ် ပန်းခိုင်များပေါ်တွင် ပေါင်ဒါမှုန့်ဖြူးထားသကဲ့သို့ အဖြူရောင်မှိုများ ဖုံးလွှမ်းနေခြင်း (ဖားဥမှိုရောဂါ)။",
    "Yellow angular leaf spots bounded by leaf veins with grayish fuzz underneath (Downy Mildew).":
        "အရွက်ကြောများအကြား ထောင့်ချိုးပုံ အဝါရောင်အကွက်များဖြစ်ပြီး အရွက်အောက်ဘက်တွင် မီးခိုးရောင်မှိုမျှင်များ ရှိနေခြင်း (ဒေါင်းနီးမှိုရောဂါ)။",
    "Blossom drop and deformed young fruit.":
        "ပန်းပွင့်များ ကြွေကျခြင်းနှင့် အသီးကင်းများ ပုံသဏ္ဌာန်ပျက်ယွင်းခြင်း။",
    "Oidium spp. (Powdery Mildew) favored by dry days and cool, humid nights.":
        "နေ့ဘက်ခြောက်သွေ့ပြီး ညဘက်အေးမြစိုစွတ်သော ရာသီဥတုတွင် ပေါက်ပွားလွယ်သည့် Oidium ဖားဥမှိုပိုး။",
    "Peronosclerospora / Pseudoperonospora (Downy Mildew) favored by wet foliage.":
        "အရွက်များ စိုစွတ်နေချိန်တွင် ပေါက်ပွားလွယ်သည့် ဒေါင်းနီးမှိုရောဂါပိုး (Peronosclerospora / Pseudoperonospora)။",
    "Spray wettable sulfur or potassium bicarbonate for Powdery Mildew.":
        "ဖားဥမှိုရောဂါအတွက် ရေဖျော်ကန့်မှုန့် (Wettable sulfur) သို့မဟုတ် ပိုတက်စီယမ် ဘိုင်ကာဗွန်နိတ် ဆေးရည်ကို ပက်ဖျန်းပါ။",
    "Apply Metalaxyl-M + Mancozeb or Fosetyl-Al for Downy Mildew infections.":
        "ဒေါင်းနီးမှိုရောဂါအတွက် Metalaxyl-M + Mancozeb သို့မဟုတ် Fosetyl-Al မှိုသတ်ဆေးကို အသုံးပြုပါ။",
    "Prune dense interior branches to maximize sunlight penetration.":
        "နေရောင်ခြည် ကောင်းစွာဝင်ရောက်နိုင်ရန် အပင်အတွင်းပိုင်းရှိ ထူထပ်သောကိုင်းများကို ချိုင်ပေးပါ။",
    "Avoid overcrowding seedlings and water at the soil line rather than wetting leaves.":
        "ပျိုးပင်များကို ထူထပ်စွာ မစိုက်ဘဲ အရွက်များကို ရေမစိုစေဘဲ အပင်ခြေမြေကြီးကိုသာ ရေလောင်းပေးပါ။",

    # --- 8. PATHOGEN_KNOWLEDGE_BASE: Rot ---
    "Soft, water-soaked, dark brown or black decaying lesions on roots, stems, buds, or fruits.":
        "အမြစ်၊ ပင်စည်၊ အဖူး သို့မဟုတ် အသီးများပေါ်တွင် ပျော့အိရေစိုပြီး အညိုရင့် သို့မဟုတ် အမည်းရောင် ပုပ်သွားသော အနာကွက်များ ဖြစ်ပေါ်ခြင်း။",
    "Foul odor or gummy/reddish ooze bleeding from trunk bark or split stalks.":
        "အနံ့ဆိုးထွက်ခြင်း သို့မဟုတ် ပင်စည်အခေါက်နှင့် ကွဲအက်နေသော ရိုးတံများမှ အစေး/အနီရောင်အရည်များ စိမ့်ထွက်ခြင်း။",
    "Wilting and yellowing of the upper crown/canopy.":
        "အပင်အပေါ်ပိုင်း အရွက်အုပ်များ ဝါပြီး ညှိုးကျလာခြင်း။",
    "Soilborne oomycetes (Phytophthora palmivora), Ganoderma, or Colletotrichum.":
        "မြေဆောင်မှိုရောဂါပိုးများ (Phytophthora palmivora, Ganoderma သို့မဟုတ် Colletotrichum) ကြောင့် ဖြစ်ပွားခြင်း။",
    "Waterlogged, poorly drained clay soils and root/trunk wounding.":
        "ရေဝပ်ပြီး ရေနုတ်အားနည်းသော မြေစေးများနှင့် အမြစ်/ပင်စည် ထိခိုက်ဒဏ်ရာရရှိခြင်း။",
    "Excise rotted bark/tissue and paint trunk wounds with Copper oxychloride or Phosphorous acid paste.":
        "ပုပ်နေသော အခေါက်/တစ်ရှူးများကို ခြစ်ထုတ်ဖယ်ရှားပြီး ဒဏ်ရာကို Copper oxychloride သို့မဟုတ် Phosphorous acid ဆေးအနှစ် သုတ်လိမ်းပါ။",
    "Apply soil drenching with Trichoderma harzianum bio-fungicide or Metalaxyl around the root zone.":
        "အမြစ်ပတ်လည် မြေကြီးကို Trichoderma ဇီဝမှိုသတ်ဆေး သို့မဟုတ် Metalaxyl ဆေးရည် ရွှဲရွှဲလောင်းချပေးပါ။",
    "Harvest and remove infected pods/fruits from the orchard floor immediately.":
        "ရောဂါကျနေသော အသီးများနှင့် မြေပြင်ပေါ်ကြွေကျနေသော အသီးပုပ်များကို ချက်ချင်းကောက်ယူ ဖယ်ရှားပါ။",
    "Construct raised beds or drainage trenches in heavy monsoon areas.":
        "မိုးများသော ဒေသများတွင် စိုက်ဘောင်မြှင့်တင်ခြင်း သို့မဟုတ် ရေနုတ်မြောင်းများ တူးဖော်ခြင်း ပြုလုပ်ပါ။",
    "Avoid injuring tree trunks and roots during weeding or fertilizer application.":
        "ပေါင်းရှင်းစဉ် သို့မဟုတ် မြေဩဇာကျွေးစဉ် ပင်စည်နှင့် အမြစ်များ ထိခိုက်ဒဏ်ရာမရစေရန် ဂရုပြုပါ။",

    # --- 9. Default Fallback Profile (Static Sentences) ---
    "Localized tissue damage reducing photosynthetic surface area.":
        "အပင်တစ်ရှူးများ ထိခိုက်ပျက်စီးမှုကြောင့် အစာချက်လုပ်နိုင်သော အရွက်မျက်နှာပြင် လျော့နည်းသွားခြင်း။",
    "Stress symptoms spreading across affected leaves or fruit skin.":
        "ရောဂါဒဏ်ခံရသော အရွက်များ သို့မဟုတ် အသီးအခွံတစ်လျှောက် ရောဂါလက္ခဏာများ ပျံ့နှံ့လာခြင်း။",
    "Warm, humid Southeast Asian field conditions favoring spore germination or pest activity.":
        "ပူနွေးစိုစွတ်သော အရှေ့တောင်အာရှ စိုက်ခင်းရာသီဥတုကြောင့် မှိုစပိုးပေါက်ပွားမှု သို့မဟုတ် ပိုးမွှားကျရောက်မှု အားကောင်းခြင်း။",
    "Apply an appropriate broad-spectrum fungicide or targeted agricultural spray recommended by local extension officers.":
        "ဒေသခံ စိုက်ပျိုးရေးပညာရှင်များ ညွှန်ကြားသော သင့်လျော်သည့် မှိုသတ်ဆေး သို့မဟုတ် စိုက်ပျိုးရေးဆေးဝါးကို ပက်ဖျန်းပါ။",
    "Avoid applying high-nitrogen fertilizers until the infection is controlled.":
        "ရောဂါကို ထိန်းချုပ်နိုင်ခြင်း မရှိသေးသရွေ့ နိုက်ထရိုဂျင်မြေဩဇာ (ပုလဲ) အလွန်အကျွံ ကျွေးခြင်းကို ရှောင်ကြဉ်ပါ။",
    "Improve field drainage and canopy airflow through regular pruning.":
        "ပုံမှန်ကိုင်းချိုင်ပေးခြင်းဖြင့် လေဝင်လေထွက်ကောင်းအောင် ပြုလုပ်ပြီး စိုက်ခင်းရေနုတ်မြောင်းများ ကောင်းမွန်အောင် ဆောင်ရွက်ပါ။",
    "Sanitize farm tools and rotate crops where applicable.":
        "စိုက်ပျိုးရေးသုံး ကိရိယာများကို ပိုးသန့်စင်ပြီး သီးလှည့်စိုက်ပျိုးနည်းကို ကျင့်သုံးပါ။",
}

# 3. Regex Matchers for the 3 Dynamic Fallback f-strings in disease_data.py
_RE_SYMPTOM_FALLBACK = re.compile(
    r"^Characteristic (.+) lesions and discoloration on (.+)\.$"
)
_RE_CAUSE_FALLBACK = re.compile(
    r"^Pathogen or pest associated with (.+)\.$"
)
_RE_TREATMENT_FALLBACK = re.compile(
    r"^Prune and safely dispose of leaves/fruits heavily affected by (.+)\.$"
)


def normalize_lang_code(raw_lang: str) -> str:
    if not raw_lang:
        return "en"
    primary = raw_lang.split(",")[0].strip().lower()
    return LANGUAGE_ALIASES.get(primary, primary.split("-")[0])


def translate_disease_or_crop_term(term: str) -> str:
    """Translates a crop or disease name using exact or partial glossary matching."""
    clean = term.strip()
    if clean in MYANMAR_AGRI_GLOSSARY:
        return MYANMAR_AGRI_GLOSSARY[clean]

    # Try translating word-by-word if a compound name isn't directly in the glossary
    for eng_key, my_val in MYANMAR_AGRI_GLOSSARY.items():
        if eng_key.lower() == clean.lower():
            return my_val

    return clean


def translate_text(text: str, target_lang: str) -> str:
    """Instant dictionary-based translation with zero network requests."""
    if not text or not isinstance(text, str) or target_lang != "my":
        return text

    clean_text = text.strip()
    if not clean_text:
        return text

    # 1. Exact Glossary Match (Crops, Statuses, Severity, Diseases)
    if clean_text in MYANMAR_AGRI_GLOSSARY:
        return MYANMAR_AGRI_GLOSSARY[clean_text]

    # 2. Exact Static Sentence Match from disease_data.py
    if clean_text in DISEASE_SENTENCE_DICTIONARY:
        return DISEASE_SENTENCE_DICTIONARY[clean_text]

    # 3. Dynamic f-string Template Matchers from disease_data.py
    m1 = _RE_SYMPTOM_FALLBACK.match(clean_text)
    if m1:
        disease_my = translate_disease_or_crop_term(m1.group(1))
        plant_my = translate_disease_or_crop_term(m1.group(2))
        return f"{plant_my} ပေါ်တွင် {disease_my} ၏ လက္ခဏာရပ်ဖြစ်သော အနာကွက်များနှင့် အရောင်ပြောင်းလဲမှုများ တွေ့ရခြင်း။"

    m2 = _RE_CAUSE_FALLBACK.match(clean_text)
    if m2:
        disease_my = translate_disease_or_crop_term(m2.group(1))
        return f"{disease_my} နှင့် ဆက်စပ်သော ရောဂါပိုး သို့မဟုတ် ပိုးမွှား ကျရောက်ခြင်း။"

    m3 = _RE_TREATMENT_FALLBACK.match(clean_text)
    if m3:
        disease_my = translate_disease_or_crop_term(m3.group(1))
        return f"{disease_my} ပြင်းထန်စွာ ကျရောက်နေသော အရွက်များ/အသီးများကို ဖြတ်တောက်ပြီး စနစ်တကျ ဖျက်ဆီးပစ်ပါ။"

    # 4. Case-insensitive fallback check on glossary
    for k, v in MYANMAR_AGRI_GLOSSARY.items():
        if k.lower() == clean_text.lower():
            return v

    return text


def translate_list(items: List[str], target_lang: str) -> List[str]:
    """Translates a list of strings instantaneously via dictionary lookup."""
    if not items or target_lang != "my":
        return items
    return [translate_text(item, target_lang) for item in items]


class TranslationService:
    @staticmethod
    def translate_prediction_details(
        details: Dict[str, Any], raw_language: str
    ) -> Dict[str, Any]:
        target_lang = normalize_lang_code(raw_language)

        if target_lang == "en" or not details:
            return details

        if hasattr(details, "model_dump"):
            translated = details.model_dump()
        elif hasattr(details, "dict"):
            translated = details.dict()
        else:
            translated = details.copy()

        # Translate single-string fields
        translated["plantName"] = translate_text(translated.get("plantName", ""), target_lang)
        translated["healthStatus"] = translate_text(translated.get("healthStatus", ""), target_lang)
        translated["detectedDisease"] = translate_text(translated.get("detectedDisease", ""), target_lang)
        translated["diseaseSeverity"] = translate_text(translated.get("diseaseSeverity", ""), target_lang)
        translated["estimatedAffectedArea"] = translate_text(
            translated.get("estimatedAffectedArea", ""), target_lang
        )

        # Keep Latin scientific names, but translate placeholders like "Not Applicable" or "N/A"
        sci_name = translated.get("scientificName", "")
        if sci_name in ("Not Applicable", "Unknown", "None", "N/A"):
            translated["scientificName"] = translate_text(sci_name, target_lang)

        # Translate bullet-point list fields
        translated["visibleSymptoms"] = translate_list(
            translated.get("visibleSymptoms", []), target_lang
        )
        translated["possibleCauses"] = translate_list(
            translated.get("possibleCauses", []), target_lang
        )
        translated["treatmentRecommendations"] = translate_list(
            translated.get("treatmentRecommendations", []), target_lang
        )
        translated["preventionRecommendations"] = translate_list(
            translated.get("preventionRecommendations", []), target_lang
        )

        return translated


translation_service = TranslationService()