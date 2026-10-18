import os

def rename_dataset_images(folder_path, prefix="not_a_plant"):
    # Check if the folder actually exists
    if not os.path.exists(folder_path):
        print(f"Error: Could not find the folder at '{folder_path}'")
        return

    # Valid image extensions to avoid renaming hidden system files (like thumbs.db)
    valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
    
    # Get all files in the directory
    files = os.listdir(folder_path)
    count = 1

    for filename in files:
        if filename.lower().endswith(valid_extensions):
            # Extract the file extension (e.g., .jpg)
            file_ext = os.path.splitext(filename)[1].lower()
            
            # Construct the new file name with 4-digit padding (e.g., not_a_plant_0001.jpg)
            new_name = f"{prefix}_{count:04d}{file_ext}"
            
            old_filepath = os.path.join(folder_path, filename)
            new_filepath = os.path.join(folder_path, new_name)
            
            # Safety check: skip if a file with this new name already exists
            while os.path.exists(new_filepath):
                count += 1
                new_name = f"{prefix}_{count:04d}{file_ext}"
                new_filepath = os.path.join(folder_path, new_name)
                
            # Perform the rename
            os.rename(old_filepath, new_filepath)
            count += 1

    print(f"Success! Renamed {count - 1} images in '{folder_path}'.")

if __name__ == "__main__":
    # Update this path if your folder is located somewhere else
    TARGET_FOLDER = "dataset/Not_A_Plant"
    
    rename_dataset_images(TARGET_FOLDER)