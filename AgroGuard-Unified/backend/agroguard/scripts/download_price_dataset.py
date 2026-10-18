import io
import zipfile
import requests
import pandas as pd

# Official FAOSTAT Bulk Server URLs for Producer Prices (Asia Region)
FAO_ASIA_BULK_URLS = [
    "https://bulks-faostat.fao.org/production/Prices_E_Asia.zip",
    "https://fenixservices.fao.org/faostat/static/bulkdownloads/Prices_E_Asia.zip",
]

ASEAN_COUNTRIES = [
    "Myanmar", "Thailand", "Viet Nam", "Indonesia", "Malaysia",
    "Philippines", "Cambodia", "Lao People's Democratic Republic",
    "Brunei Darussalam", "Singapore"
]

FAO_ITEM_TO_TOP50 = {
    "Rice": "Rice (Paddy)",
    "Rice, paddy": "Rice (Paddy)",
    "Maize (corn)": "Maize (Corn)",
    "Sorghum": "Sorghum",
    "Beans, dry": "Black Gram (Matpe)",
    "Pigeon peas, dry": "Pigeon Pea (Toor)",
    "Chick peas, dry": "Chickpea",
    "Soya beans": "Soybean",
    "Cow peas, dry": "Cowpea",
    "Sesame seed": "Sesame",
    "Groundnuts, excluding shelled": "Groundnut (Peanut)",
    "Sunflower seed": "Sunflower",
    "Mustard seed": "Mustard Seed",
    "Castor oil seeds": "Castor Bean",
    "Oil palm fruit": "Oil Palm",
    "Natural rubber in primary forms": "Rubber",
    "Coconuts, in shell": "Coconut",
    "Sugar cane": "Sugarcane",
    "Seed cotton, unginned": "Cotton",
    "Jute, raw or retted": "Jute",
    "Coffee, green": "Coffee (Robusta)",
    "Tea leaves": "Tea",
    "Cassava, fresh": "Cassava (Tapioca)",
    "Sweet potatoes": "Sweet Potato",
    "Potatoes": "Potato",
    "Taro": "Taro",
    "Mangoes, guavas and mangosteens": "Mango",
    "Bananas": "Banana",
    "Papayas": "Papaya",
    "Pineapples": "Pineapple",
    "Pomelos and grapefruits": "Pomelo",
    "Avocados": "Avocado",
    "Watermelons": "Watermelon",
    "Chillies and peppers, dry (Capsicum spp., Pimenta spp.), raw": "Chili Pepper",
    "Ginger, raw": "Ginger",
    "Pepper (Piper spp.), raw": "Black Pepper",
    "Areca nuts": "Betel Nut (Areca)",
    "Cocoa beans": "Cacao (Cocoa)",
    "Onions and shallots, dry (excluding dehydrated)": "Onion",
    "Garlic, green": "Garlic",
    "Tomatoes": "Tomato",
    "Cabbages": "Cabbage",
}


def download_and_create_faostat_asean_csv(output_csv: str = "../app/data/FAOSTAT_ASEAN_Historical_Prices.csv"):
    zip_bytes = None
    headers = {"User-Agent": "Mozilla/5.0"}

    # 1. Download Prices_E_Asia.zip from FAOSTAT Bulk Server
    for url in FAO_ASIA_BULK_URLS:
        try:
            print(f"Downloading from FAOSTAT: {url} ...")
            resp = requests.get(url, headers=headers, timeout=120)
            if resp.status_code == 200:
                zip_bytes = io.BytesIO(resp.content)
                print("Download complete!")
                break
        except Exception as e:
            print(f"Mirror failed ({e}), trying backup URL...")

    if zip_bytes is None:
        raise RuntimeError("Could not reach FAOSTAT server. Use Option 2 (Manual Browser Download).")

    # 2. Find the main CSV inside the ZIP archive
    with zipfile.ZipFile(zip_bytes) as z:
        csv_files = [
            f for f in z.namelist()
            if f.endswith(".csv") and "NOFLAG" in f.upper()
        ] or [
            f for f in z.namelist()
            if f.endswith(".csv") and "FLAGS" not in f.upper() and "ITEM" not in f.upper() and "AREA" not in f.upper()
        ]
        target_csv = csv_files[0]
        print(f"Extracting '{target_csv}' from ZIP...")
        with z.open(target_csv) as f:
            df = pd.read_csv(f, encoding="latin1", low_memory=False)

    # 3. Filter for ASEAN Countries, USD/tonne, and Top 50 Crops
    asean_df = df[
        (df["Area"].isin(ASEAN_COUNTRIES)) &
        (df["Element"] == "Producer Price (USD/tonne)") &
        (df["Item"].isin(FAO_ITEM_TO_TOP50.keys()))
    ].copy()

    asean_df["crop_name_en"] = asean_df["Item"].map(FAO_ITEM_TO_TOP50)

    # 4. Handle either Wide Format (Y2018..Y2025) or Normalized Format (Year, Value)
    if "Year" in asean_df.columns and "Value" in asean_df.columns:
        if "Months" in asean_df.columns:
            asean_df = asean_df[asean_df["Months"].astype(str).str.contains("Annual", case=False, na=True)]
        asean_df["Year_Col"] = "Y" + asean_df["Year"].astype(str).str.strip()
        asean_df["Value"] = pd.to_numeric(asean_df["Value"], errors="coerce")
        asean_df = (
            asean_df.pivot_table(
                index=["Area", "crop_name_en", "Item"],
                columns="Year_Col",
                values="Value",
                aggfunc="median"
            )
            .reset_index()
        )

    year_cols = sorted([c for c in asean_df.columns if c.startswith("Y20") and len(c) == 5])
    for col in year_cols:
        asean_df[col] = pd.to_numeric(asean_df[col], errors="coerce")

    asean_df["median_usd_per_tonne"] = asean_df[year_cols].median(axis=1).round(2)

    out_df = (
        asean_df[["Area", "crop_name_en", "Item", "median_usd_per_tonne"] + year_cols]
        .dropna(subset=["median_usd_per_tonne"])
        .sort_values(["crop_name_en", "Area"])
        .reset_index(drop=True)
    )

    out_df.to_csv(output_csv, index=False, encoding="utf-8-sig")
    print(f"Success! Saved '{output_csv}' with {len(out_df)} ASEAN country-crop records.")
    return out_df


if __name__ == "__main__":
    download_and_create_faostat_asean_csv()