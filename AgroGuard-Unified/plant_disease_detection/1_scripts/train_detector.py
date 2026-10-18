from ultralytics import YOLO

# Everything below this line is protected from the multiprocessing loop
if __name__ == '__main__':
    
    # Load the local model you downloaded
    model = YOLO("yolo11n.pt") 

    # Train the model
    results = model.train(
        data="dataset/detection_dataset/data.yaml", 
        epochs=50,                 
        imgsz=640,                 
        device="0", 
        
        # --- ADD THESE THREE PARAMETERS ---
        batch=16,       # Increases how many images are sent to the GPU at once (try 32 if you have VRAM left)
        workers=4,      # Uses multiple CPU cores to load and prepare images simultaneously 
        cache=True,     # Loads all images into your system RAM so the GPU doesn't wait on your hard drive
        
        project="plant_disease",
        name="detection_model"
    )