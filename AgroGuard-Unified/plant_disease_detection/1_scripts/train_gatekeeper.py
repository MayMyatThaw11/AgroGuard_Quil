import os
import glob
import torch
import joblib
from PIL import Image
from torchvision import transforms
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights
from sklearn.ensemble import IsolationForest

def train():
    print("1. Loading Feature Extractor...")
    # Load lightweight MobileNetV2 and remove the classification head
    extractor = mobilenet_v2(weights=MobileNet_V2_Weights.DEFAULT)
    extractor.classifier = torch.nn.Identity() 
    extractor.eval()

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    print("2. Scanning Dataset...")
    # Point this to your detector's training images folder
    # Adjust this path if your images are located elsewhere!
    image_paths = glob.glob("dataset/detection_dataset/train/images/*.jpg")
    
    if not image_paths:
        print("ERROR: No images found. Check the path!")
        return

    print(f"Found {len(image_paths)} images. Extracting features...")
    features = []

    for i, path in enumerate(image_paths):
        try:
            img = Image.open(path).convert("RGB")
            tensor = transform(img).unsqueeze(0)
            
            with torch.no_grad():
                feat = extractor(tensor).numpy().flatten()
                features.append(feat)
                
            if (i + 1) % 500 == 0:
                print(f"Processed {i + 1} images...")
        except Exception as e:
            print(f"Skipped {path}: {e}")

    print("3. Training Unsupervised Isolation Forest...")
    iso_forest = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    iso_forest.fit(features)

    print("4. Saving Gatekeeper Model...")
    # Find the exact absolute path of the folder this script is sitting in
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    
    # Mathematically construct the exact target folder path
    save_dir = os.path.join(BASE_DIR, "app", "ml", "weights")
    save_path = os.path.join(save_dir, "gatekeeper.joblib")
    
    # Create the folder and save the file
    os.makedirs(save_dir, exist_ok=True)
    joblib.dump(iso_forest, save_path)
    
    print(f"Success! Model securely saved to: {save_path}")

if __name__ == "__main__":
    train()