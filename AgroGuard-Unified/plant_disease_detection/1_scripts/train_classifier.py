from ultralytics import YOLO

# Load a pre-trained YOLO Nano classification model
if __name__ == '__main__':
    model = YOLO("yolo11n-cls.pt") 

    # Train the model
    results = model.train(
        data="dataset/classification_dataset",  # Updated relative path
        epochs=50,
        imgsz=224,          # Standard classification size; 8x faster than 640x640
        batch=32,           # Increases VRAM utilization and speeds up GPU tensor cores
        workers=2,          # Prevents Windows RAM exhaustion from worker process cloning
        cache=False,        # CRITICAL: Do NOT load the entire dataset into system RAM
        device=0,           # Forces GPU execution
        amp=True,           # Automatic Mixed Precision (FP16) for faster training
        project="plant_disease",               
        name="classification_model"            
    )