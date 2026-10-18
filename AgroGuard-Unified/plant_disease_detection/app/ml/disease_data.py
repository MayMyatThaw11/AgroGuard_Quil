from typing import Dict, List, Any

# Maps frontend crop buttons to dataset folder prefixes
CROP_PREFIX_MAP: Dict[str, List[str]] = {
    # Group 1
    "Rice": ["Rice___", "rice_"],
    "Corn (Maize)": ["Corn___", "Corn_(maize)___"],
    "Soybean": ["Soybean___"],
    "Peanut (Groundnut)": ["Peanut___"],
    "Sesame": ["Sesame___"],
    # Group 2
    "Coconut": ["Coconut___", "coconut_"],
    "Oil Palm": ["Oil_Palm___"],
    "Rubber": ["Rubber___"],
    "Cashew": ["Cashew___"],
    "Black Pepper": ["Black_Pepper___"],
    # Group 3
    "Cassava": ["Cassava___", "Cassava "],
    "Coffee": ["Coffee___", "coffee___"],
    "Sugarcane": ["Sugarcane___", "Sugarcane "],
    "Tea": ["Tea___", "Tea "],
    "Cacao": ["Cacao___"],
    # Group 4
    "Banana": ["Banana___", "banana_"],
    "Durian": ["Durian___", "durian "],
    "Mango": ["Mango_Leaf___", "Mango_Fruit___", "mango_"],
    "Papaya": ["Papaya___", "papaya_"],
    "Dragon Fruit": ["Dragon_Fruit___"],
    # Group 5
    "Tomato": ["Tomato_Leaf___", "Tomato_Fruit___", "Tomato___"],
    "Pepper / Chili": ["Pepper_Leaf___", "Pepper_Fruit___", "Chili_Leaf___", "Chili_Fruit___", "Pepper,_bell___"],
    "Eggplant": ["Eggplant___", "Eggplant "],
    "Pineapple": ["Pineapple___"],
    "Watermelon": ["Watermelon___"],
}

SCIENTIFIC_NAMES: Dict[str, str] = {
    "Rice": "Oryza sativa",
    "Corn": "Zea mays",
    "Soybean": "Glycine max",
    "Peanut": "Arachis hypogaea",
    "Sesame": "Sesamum indicum",
    "Coconut": "Cocos nucifera",
    "Oil Palm": "Elaeis guineensis",
    "Rubber": "Hevea brasiliensis",
    "Cashew": "Anacardium occidentale",
    "Black Pepper": "Piper nigrum",
    "Cassava": "Manihot esculenta",
    "Coffee": "Coffea arabica / canephora",
    "Sugarcane": "Saccharum officinarum",
    "Tea": "Camellia sinensis",
    "Cacao": "Theobroma cacao",
    "Banana": "Musa spp.",
    "Durian": "Durio zibethinus",
    "Mango": "Mangifera indica",
    "Papaya": "Carica papaya",
    "Dragon Fruit": "Selenicereus undatus",
    "Tomato": "Solanum lycopersicum",
    "Pepper": "Capsicum annuum",
    "Chili": "Capsicum frutescens",
    "Eggplant": "Solanum melongena",
    "Pineapple": "Ananas comosus",
    "Watermelon": "Citrullus lanatus",
}

# Specific agronomic profiles for common pathogen types
PATHOGEN_KNOWLEDGE_BASE: Dict[str, Dict[str, List[str]]] = {
    "anthracnose": {
        "visibleSymptoms": [
            "Dark brown to black sunken lesions on leaves, stems, or ripening fruit.",
            "Concentric rings or salmon-pink spore masses in humid conditions.",
            "Premature leaf drop and progressive twig dieback.",
        ],
        "possibleCauses": [
            "Fungal infection by Colletotrichum species.",
            "High relative humidity (>80%) and warm monsoon rain splash.",
            "Dense canopy with poor air circulation.",
        ],
        "treatmentRecommendations": [
            "Prune and destroy heavily infected leaves, twigs, and mummified fruits.",
            "Apply copper-based fungicides (Copper oxychloride) or Mancozeb/Azoxystrobin as directed.",
            "Sanitize pruning shears with 70% alcohol between cuts.",
        ],
        "preventionRecommendations": [
            "Maintain proper tree/plant spacing to improve sunlight and airflow.",
            "Avoid overhead irrigation late in the afternoon.",
            "Use post-harvest hot water treatment (52°C for 5 minutes) on orchard fruits like Mango.",
        ],
    },
    "blight": {
        "visibleSymptoms": [
            "Water-soaked streaks or concentric target-like brown spots on leaf blades.",
            "Yellowing (chlorosis) halo surrounding necrotic leaf tissue.",
            "Rapid drying and scorching of foliage from the tips or margins inward.",
        ],
        "possibleCauses": [
            "Fungal (Alternaria, Phytophthora, Exserohilum) or bacterial (Xanthomonas) pathogens.",
            "Wind-driven rain and warm, humid tropical field conditions.",
            "Excessive nitrogen fertilization weakening cell walls.",
        ],
        "treatmentRecommendations": [
            "Remove infected lower leaves immediately to slow upward spore spread.",
            "For fungal blight, apply Chlorothalonil, Mancozeb, or Metalaxyl; for bacterial blight, use Copper hydroxide.",
            "Drain standing water from field furrows.",
        ],
        "preventionRecommendations": [
            "Plant certified disease-free seeds or resistant regional varieties.",
            "Balance nitrogen with adequate potassium (K) fertilizer.",
            "Practice crop rotation and plow under infected crop residue after harvest.",
        ],
    },
    "rust": {
        "visibleSymptoms": [
            "Small yellow, orange, or reddish-brown powdery pustules on the underside of leaves.",
            "Corresponding pale chlorotic spots on the upper leaf surface.",
            "Premature defoliation reducing crop yield and vigor.",
        ],
        "possibleCauses": [
            "Obligate rust fungi (Puccinia, Hemileia vastatrix, Phakopsora).",
            "Windborne urediniospores thriving in moderate temperatures with morning dew.",
        ],
        "treatmentRecommendations": [
            "Apply systemic triazole fungicides (Hexaconazole, Propiconazole) or strobilurins at early pustule appearance.",
            "Use Bordeaux mixture or copper sprays as a protective barrier.",
        ],
        "preventionRecommendations": [
            "Cultivate rust-resistant hybrids or cultivars.",
            "Regulate shade trees in coffee/cacao plantations to reduce leaf wetness duration.",
            "Remove volunteer host plants between growing seasons.",
        ],
    },
    "virus": {
        "visibleSymptoms": [
            "Mottled light- and dark-green mosaic patterns or yellow vein clearing on leaves.",
            "Upward/downward leaf curling, puckering, and stunted shoot growth.",
            "Distorted or ringspotted fruit development.",
        ],
        "possibleCauses": [
            "Plant viruses (Begomovirus, Potyvirus, Tungro, Mosaic) transmitted by insect vectors.",
            "High populations of whiteflies, aphids, leafhoppers, or mealybugs.",
            "Propagation from infected cuttings, tubers, or suckers.",
        ],
        "treatmentRecommendations": [
            "Rogue (uproot and destroy) severely virus-infected plants immediately to protect neighboring crops.",
            "Control insect vectors using Neem oil, sticky yellow traps, or targeted systemic insecticides (Imidacloprid).",
            "Note: Chemical fungicides cannot cure viral infections once inside the plant.",
        ],
        "preventionRecommendations": [
            "Use strictly virus-free tissue culture plantlets, clean cassava stakes, or certified seeds.",
            "Control weeds around field borders that act as alternative hosts for whiteflies and aphids.",
            "Install insect-proof netting in vegetable nurseries.",
        ],
    },
    "mildew": {
        "visibleSymptoms": [
            "White, talcum-like powdery fungal growth on leaves, shoots, or flower panicles (Powdery Mildew).",
            "Yellow angular leaf spots bounded by leaf veins with grayish fuzz underneath (Downy Mildew).",
            "Blossom drop and deformed young fruit.",
        ],
        "possibleCauses": [
            "Oidium spp. (Powdery Mildew) favored by dry days and cool, humid nights.",
            "Peronosclerospora / Pseudoperonospora (Downy Mildew) favored by wet foliage.",
        ],
        "treatmentRecommendations": [
            "Spray wettable sulfur or potassium bicarbonate for Powdery Mildew.",
            "Apply Metalaxyl-M + Mancozeb or Fosetyl-Al for Downy Mildew infections.",
        ],
        "preventionRecommendations": [
            "Prune dense interior branches to maximize sunlight penetration.",
            "Avoid overcrowding seedlings and water at the soil line rather than wetting leaves.",
        ],
    },
    "rot": {
        "visibleSymptoms": [
            "Soft, water-soaked, dark brown or black decaying lesions on roots, stems, buds, or fruits.",
            "Foul odor or gummy/reddish ooze bleeding from trunk bark or split stalks.",
            "Wilting and yellowing of the upper crown/canopy.",
        ],
        "possibleCauses": [
            "Soilborne oomycetes (Phytophthora palmivora), Ganoderma, or Colletotrichum.",
            "Waterlogged, poorly drained clay soils and root/trunk wounding.",
        ],
        "treatmentRecommendations": [
            "Excise rotted bark/tissue and paint trunk wounds with Copper oxychloride or Phosphorous acid paste.",
            "Apply soil drenching with Trichoderma harzianum bio-fungicide or Metalaxyl around the root zone.",
            "Harvest and remove infected pods/fruits from the orchard floor immediately.",
        ],
        "preventionRecommendations": [
            "Construct raised beds or drainage trenches in heavy monsoon areas.",
            "Avoid injuring tree trunks and roots during weeding or fertilizer application.",
        ],
    },
}


def parse_class_label(raw_class_name: str) -> Dict[str, Any]:
    """
    Converts raw folder names like 'Mango_Leaf___Anthracnose' or 'Rice___Healthy'
    into structured details matching DiseaseDetectionPage.jsx.
    """
    if raw_class_name == "00_Background_Non_Plant" or "Not_A_Plant" in raw_class_name:
        return {
            "is_background": True,
            "plantName": "Non-Plant / Background Detected",
            "scientificName": "N/A",
            "detectedDisease": "None (Invalid Plant Image)",
            "is_healthy": False,
        }

    # Split Crop and Disease
    if "___" in raw_class_name:
        crop_part, disease_part = raw_class_name.split("___", 1)
    elif "_" in raw_class_name:
        crop_part, disease_part = raw_class_name.split("_", 1)
    elif " " in raw_class_name:
        crop_part, disease_part = raw_class_name.split(" ", 1)
    else:
        crop_part, disease_part = raw_class_name, "Unknown"

    clean_crop = crop_part.replace("_", " ").strip().title()
    clean_disease = disease_part.replace("_", " ").strip().title()

    # Determine base crop for scientific name lookup
    base_crop_key = clean_crop.replace(" Leaf", "").replace(" Fruit", "").strip()
    scientific_name = SCIENTIFIC_NAMES.get(base_crop_key, "Tropical Crop Species")

    is_healthy = "healthy" in clean_disease.lower()

    return {
        "is_background": False,
        "plantName": clean_crop,
        "scientificName": scientific_name,
        "detectedDisease": "None (Healthy Plant)" if is_healthy else clean_disease,
        "is_healthy": is_healthy,
    }


def build_agronomic_details(raw_class_name: str, confidence: float) -> Dict[str, Any]:
    parsed = parse_class_label(raw_class_name)

    # 1. Handle Non-Plant / Rejected Background Image
    if parsed["is_background"]:
        return {
            "healthScore": 0,
            "plantName": parsed["plantName"],
            "scientificName": parsed["scientificName"],
            "healthStatus": "Invalid Image",
            "detectedDisease": parsed["detectedDisease"],
            "confidenceScore": round(confidence, 1),
            "diseaseSeverity": "Not Applicable",
            "estimatedAffectedArea": "0%",
            "visibleSymptoms": [
                "No clear plant leaf, stem, or fruit surface was detected in the frame.",
                "The image may contain background objects, soil, tools, or extreme blur.",
            ],
            "possibleCauses": [
                "Camera out of focus or pointed away from the plant organ.",
                "Non-plant photo uploaded.",
            ],
            "treatmentRecommendations": [
                "Retake the photo holding the camera 15–30 cm away from a single leaf or fruit.",
                "Ensure the damaged plant part fills at least 60% of the frame.",
            ],
            "preventionRecommendations": [
                "Use natural daylight and avoid strong shadows or motion blur.",
            ],
        }

    # 2. Handle Healthy Plant Prediction
    if parsed["is_healthy"]:
        health_score = min(98, max(85, int(round(confidence))))
        return {
            "healthScore": health_score,
            "plantName": parsed["plantName"],
            "scientificName": parsed["scientificName"],
            "healthStatus": "Healthy",
            "detectedDisease": "No Disease Detected",
            "confidenceScore": round(confidence, 1),
            "diseaseSeverity": "None (0%)",
            "estimatedAffectedArea": "< 2%",
            "visibleSymptoms": [
                "Normal green chlorophyll pigmentation and intact leaf/fruit cuticles.",
                "No necrotic lesions, fungal spore pustules, or viral mosaic distortion observed.",
            ],
            "possibleCauses": [
                "Optimal crop nutrition, irrigation, and phytosanitary management.",
            ],
            "treatmentRecommendations": [
                "No chemical fungicide or bactericide treatment is required.",
                "Continue standard irrigation and balanced NPK + micronutrient fertilization.",
            ],
            "preventionRecommendations": [
                "Perform weekly field scouting to catch early seasonal pests or monsoon diseases.",
                "Maintain weed-free field borders and good soil drainage.",
            ],
        }

    # 3. Handle Diseased Plant Prediction
    lower_name = raw_class_name.lower()
    matched_profile = None

    if "anthracnose" in lower_name or "pollu" in lower_name:
        matched_profile = PATHOGEN_KNOWLEDGE_BASE["anthracnose"]
    elif "blight" in lower_name or "scald" in lower_name or "canker" in lower_name:
        matched_profile = PATHOGEN_KNOWLEDGE_BASE["blight"]
    elif "rust" in lower_name:
        matched_profile = PATHOGEN_KNOWLEDGE_BASE["rust"]
    elif any(k in lower_name for k in ["virus", "mosaic", "curl", "tungro", "turgro", "bunchy", "mottle", "phyllody"]):
        matched_profile = PATHOGEN_KNOWLEDGE_BASE["virus"]
    elif "mildew" in lower_name:
        matched_profile = PATHOGEN_KNOWLEDGE_BASE["mildew"]
    elif any(k in lower_name for k in ["rot", "wilt", "ganoderma", "bleeding", "die_back", "dieback"]):
        matched_profile = PATHOGEN_KNOWLEDGE_BASE["rot"]

    # Default fallback for leaf spots, pests, or other specific classes
    if matched_profile is None:
        matched_profile = {
            "visibleSymptoms": [
                f"Characteristic {parsed['detectedDisease']} lesions and discoloration on {parsed['plantName']}.",
                "Localized tissue damage reducing photosynthetic surface area.",
                "Stress symptoms spreading across affected leaves or fruit skin.",
            ],
            "possibleCauses": [
                f"Pathogen or pest associated with {parsed['detectedDisease']}.",
                "Warm, humid Southeast Asian field conditions favoring spore germination or pest activity.",
            ],
            "treatmentRecommendations": [
                f"Prune and safely dispose of leaves/fruits heavily affected by {parsed['detectedDisease']}.",
                "Apply an appropriate broad-spectrum fungicide or targeted agricultural spray recommended by local extension officers.",
                "Avoid applying high-nitrogen fertilizers until the infection is controlled.",
            ],
            "preventionRecommendations": [
                "Improve field drainage and canopy airflow through regular pruning.",
                "Sanitize farm tools and rotate crops where applicable.",
            ],
        }

    # Calculate severity & healthScore based on model confidence
    if confidence >= 85:
        severity = "Moderate to High"
        affected_area = "25% – 45%"
        health_score = max(25, 100 - int(confidence * 0.7))
        status_label = "Diseased (Action Needed)"
    elif confidence >= 60:
        severity = "Moderate"
        affected_area = "15% – 25%"
        health_score = max(45, 100 - int(confidence * 0.55))
        status_label = "Moderate Infection"
    else:
        severity = "Mild / Early Stage"
        affected_area = "5% – 15%"
        health_score = max(60, 100 - int(confidence * 0.4))
        status_label = "Early Symptoms Detected"

    return {
        "healthScore": health_score,
        "plantName": parsed["plantName"],
        "scientificName": parsed["scientificName"],
        "healthStatus": status_label,
        "detectedDisease": parsed["detectedDisease"],
        "confidenceScore": round(confidence, 1),
        "diseaseSeverity": severity,
        "estimatedAffectedArea": affected_area,
        **matched_profile,
    }