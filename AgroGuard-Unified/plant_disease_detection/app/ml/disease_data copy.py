DISEASE_KNOWLEDGE = {
    # ==========================================
    # APPLE
    # ==========================================
    "Apple___Apple_scab": {
        "plantName": "Apple",
        "scientificName": "Malus domestica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Olive green to black scabby spots on leaves", "Twisted or puckered leaves", "Dark scabby spots on fruit"],
        "possibleCauses": ["Fungal pathogen (Venturia inaequalis)", "Wet, humid spring weather"],
        "treatmentRecommendations": ["Apply appropriate fungicide", "Remove and destroy fallen leaves", "Apply urea to fallen leaves to speed decomposition"],
        "preventionRecommendations": ["Prune trees to increase airflow", "Plant scab-resistant varieties"]
    },
    "Apple___Black_rot": {
        "plantName": "Apple",
        "scientificName": "Malus domestica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Purple spots on leaves turning into 'frog-eye' lesions", "Dark, rotting rings on fruit", "Cankers on branches"],
        "possibleCauses": ["Fungal pathogen (Botryosphaeria obtusa)", "Unpruned dead wood acting as a host"],
        "treatmentRecommendations": ["Prune out and destroy infected wood", "Apply captan-based fungicides", "Remove mummified fruit from the tree"],
        "preventionRecommendations": ["Sanitize pruning tools", "Remove dead wood annually"]
    },
    "Apple___Cedar_apple_rust": {
        "plantName": "Apple",
        "scientificName": "Malus domestica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Bright yellow-orange spots on upper leaf surface", "Spore cups on undersides of leaves", "Premature leaf drop"],
        "possibleCauses": ["Fungal pathogen (Gymnosporangium juniperi-virginianae)", "Proximity to infected cedar trees"],
        "treatmentRecommendations": ["Apply preventative fungicide in early spring", "Remove nearby infected cedar galls", "Spray sterol inhibitors during infection periods"],
        "preventionRecommendations": ["Do not plant apples near eastern red cedars", "Choose rust-resistant apple varieties"]
    },
    "Apple___healthy": {
        "plantName": "Apple",
        "scientificName": "Malus domestica",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Uniform green foliage", "Smooth bark", "No visible spots or lesions"],
        "possibleCauses": ["Optimal growing conditions", "Proper nutrient management"],
        "treatmentRecommendations": ["None required", "Continue current watering schedule", "Maintain standard care"],
        "preventionRecommendations": ["Maintain annual pruning", "Apply preventative dormant oil sprays"]
    },

    # ==========================================
    # BANANA
    # ==========================================
    "banana_cordana": {
        "plantName": "Banana",
        "scientificName": "Musa",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Large, oval, pale brown necrotic spots", "Bright yellow halos around spots", "Spots merging to destroy large leaf areas"],
        "possibleCauses": ["Fungal pathogen (Cordana musae)", "High humidity and poor plantation hygiene"],
        "treatmentRecommendations": ["Apply protective fungicides", "Cut and burn heavily infected leaves", "Improve plantation drainage"],
        "preventionRecommendations": ["Avoid dense planting", "Remove weeds to lower humidity around base"]
    },
    "banana_healthy": {
        "plantName": "Banana",
        "scientificName": "Musa",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Large, unbroken green leaves", "Sturdy pseudostem", "Vibrant coloration"],
        "possibleCauses": ["Optimal growing conditions", "Adequate potassium levels"],
        "treatmentRecommendations": ["None required", "Continue standard care routine", "Maintain soil moisture"],
        "preventionRecommendations": ["Apply balanced fertilizers", "Ensure wind protection"]
    },
    "banana_pestalotiopsis": {
        "plantName": "Banana",
        "scientificName": "Musa",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small reddish-brown spots expanding into irregular patches", "Grayish centers in mature lesions", "Leaf tip dieback"],
        "possibleCauses": ["Fungal pathogen (Pestalotiopsis palmarum)", "Plant stress from poor nutrition or drought"],
        "treatmentRecommendations": ["Apply broad-spectrum fungicides", "Remove severely damaged foliage", "Correct nutrient deficiencies"],
        "preventionRecommendations": ["Minimize mechanical damage to leaves", "Provide consistent irrigation"]
    },
    "banana_sigatoka": {
        "plantName": "Banana",
        "scientificName": "Musa",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small pale yellow streaks parallel to leaf veins", "Streaks turning into elliptical brown spots", "Premature leaf death reducing fruit yield"],
        "possibleCauses": ["Fungal pathogen (Mycosphaerella musicola or fijiensis)", "Prolonged leaf wetness and high rainfall"],
        "treatmentRecommendations": ["Apply systemic fungicides mixed with mineral oil", "De-leaf and destroy infected plant material", "Apply urea to ground debris"],
        "preventionRecommendations": ["Ensure adequate plant spacing", "Install efficient drainage systems"]
    },

    # ==========================================
    # BLUEBERRY
    # ==========================================
    "Blueberry___healthy": {
        "plantName": "Blueberry",
        "scientificName": "Vaccinium",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Smooth, ovate green leaves", "Healthy twig growth", "No discoloration"],
        "possibleCauses": ["Optimal growing conditions", "Proper acidic soil environment"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue regular watering"],
        "preventionRecommendations": ["Maintain soil pH between 4.5 and 5.5", "Apply pine bark mulch"]
    },

    # ==========================================
    # CHERRY
    # ==========================================
    "Cherry_(including_sour)___healthy": {
        "plantName": "Cherry",
        "scientificName": "Prunus avium",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Dark green leaves with serrated edges", "Smooth bark", "No spots or mildew"],
        "possibleCauses": ["Optimal growing conditions", "Good air circulation"],
        "treatmentRecommendations": ["None required", "Continue standard care", "Maintain hydration"],
        "preventionRecommendations": ["Prune annually for good canopy airflow", "Apply dormant oil in winter"]
    },
    "Cherry_(including_sour)___Powdery_mildew": {
        "plantName": "Cherry",
        "scientificName": "Prunus avium",
        "healthStatus": "Infected",
        "visibleSymptoms": ["White, powdery fungal patches on young leaves", "Curled or distorted leaf shapes", "Stunted shoot growth"],
        "possibleCauses": ["Fungal pathogen (Podosphaera clandestina)", "High humidity with warm days and cool nights"],
        "treatmentRecommendations": ["Apply sulfur or potassium bicarbonate sprays", "Prune out heavily infected shoots", "Apply targeted fungicides early in the season"],
        "preventionRecommendations": ["Ensure good tree spacing", "Avoid excess nitrogen fertilizer which fuels soft growth"]
    },

    # ==========================================
    # COCONUT
    # ==========================================
    "coconut_Bud Root Dropping": {
        "plantName": "Coconut",
        "scientificName": "Cocos nucifera",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Premature dropping of young nuts", "Discoloration near the base of the nut", "Weakening of fruit stalks"],
        "possibleCauses": ["Fungal pathogens or severe nutrient deficiency", "Water stress"],
        "treatmentRecommendations": ["Apply targeted fungicides if fungal rot is present", "Apply balanced NPK fertilizer with micronutrients", "Ensure consistent watering"],
        "preventionRecommendations": ["Regularly clean the crown", "Maintain optimal soil moisture"]
    },
    "coconut_Bud Rot": {
        "plantName": "Coconut",
        "scientificName": "Cocos nucifera",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Yellowing of the spear (youngest) leaf", "Spear leaf easily pulls out revealing foul-smelling rot", "Eventual death of the palm"],
        "possibleCauses": ["Oomycete pathogen (Phytophthora palmivora)", "Heavy rainfall and high humidity"],
        "treatmentRecommendations": ["Cut and remove infected tissue from the crown", "Apply Bordeaux paste or copper fungicide to the exposed area", "Cover treated crown to protect from rain"],
        "preventionRecommendations": ["Spray 1% Bordeaux mixture before monsoon season", "Improve field drainage"]
    },
    "coconut_Gray Leaf Spot": {
        "plantName": "Coconut",
        "scientificName": "Cocos nucifera",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, yellowish-brown spots with gray centers", "Dark brown borders around lesions", "Merging spots causing leaf blight"],
        "possibleCauses": ["Fungal pathogen (Pestalotiopsis palmarum)", "Potassium deficiency weakening the fronds"],
        "treatmentRecommendations": ["Apply appropriate fungicidal sprays", "Remove and burn severely infected fronds", "Apply muriate of potash to correct deficiency"],
        "preventionRecommendations": ["Ensure balanced fertilization", "Avoid planting under heavy shade"]
    },
    "coconut_healthy": {
        "plantName": "Coconut",
        "scientificName": "Cocos nucifera",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Strong, dark green fronds", "Sturdy trunk", "Healthy fruit development"],
        "possibleCauses": ["Optimal growing conditions", "Adequate tropical climate"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue regular harvesting"],
        "preventionRecommendations": ["Apply regular organic compost", "Monitor for early pest signs"]
    },
    "coconut_Leaf Rot": {
        "plantName": "Coconut",
        "scientificName": "Cocos nucifera",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Blackening and rotting of leaflet tips", "Leaves drying up and breaking off in wind", "Often occurs alongside root wilt disease"],
        "possibleCauses": ["Fungal complex (Colletotrichum, Exserohilum)", "Weakened immunity from other diseases"],
        "treatmentRecommendations": ["Cut and remove rotten portions of leaves", "Pour fungicidal solution into the terminal bud", "Apply foliar nutrients to boost recovery"],
        "preventionRecommendations": ["Manage root wilt disease proactively", "Ensure proper plantation sanitation"]
    },

    # ==========================================
    # CORN (MAIZE)
    # ==========================================
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": {
        "plantName": "Corn",
        "scientificName": "Zea mays",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Rectangular, pale brown or gray lesions restricted by veins", "Lesions merging to kill large leaf sections", "Stalk lodging in severe cases"],
        "possibleCauses": ["Fungal pathogen (Cercospora zeae-maydis)", "High humidity and warm temperatures"],
        "treatmentRecommendations": ["Apply foliar fungicide at tasseling stage if severity is high", "Harvest early to prevent stalk rot", "Remove infected debris"],
        "preventionRecommendations": ["Practice crop rotation away from corn for 1-2 years", "Use resistant corn hybrids"]
    },
    "Corn_(maize)___Common_rust_": {
        "plantName": "Corn",
        "scientificName": "Zea mays",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, elongated rust-colored pustules on both leaf surfaces", "Pustules turning black as they age", "Yellowing of surrounding leaf tissue"],
        "possibleCauses": ["Fungal pathogen (Puccinia sorghi)", "Cool temperatures and high humidity"],
        "treatmentRecommendations": ["Apply fungicide if detected early before silking", "Monitor disease progression closely", "Ensure adequate plant nutrition"],
        "preventionRecommendations": ["Plant rust-resistant hybrids", "Plant early to avoid peak spore periods"]
    },
    "Corn_(maize)___healthy": {
        "plantName": "Corn",
        "scientificName": "Zea mays",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Vibrant green, wide leaves", "Strong stalks", "No discoloration or pustules"],
        "possibleCauses": ["Optimal growing conditions", "Adequate nitrogen levels"],
        "treatmentRecommendations": ["None required", "Maintain standard watering", "Continue standard care"],
        "preventionRecommendations": ["Scout fields regularly for pests", "Maintain proper soil fertility"]
    },
    "Corn_(maize)___Northern_Leaf_Blight": {
        "plantName": "Corn",
        "scientificName": "Zea mays",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Large, cigar-shaped grayish-green to brown lesions", "Lesions appearing on lower leaves first", "Overall blighting of foliage"],
        "possibleCauses": ["Fungal pathogen (Exserohilum turcicum)", "Moderate temperatures with heavy dew"],
        "treatmentRecommendations": ["Apply fungicide during early silking if spread is rapid", "Manage crop residue post-harvest", "Monitor upper canopy closely"],
        "preventionRecommendations": ["Tillage to reduce crop residue", "Plant resistant varieties"]
    },

    # ==========================================
    # GRAPE
    # ==========================================
    "Grape___Black_rot": {
        "plantName": "Grape",
        "scientificName": "Vitis vinifera",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, tan, circular spots with dark borders on leaves", "Black fungal fruiting bodies (pycnidia) inside spots", "Grapes shriveling into hard, black mummies"],
        "possibleCauses": ["Fungal pathogen (Guignardia bidwellii)", "Warm, wet weather during spring foliage growth"],
        "treatmentRecommendations": ["Apply protective fungicides before and after bloom", "Remove all mummified berries from vines and ground", "Prune out infected canes"],
        "preventionRecommendations": ["Ensure open canopy for fast drying", "Practice strict winter sanitation"]
    },
    "Grape___Esca_(Black_Measles)": {
        "plantName": "Grape",
        "scientificName": "Vitis vinifera",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Tiger-stripe pattern of yellow/red and green on leaves", "Small dark spots on berries (measles)", "Sudden vine wilt or dieback"],
        "possibleCauses": ["Complex of wood-rotting fungi (Phaeoacremonium, Phaeomoniella)", "Infection entering through pruning wounds"],
        "treatmentRecommendations": ["Cut trunk back to healthy wood and retrain vine", "Remove and burn diseased vines", "Apply wound protectants immediately after pruning"],
        "preventionRecommendations": ["Delay pruning until late winter when wounds heal faster", "Sanitize pruning shears frequently"]
    },
    "Grape___healthy": {
        "plantName": "Grape",
        "scientificName": "Vitis vinifera",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Lobed, vibrant green leaves", "Healthy tendrils", "No spotting on foliage"],
        "possibleCauses": ["Optimal growing conditions", "Good vineyard management"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal irrigation"],
        "preventionRecommendations": ["Prune vines in winter to maintain structure", "Keep canopy open for sunlight"]
    },
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": {
        "plantName": "Grape",
        "scientificName": "Vitis vinifera",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Irregular reddish-brown lesions on leaves", "Dark borders around spots", "Premature defoliation in severe cases"],
        "possibleCauses": ["Fungal pathogen (Pseudocercospora vitis)", "Extended periods of high humidity"],
        "treatmentRecommendations": ["Apply copper or appropriate organic fungicides", "Remove fallen infected leaves", "Improve air circulation around vines"],
        "preventionRecommendations": ["Manage canopy density", "Avoid overhead irrigation"]
    },

    # ==========================================
    # MANGO
    # ==========================================
    "mango_Anthracnose": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Dark, irregular sunken spots on leaves and fruit", "Blossom blight causing flower drop", "Tear-stain patterns on fruit skin"],
        "possibleCauses": ["Fungal pathogen (Colletotrichum gloeosporioides)", "High humidity and rain during flowering"],
        "treatmentRecommendations": ["Apply fungicide during flowering and fruit set", "Remove infected plant debris", "Use hot water treatment for harvested fruit"],
        "preventionRecommendations": ["Space trees for adequate airflow", "Prune canopy to allow sunlight penetration"]
    },
    "mango_Bacterial Canker": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Raised, black, water-soaked star-shaped lesions on leaves", "Severe leaf drop", "Longitudinal cracking on fruit with oozing"],
        "possibleCauses": ["Bacterial pathogen (Xanthomonas campestris pv. mangiferaeindicae)", "Wind-driven rain spreading bacteria"],
        "treatmentRecommendations": ["Apply copper-based bactericides regularly", "Prune out and burn cankered branches", "Avoid harvesting during wet conditions"],
        "preventionRecommendations": ["Plant windbreaks around the orchard", "Sterilize tools between trees"]
    },
    "mango_Cutting Weevil": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Clean cuts on tender leaves", "Leaves dropping excessively", "Presence of small dark weevils on foliage"],
        "possibleCauses": ["Pest infestation (Deporaus marginatus)", "Flushes of new tender growth attracting pests"],
        "treatmentRecommendations": ["Apply appropriate contact insecticides during new flushes", "Collect and burn dropped leaves to destroy larvae", "Plough soil around tree base to expose pupae"],
        "preventionRecommendations": ["Monitor trees closely during flushing periods", "Encourage natural predators"]
    },
    "mango_Die Back": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Drying and browning of twigs from the tip downwards", "Leaves turn brown and fall off", "Dark lesions on stems and branches"],
        "possibleCauses": ["Fungal pathogen (Lasiodiplodia theobromae)", "Sun scald or extreme temperature fluctuations"],
        "treatmentRecommendations": ["Prune infected branches 3-4 inches below the visible rot", "Apply copper-based fungicides or Bordeaux mixture to pruned ends", "Ensure proper fertilization to strengthen the tree"],
        "preventionRecommendations": ["Disinfect pruning tools between cuts", "Avoid damaging the bark during harvesting"]
    },
    "mango_Gall Midge": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, raised blister-like galls on leaves", "Leaves curling and dropping", "Poor shoot growth"],
        "possibleCauses": ["Pest infestation (Procontarinia spp.)", "Humid, cloudy weather promoting midge emergence"],
        "treatmentRecommendations": ["Apply systemic insecticides during new leaf emergence", "Deep plough orchards to destroy pupating larvae in soil", "Remove severely galled leaves"],
        "preventionRecommendations": ["Avoid dense canopies", "Monitor and trap adult midges"]
    },
    "mango_Healthy": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Vibrant green, elongated leaves", "Smooth bark", "No signs of pest damage or spotting"],
        "possibleCauses": ["Optimal growing conditions", "Excellent orchard hygiene"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal fertilization"],
        "preventionRecommendations": ["Maintain annual pruning routine", "Scout regularly for early pest signs"]
    },
    "mango_Powdery Mildew": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["White, powdery fungal growth on panicles, flowers, and young leaves", "Dropping of unfertilized flowers", "Young fruit failure"],
        "possibleCauses": ["Fungal pathogen (Oidium mangiferae)", "Cool, dry weather following rain"],
        "treatmentRecommendations": ["Apply wettable sulfur or systemic fungicides at early bloom", "Repeat sprays at 10-15 day intervals", "Prune affected young shoots"],
        "preventionRecommendations": ["Ensure good sunlight penetration", "Avoid excessive nitrogen application before flowering"]
    },
    "mango_Sooty Mould": {
        "plantName": "Mango",
        "scientificName": "Mangifera indica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Black, velvety, soot-like coating on leaves and fruit", "Reduced photosynthesis and stunted growth", "Presence of honeydew-producing insects"],
        "possibleCauses": ["Fungal growth (Capnodium spp.) on insect honeydew", "Infestation of hoppers, aphids, or mealybugs"],
        "treatmentRecommendations": ["Treat the underlying insect infestation with insecticides", "Spray dilute starch solution which flakes off taking the mould with it", "Wash leaves with mild insecticidal soap"],
        "preventionRecommendations": ["Control sap-sucking insect populations", "Prune trees to reduce hiding spots for pests"]
    },

    # ==========================================
    # ORANGE / CITRUS
    # ==========================================
    "Orange___Haunglongbing_(Citrus_greening)": {
        "plantName": "Orange / Citrus",
        "scientificName": "Citrus sinensis",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Asymmetrical yellow mottling on leaves", "Lopsided, bitter, and green-bottomed fruit", "Severe twig dieback and stunted tree decline"],
        "possibleCauses": ["Bacterial pathogen (Candidatus Liberibacter asiaticus)", "Transmitted by Asian citrus psyllid"],
        "treatmentRecommendations": ["No cure exists; infected trees must be removed and destroyed", "Aggressively control psyllid populations with systemic insecticides", "Provide foliar nutrition to temporarily sustain infected trees"],
        "preventionRecommendations": ["Plant only certified disease-free trees", "Implement strict quarantine and psyllid management programs"]
    },

    # ==========================================
    # PAPAYA
    # ==========================================
    "papaya_Anthracnose": {
        "plantName": "Papaya",
        "scientificName": "Carica papaya",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, water-soaked spots on ripening fruit", "Spots enlarge into sunken, dark brown lesions", "Pinkish spore masses forming in the lesions"],
        "possibleCauses": ["Fungal pathogen (Colletotrichum gloeosporioides)", "High humidity and warm temperatures"],
        "treatmentRecommendations": ["Apply protective fungicides like chlorothalonil", "Harvest fruit promptly before over-ripening", "Submerge harvested fruit in hot water (48°C for 20 mins)"],
        "preventionRecommendations": ["Remove decaying leaves and fruit from the field", "Avoid wounding fruit during harvest"]
    },
    "papaya_BacterialSpot": {
        "plantName": "Papaya",
        "scientificName": "Carica papaya",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, water-soaked angular spots on leaves", "Spots turning necrotic and dark brown", "Lesions on fruit reducing market value"],
        "possibleCauses": ["Bacterial pathogen", "Splashing rain or overhead irrigation"],
        "treatmentRecommendations": ["Apply copper-based bactericides", "Remove heavily infected foliage", "Avoid working in the field when plants are wet"],
        "preventionRecommendations": ["Use drip irrigation", "Ensure proper plant spacing for airflow"]
    },
    "papaya_Curl leaf": {
        "plantName": "Papaya",
        "scientificName": "Carica papaya",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Severe downward curling and crinkling of leaves", "Thickened, brittle leaf veins", "Stunted plant growth and reduced fruit yield"],
        "possibleCauses": ["Papaya Leaf Curl Virus (PaLCuV)", "Transmitted by whiteflies"],
        "treatmentRecommendations": ["Uproot and burn infected plants immediately (no cure)", "Apply insecticides to control the whitefly vectors", "Use yellow sticky traps"],
        "preventionRecommendations": ["Eradicate weed hosts around the plantation", "Cover nursery seedlings with insect-proof nets"]
    },
    "papaya_Healthy": {
        "plantName": "Papaya",
        "scientificName": "Carica papaya",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Broad, deeply lobed green leaves", "Upright, sturdy trunk", "Healthy fruit development"],
        "possibleCauses": ["Optimal growing conditions", "Sufficient warmth and sunlight"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal irrigation"],
        "preventionRecommendations": ["Ensure well-draining soil to prevent root rot", "Apply balanced fertilizers"]
    },
    "papaya_RingSpot": {
        "plantName": "Papaya",
        "scientificName": "Carica papaya",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Yellow mottling and prominent vein-clearing on leaves", "Dark green, water-soaked rings on fruit skin", "Water-soaked streaks on the upper stem"],
        "possibleCauses": ["Papaya Ringspot Virus (PRSV)", "Transmitted rapidly by aphids"],
        "treatmentRecommendations": ["Remove and destroy infected plants immediately (no cure)", "Do not move infected fruit or plant material", "Apply aphicides, though transmission is often too fast to stop"],
        "preventionRecommendations": ["Plant genetically modified PRSV-resistant varieties", "Maintain strict aphid control measures"]
    },

    # ==========================================
    # PEACH
    # ==========================================
    "Peach___Bacterial_spot": {
        "plantName": "Peach",
        "scientificName": "Prunus persica",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, angular, purple-black spots on leaves", "Centers of spots fall out causing 'shot-hole' appearance", "Deep, pitted dark lesions on fruit"],
        "possibleCauses": ["Bacterial pathogen (Xanthomonas campestris pv. pruni)", "Warm, wet, and windy conditions"],
        "treatmentRecommendations": ["Apply copper sprays during dormancy", "Apply oxytetracycline during the growing season", "Maintain vigorous tree health to outgrow damage"],
        "preventionRecommendations": ["Plant highly resistant peach varieties", "Avoid planting near infected orchards"]
    },
    "Peach___healthy": {
        "plantName": "Peach",
        "scientificName": "Prunus persica",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Long, narrow, vibrant green leaves", "Smooth bark", "No signs of shot-holes or spots"],
        "possibleCauses": ["Optimal growing conditions", "Good orchard management"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue regular watering"],
        "preventionRecommendations": ["Apply dormant sprays to prevent seasonal curl", "Prune for an open-center canopy"]
    },

    # ==========================================
    # BELL PEPPER
    # ==========================================
    "Pepper,_bell___Bacterial_spot": {
        "plantName": "Bell Pepper",
        "scientificName": "Capsicum annuum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, water-soaked spots turning dark brown", "Yellow halos forming around the spots", "Severe defoliation leaving fruit exposed to sunscald"],
        "possibleCauses": ["Bacterial pathogen (Xanthomonas campestris pv. vesicatoria)", "Splashing water from soil during rain or overhead watering"],
        "treatmentRecommendations": ["Apply copper-based bactericides combined with mancozeb", "Remove heavily infected plants to stop spread", "Ensure good weed management"],
        "preventionRecommendations": ["Use drip irrigation instead of overhead", "Rotate crops away from nightshades for 2 years"]
    },
    "Pepper,_bell___healthy": {
        "plantName": "Bell Pepper",
        "scientificName": "Capsicum annuum",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Vibrant green, smooth leaves", "Strong stem", "No discoloration or wilting"],
        "possibleCauses": ["Optimal growing conditions", "Proper soil moisture"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal irrigation"],
        "preventionRecommendations": ["Ensure well-draining soil", "Stake plants as they bear fruit"]
    },

    # ==========================================
    # POTATO
    # ==========================================
    "Potato___Early_blight": {
        "plantName": "Potato",
        "scientificName": "Solanum tuberosum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Dark brown spots with concentric 'target' rings", "Yellowing of tissue around the lesions", "Lower, older leaves affected first"],
        "possibleCauses": ["Fungal pathogen (Alternaria solani)", "Plant stress from poor nutrition or drought"],
        "treatmentRecommendations": ["Apply targeted fungicide sprays (e.g., chlorothalonil)", "Ensure proper plant nutrition and watering to reduce stress", "Destroy infected vines after harvest"],
        "preventionRecommendations": ["Practice 3-year crop rotation", "Avoid overhead irrigation"]
    },
    "Potato___healthy": {
        "plantName": "Potato",
        "scientificName": "Solanum tuberosum",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Compound leaves with uniform green leaflets", "Vigorous upright growth", "No spots or yellowing"],
        "possibleCauses": ["Optimal growing conditions", "Quality seed potatoes used"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal irrigation"],
        "preventionRecommendations": ["Hill soil around base as plant grows", "Monitor for Colorado potato beetles"]
    },
    "Potato___Late_blight": {
        "plantName": "Potato",
        "scientificName": "Solanum tuberosum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Water-soaked, dark green to brown lesions", "Fuzzy white mold on leaf undersides in humid conditions", "Rapid defoliation and tuber rot"],
        "possibleCauses": ["Oomycete pathogen (Phytophthora infestans)", "Cool, moist, and humid weather"],
        "treatmentRecommendations": ["Apply systemic fungicide immediately (highly contagious)", "Destroy and bury severely infected plants", "Desiccate vines before harvest to protect tubers"],
        "preventionRecommendations": ["Use certified disease-free seed potatoes", "Eliminate volunteer potatoes from previous years"]
    },

    # ==========================================
    # RASPBERRY
    # ==========================================
    "Raspberry___healthy": {
        "plantName": "Raspberry",
        "scientificName": "Rubus idaeus",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Compound leaves with healthy green texture", "Vigorous cane growth", "No rust or spotting"],
        "possibleCauses": ["Optimal growing conditions", "Proper cane management"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal irrigation"],
        "preventionRecommendations": ["Thin out old canes after fruiting", "Maintain good trellis support"]
    },

    # ==========================================
    # RICE
    # ==========================================
    "rice_Bacterial leaf blight": {
        "plantName": "Rice",
        "scientificName": "Oryza sativa",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Water-soaked stripes along the leaf blades", "Leaves turn yellow-white and dry out", "Milky bacterial ooze on young lesions early in the morning"],
        "possibleCauses": ["Bacterial pathogen (Xanthomonas oryzae pv. oryzae)", "Typhoons, heavy rains, and deep flooding"],
        "treatmentRecommendations": ["Drain the field to reduce humidity", "Apply copper-based chemicals (limited efficacy)", "Avoid applying excess nitrogen which fuels the disease"],
        "preventionRecommendations": ["Use highly resistant rice varieties", "Ensure balanced fertilizer application"]
    },
    "rice_Brown spot": {
        "plantName": "Rice",
        "scientificName": "Oryza sativa",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, oval, dark brown spots on leaves", "Spots develop a gray center with a yellow halo", "Black discoloration on grains"],
        "possibleCauses": ["Fungal pathogen (Bipolaris oryzae)", "Nutrient-deficient soils (often called 'poor crop disease')"],
        "treatmentRecommendations": ["Apply seed treatments before planting", "Apply foliar fungicides during booting and heading stages", "Improve soil fertility (add nitrogen and potassium)"],
        "preventionRecommendations": ["Perform soil testing and correct deficiencies", "Use healthy, certified seeds"]
    },
    "rice_healthy": {
        "plantName": "Rice",
        "scientificName": "Oryza sativa",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Upright, bright green foliage", "Healthy, vigorous tillers", "Clean panicles"],
        "possibleCauses": ["Optimal growing conditions", "Good water management"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Monitor water levels"],
        "preventionRecommendations": ["Maintain weed control", "Apply fertilizer at correct growth stages"]
    },
    "rice_Leaf smut": {
        "plantName": "Rice",
        "scientificName": "Oryza sativa",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, black, slightly raised spots (smut sori) on leaves", "Spots heavily concentrated on older leaves", "Leaves turning yellow and dying prematurely"],
        "possibleCauses": ["Fungal pathogen (Entyloma oryzae)", "High humidity and dense canopy"],
        "treatmentRecommendations": ["Apply appropriate fungicides if infection is severe", "Improve canopy airflow", "Generally causes minor yield loss; treatment often not required"],
        "preventionRecommendations": ["Avoid excessive nitrogen rates", "Practice good field sanitation"]
    },

    # ==========================================
    # SOYBEAN
    # ==========================================
    "Soybean___healthy": {
        "plantName": "Soybean",
        "scientificName": "Glycine max",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Broad, trifoliate green leaves", "Upright stems", "No chlorosis or spotting"],
        "possibleCauses": ["Optimal growing conditions", "Good soil inoculation"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal irrigation"],
        "preventionRecommendations": ["Maintain adequate soil moisture", "Scout for aphids regularly"]
    },

    # ==========================================
    # SQUASH
    # ==========================================
    "Squash___Powdery_mildew": {
        "plantName": "Squash",
        "scientificName": "Cucurbita",
        "healthStatus": "Infected",
        "visibleSymptoms": ["White, powdery fungal growth on upper leaf surfaces", "Leaves turning yellow and dying", "Reduced fruit quality and yield"],
        "possibleCauses": ["Fungal pathogen (Podosphaera xanthii)", "High humidity with poor airflow and warm temperatures"],
        "treatmentRecommendations": ["Apply sulfur, potassium bicarbonate, or neem oil sprays", "Remove severely infected foliage", "Apply targeted fungicides early in the infection"],
        "preventionRecommendations": ["Space plants generously for airflow", "Water at the base to keep leaves dry"]
    },

    # ==========================================
    # STRAWBERRY
    # ==========================================
    "Strawberry___healthy": {
        "plantName": "Strawberry",
        "scientificName": "Fragaria × ananassa",
        "healthStatus": "Healthy",
        "visibleSymptoms": ["Trifoliate leaves with deep green color", "Healthy crown", "No scorch or spotting"],
        "possibleCauses": ["Optimal growing conditions", "Good soil drainage"],
        "treatmentRecommendations": ["None required", "Maintain standard care", "Continue normal irrigation"],
        "preventionRecommendations": ["Keep runners trimmed", "Maintain straw mulch around base"]
    },
    "Strawberry___Leaf_scorch": {
        "plantName": "Strawberry",
        "scientificName": "Fragaria × ananassa",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Irregular purple-to-brown spots on upper leaf surface", "Spots lacking a light center (unlike leaf spot)", "Leaves curling and looking 'scorched' or burned"],
        "possibleCauses": ["Fungal pathogen (Diplocarpon earlianum)", "Frequent rain and heavy dew"],
        "treatmentRecommendations": ["Apply protective fungicides starting in early spring", "Remove and destroy infected leaves", "Renovate beds immediately after harvest"],
        "preventionRecommendations": ["Keep beds weed-free to improve drying", "Avoid overhead watering"]
    },

    # ==========================================
    # TOMATO
    # ==========================================
    "Tomato___Bacterial_spot": {
        "plantName": "Tomato",
        "scientificName": "Solanum lycopersicum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, water-soaked, greasy spots on leaves", "Spots turn dark brown to black", "Scabby, dark lesions on fruit"],
        "possibleCauses": ["Bacterial pathogen (Xanthomonas)", "Wet foliage and high temperatures"],
        "treatmentRecommendations": ["Apply copper sprays (preventative, not a cure)", "Remove severely infected plants", "Avoid working with wet plants"],
        "preventionRecommendations": ["Use disease-free, treated seed", "Rotate crops regularly"]
    },
    "Tomato___Early_blight": {
        "plantName": "Tomato",
        "scientificName": "Solanum lycopersicum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Brown or black spots with concentric rings", "Yellowing around the lesions", "Lower leaves affected first and falling off"],
        "possibleCauses": ["Fungal pathogen (Alternaria solani)", "Warm, humid conditions"],
        "treatmentRecommendations": ["Apply copper-based or chemical fungicides", "Remove infected lower leaves", "Apply mulch to stop soil splashing"],
        "preventionRecommendations": ["Space plants for airflow", "Avoid overhead watering"]
    },
    "Tomato___Late_blight": {
        "plantName": "Tomato",
        "scientificName": "Solanum lycopersicum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Large, dark, water-soaked lesions on leaves", "Fuzzy white mold on leaf undersides", "Hard, brown, greasy-looking spots on fruit"],
        "possibleCauses": ["Oomycete pathogen (Phytophthora infestans)", "Cool, wet, and highly humid weather"],
        "treatmentRecommendations": ["Apply fungicide immediately (highly destructive)", "Destroy severely infected plants in sealed bags", "Do not compost infected material"],
        "preventionRecommendations": ["Destroy volunteer tomato and potato plants", "Ensure excellent sun exposure"]
    },
    "Tomato___Leaf_Mold": {
        "plantName": "Tomato",
        "scientificName": "Solanum lycopersicum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Pale greenish-yellow spots on upper leaf surfaces", "Olive-green to gray velvet mold on undersides", "Leaves curling, withering, and dropping"],
        "possibleCauses": ["Fungal pathogen (Passalora fulva)", "High humidity environments, especially in greenhouses"],
        "treatmentRecommendations": ["Apply appropriate fungicide at first sign", "Improve ventilation significantly", "Remove heavily infected lower leaves"],
        "preventionRecommendations": ["Keep relative humidity below 85%", "Space plants generously and prune suckers"]
    },
    "Tomato___Septoria_leaf_spot": {
        "plantName": "Tomato",
        "scientificName": "Solanum lycopersicum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Small, circular spots with dark borders and gray centers", "Tiny black specks (pycnidia) inside spots", "Starts on lower leaves and moves up"],
        "possibleCauses": ["Fungal pathogen (Septoria lycopersici)", "Splashing water spreading spores from the soil"],
        "treatmentRecommendations": ["Apply fungicidal sprays (chlorothalonil or copper)", "Remove heavily spotted leaves", "Avoid wetting foliage during watering"],
        "preventionRecommendations": ["Mulch around base to prevent soil splash", "Stake or cage plants to keep them off the ground"]
    },
    "Tomato___Spider_mites Two-spotted_spider_mite": {
        "plantName": "Tomato",
        "scientificName": "Solanum lycopersicum",
        "healthStatus": "Infected",
        "visibleSymptoms": ["Tiny yellow or white speckling/stippling on leaves", "Fine webbing visible under leaves or on stems", "Leaves turning bronze and drying out"],
        "possibleCauses": ["Pest infestation (Tetranychus urticae)", "Hot, dry, and dusty conditions"],
        "treatmentRecommendations": ["Apply insecticidal soap or neem oil", "Spray foliage heavily with water to dislodge mites", "Release predatory mites (Phytoseiulus persimilis)"],
        "preventionRecommendations": ["Keep plants well-watered", "Reduce dust around the garden area"]
    }
}