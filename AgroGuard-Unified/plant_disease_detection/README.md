@'
# AgroGuard — Modular ASEAN Plant Disease Detection System

**AgroGuard (Farm Intelligence)** is an end-to-end AI plant pathology and crop health diagnostic platform built for Southeast Asian and ASEAN agriculture. The system uses a hardware-efficient **5-Group Modular Neural Network Architecture** (supporting Ultralytics YOLO11-cls and PyTorch MobileNetV3-Large) connected to a FastAPI backend and a bilingual (English / Burmese မြန်မာ) React frontend.

---

## Key Features

- **5-Group Modular AI Architecture:** Divides 25 high-value ASEAN crops (82+ disease and healthy classes) into 5 specialized models to maximize classification accuracy and minimize GPU/RAM overhead on consumer hardware.
- **Dual Organ Support (Leaf & Fruit Split):** Supports specialized leaf and fruit disease classification for fruiting crops such as Mango, Tomato, and Pepper/Chili, alongside foliar, stem, and pod diagnostics for plantation and staple crops.
- **Non-Plant Background Rejection (Not_A_Plant):** Includes a dedicated background rejection class in every group model to filter out blurry, out-of-focus, or non-plant photos before generating a diagnosis.
- **Interactive Group Selection Guide:** Displays a first-time startup guide modal and a persistent "Group Selection Guide" button on the UI so farmers can search or click their crop to select the right model group automatically.
- **Full Bilingual Support (English & Burmese / မြန်မာ):** Built-in localization via LanguageContext.jsx translates all UI workflows, plant groups, crop names, severity metrics, visible symptoms, causes, and treatment recommendations between English and Burmese instantly.
- **Agronomic Health Scoring & Actionable Advice:** Generates a 0-100 plant health score, scientific crop name, confidence percentage, disease severity, affected area estimate, and structured treatment/prevention steps.

---

## Supported Plant Groups & Crops

| Group ID | Group Name | Included Crops |
| :--- | :--- | :--- |
| **Group_1_Grains_Legumes_Oilseeds** | Grains, Legumes & Oilseeds | Rice, Corn (Maize), Soybean, Peanut (Groundnut), Sesame |
| **Group_2_Palms_Industrial_Trees** | Palms, Industrial Trees & Vines | Coconut, Oil Palm, Rubber, Cashew, Black Pepper |
| **Group_3_Beverage_Sugar_Root_Crops** | Beverage, Sugar & Root Crops | Cassava, Coffee, Sugarcane, Tea, Cacao |
| **Group_4_Orchard_Tree_Fruits** | Orchard & Tree Fruits | Banana, Durian, Mango (Leaf & Fruit), Papaya, Dragon Fruit |
| **Group_5_Vegetables_Vine_Fruits** | Vegetables & Vine Fruits | Tomato (Leaf & Fruit), Pepper / Chili (Leaf & Fruit), Eggplant, Pineapple, Watermelon |

---

## How to Run the Project (Step-by-Step)

### Part 1: Backend Setup & Virtual Environment (yolo-env)

#### 1. Open Terminal in the Backend Directory
Navigate to the `YOLO_plant_disease_detection` project root folder:
```powershell
cd "<path-to-your-project>\YOLO_plant_disease_detection"

2. Create the virtual environment (if not created yet):
   python -m venv .venv

3. Activate the virtual environment:
   - Windows PowerShell: .\.venv\Scripts\Activate.ps1
   - Windows CMD: .venv\Scripts\activate.bat
   - macOS / Linux: source yolo-env/bin/activate

4. Install Python dependencies:
   pip install --upgrade pip
   pip install -r requirements.txt

5. Start the FastAPI server:
   uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

   - API Server: http://localhost:8001
   - Swagger UI Docs: http://localhost:8001/docs
   - Health Check: http://localhost:8001/api/v1/health

---

### Part 2: Frontend Setup (React + Vite)

1. Install dependencies:
   npm install

2. Start the frontend development server:
   npm run dev
'@ | Set-Content -Path "README.md" -Encoding UTF8
Write-Host "README.md created successfully in $(Get-Location)\README.md!" -ForegroundColor Green