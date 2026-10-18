import os
import posixpath
import requests
from collections import defaultdict
from pathlib import Path
from remotezip import RemoteZip
from tqdm import tqdm

# =====================================================================
# 1. CONFIGURATION
# =====================================================================
# Your new Kaggle KGAT_ token:
KAGGLE_API_TOKEN = "KGAT_3e4ed54e6627b30a9540dec2b72318bd"

# Everything after 'kaggle.com/datasets/' in the URL (owner/dataset-name):
DATASET_SLUG = "abhisheksubhashswami/fruits-and-vegetables"

# Where the downloaded folder will be saved on your PC:
OUTPUT_DIR = Path(
    r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\dataset\Crops"
)
# =====================================================================


def load_token() -> str:
    """Loads the KGAT_ token from the script, environment variable, or ~/.kaggle/access_token."""
    if KAGGLE_API_TOKEN and KAGGLE_API_TOKEN.startswith("KGAT_"):
        return KAGGLE_API_TOKEN.strip()

    env_token = os.environ.get("KAGGLE_API_TOKEN", "").strip()
    if env_token:
        return env_token

    token_file = Path.home() / ".kaggle" / "access_token"
    if token_file.exists():
        return token_file.read_text(encoding="utf-8").strip()

    raise ValueError("No valid KGAT_ token found! Paste it into KAGGLE_API_TOKEN at the top of the script.")


def get_signed_zip_url(dataset_slug: str, token: str) -> str:
    """Authenticates with Kaggle using the KGAT_ Bearer token and gets the Google Cloud Storage zip URL."""
    api_url = f"https://www.kaggle.com/api/v1/datasets/download/{dataset_slug}"
    headers = {"Authorization": f"Bearer {token}"}

    print(f"Connecting to Kaggle dataset: {dataset_slug} ...")
    response = requests.get(api_url, headers=headers, stream=True, allow_redirects=True)

    if response.status_code in (401, 403):
        response.close()
        raise PermissionError(
            f"Authentication failed (HTTP {response.status_code})! "
            "Check that your KGAT_ token is active and DATASET_SLUG is correct."
        )
    response.raise_for_status()

    signed_url = response.url
    response.close()  # Close immediately so we don't download the entire archive
    return signed_url


def interactive_subfolder_download():
    token = load_token()
    signed_url = get_signed_zip_url(DATASET_SLUG, token)

    print("Reading remote .zip folder index (takes 2-5 seconds)...")
    with RemoteZip(signed_url) as zf:
        all_files = [f for f in zf.namelist() if not f.endswith("/")]

        # Group files by their parent folder inside the zip
        folder_map = defaultdict(list)
        for file_path in all_files:
            parent_folder = posixpath.dirname(file_path)
            if not parent_folder:
                parent_folder = "(root)"
            folder_map[parent_folder].append(file_path)

        sorted_folders = sorted(folder_map.keys())

        print("\n=== Available Folders Inside Kaggle Dataset ===")
        for idx, folder in enumerate(sorted_folders):
            print(f"  [{idx}] {folder}  ({len(folder_map[folder])} files)")

        print("\nTip: Enter one number (e.g. 5) or multiple numbers separated by commas (e.g. 2, 5, 8).")
        selection = input("Enter the folder number(s) you want to download: ").strip()

        selected_indices = [int(x.strip()) for x in selection.split(",") if x.strip().isdigit()]
        if not selected_indices:
            print("No valid folder numbers selected. Exiting.")
            return

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        for idx in selected_indices:
            if idx < 0 or idx >= len(sorted_folders):
                print(f"Skipping invalid index: {idx}")
                continue

            chosen_folder = sorted_folders[idx]
            files_to_download = folder_map[chosen_folder]
            folder_leaf_name = posixpath.basename(chosen_folder) if chosen_folder != "(root)" else "root_files"
            target_subfolder = OUTPUT_DIR / folder_leaf_name
            target_subfolder.mkdir(parents=True, exist_ok=True)

            print(f"\nDownloading '{chosen_folder}' ({len(files_to_download)} files) to {target_subfolder} ...")
            for member in tqdm(files_to_download, desc=folder_leaf_name):
                filename = posixpath.basename(member)
                dest_path = target_subfolder / filename

                # Skip if already downloaded
                if dest_path.exists() and dest_path.stat().st_size > 0:
                    continue

                with zf.open(member) as src, open(dest_path, "wb") as dst:
                    dst.write(src.read())

    print(f"\nAll selected folders downloaded to: {OUTPUT_DIR}")


if __name__ == "__main__":
    interactive_subfolder_download()