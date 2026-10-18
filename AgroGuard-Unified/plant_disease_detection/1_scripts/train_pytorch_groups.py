import json
import time
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from tqdm import tqdm

# =====================================================================
# CONFIGURATION (TUNED FOR LIMITED HARDWARE)
# =====================================================================
PROJECT_ROOT = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\YOLO_plant_disease_detection\plants_datasets")
OUTPUT_MODELS_DIR = Path(r"C:\Users\Thant Zin Moe\Desktop\Gintama\Ai-Youth_Festa_2026\YOLO_plant_disease_detection")

IMG_SIZE = 224          # 224x224 is standard for MobileNetV3 (very fast & low VRAM)
BATCH_SIZE = 32         # Lower to 16 if you get CUDA Out of Memory
EPOCHS = 25             # Max epochs per group
PATIENCE = 5            # Stop early if val accuracy doesn't improve for 5 epochs
LEARNING_RATE = 1e-3
NUM_WORKERS = 2         # Set to 0 if Windows throws a multiprocessing error
# =====================================================================


def get_dataloaders(group_dir: Path):
    train_transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.2),
        transforms.RandomRotation(20),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    eval_transform = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    train_ds = datasets.ImageFolder(group_dir / "train", transform=train_transform)
    val_ds = datasets.ImageFolder(group_dir / "val", transform=eval_transform)
    test_ds = datasets.ImageFolder(group_dir / "test", transform=eval_transform)

    # Compute inverse class frequency weights to handle imbalanced classes
    class_counts = np.bincount(train_ds.targets)
    total_samples = len(train_ds.targets)
    class_weights = total_samples / (len(train_ds.classes) * np.maximum(class_counts, 1))
    class_weights_tensor = torch.FloatTensor(class_weights)

    pin = torch.cuda.is_available()
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, pin_memory=pin)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS, pin_memory=pin)
    test_loader = DataLoader(test_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS, pin_memory=pin)

    return train_loader, val_loader, test_loader, train_ds.classes, class_weights_tensor


def build_model(num_classes: int):
    # MobileNetV3-Large: fast, accurate, ~5.4M parameters
    model = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.DEFAULT)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    return model


def evaluate(model, loader, criterion, device):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)
            running_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

    return running_loss / max(1, total), (correct / max(1, total)) * 100.0


def train_single_group(group_dir: Path, device: torch.device):
    group_name = group_dir.name
    save_dir = OUTPUT_MODELS_DIR / group_name
    save_dir.mkdir(parents=True, exist_ok=True)

    # Skip if already trained
    best_pth_path = save_dir / "best_model.pth"
    if best_pth_path.exists():
        print(f"\n[SKIP] {group_name} already has 'best_model.pth'. Delete it if you want to retrain.")
        return

    print(f"\n=======================================================")
    print(f"TRAINING: {group_name}")
    print(f"=======================================================")

    train_loader, val_loader, test_loader, class_names, class_weights = get_dataloaders(group_dir)
    num_classes = len(class_names)
    print(f"Classes: {num_classes} | Train imgs: {len(train_loader.dataset)} | Val imgs: {len(val_loader.dataset)}")

    # Save class index mapping for inference
    with open(save_dir / "class_names.json", "w", encoding="utf-8") as f:
        json.dump(class_names, f, indent=2)

    model = build_model(num_classes).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights.to(device))
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

    use_amp = device.type == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    best_val_acc = 0.0
    epochs_no_improve = 0

    for epoch in range(1, EPOCHS + 1):
        start_t = time.time()
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for images, labels in tqdm(train_loader, desc=f"Epoch {epoch}/{EPOCHS}", leave=False):
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()

            with torch.amp.autocast("cuda", enabled=use_amp):
                outputs = model(images)
                loss = criterion(outputs, labels)

            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()

            train_loss += loss.item() * images.size(0)
            _, preds = torch.max(outputs, 1)
            train_correct += (preds == labels).sum().item()
            train_total += labels.size(0)

        scheduler.step()
        train_loss /= max(1, train_total)
        train_acc = (train_correct / max(1, train_total)) * 100.0

        val_loss, val_acc = evaluate(model, val_loader, criterion, device)
        elapsed = time.time() - start_t

        print(f"  Epoch {epoch:02d}/{EPOCHS:02d} ({elapsed:.0f}s) | "
              f"Train Loss: {train_loss:.4f} Acc: {train_acc:.2f}% | "
              f"Val Loss: {val_loss:.4f} Acc: {val_acc:.2f}%")

        # Save best checkpoint
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            epochs_no_improve = 0
            torch.save(model.state_dict(), best_pth_path)
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= PATIENCE:
                print(f"  -> Early stopping triggered at epoch {epoch} (Best Val Acc: {best_val_acc:.2f}%)")
                break

    # Final evaluation on unseen test set
    model.load_state_dict(torch.load(best_pth_path, map_location=device, weights_only=True))
    _, test_acc = evaluate(model, test_loader, criterion, device)
    print(f"--> [{group_name}] FINAL TEST ACCURACY: {test_acc:.2f}%")

    # Export lightweight ONNX model for production/mobile deployment
    model.eval()
    dummy_input = torch.randn(1, 3, IMG_SIZE, IMG_SIZE, device=device)
    onnx_path = save_dir / "model.onnx"
    torch.onnx.export(
        model, dummy_input, str(onnx_path),
        input_names=["input"], output_names=["logits"],
        dynamic_axes={"input": {0: "batch_size"}, "logits": {0: "batch_size"}},
        opset_version=17
    )
    print(f"--> Saved weights & ONNX model to: {save_dir}")

    # Free GPU memory before starting the next group
    del model
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}" + (f" ({torch.cuda.get_device_name(0)})" if device.type == "cuda" else ""))

    group_dirs = sorted([d for d in PROJECT_ROOT.iterdir() if d.is_dir() and d.name.startswith("Group_")])
    for g_dir in group_dirs:
        train_single_group(g_dir, device)

    print("\nALL 5 GROUP MODELS TRAINED AND EXPORTED!")


if __name__ == "__main__":
    main()