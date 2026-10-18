import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.metrics import accuracy_score, top_k_accuracy_score

# 1. Load your verified dataset
df = pd.read_csv("../app/data/ASEAN_Top50_Crop_Training_Data_Verified.csv")

X = df[["ph", "rainfall", "temperature"]]
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 2. Initialize Decision Tree, Random Forest (Tree Ensemble), and Gaussian Naive Bayes
models = {
    "Decision Tree (Pruned)": DecisionTreeClassifier(max_depth=10, min_samples_leaf=8, random_state=42),
    "Random Forest (Tree Ensemble)": RandomForestClassifier(n_estimators=100, max_depth=12, random_state=42),
    "Bayesian (Gaussian Naive Bayes)": GaussianNB()
}

print(f"{'Model':<35} | {'Top-1 Acc':<10} | {'Top-5 Acc':<10}")
print("-" * 62)

for name, model in models.items():
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)
    
    # Top-1 Accuracy: Exact match with the single synthetic label
    top1 = accuracy_score(y_test, y_pred) * 100
    # Top-5 Accuracy: True crop is among the top 5 recommended crops (handles overlapping ranges)
    top5 = top_k_accuracy_score(y_test, y_proba, k=5, labels=model.classes_) * 100
    
    print(f"{name:<35} | {top1:>8.2f}% | {top5:>8.2f}%")

# 3. Example Prediction for Myanmar Central Dry Zone (pH=7.2, Rain=850mm, Temp=31°C)
sample_input = pd.DataFrame([{"ph": 7.2, "rainfall": 850.0, "temperature": 31.0}])

print("\nTop 5 Recommendations for pH=7.2, Rain=850mm, Temp=31°C:")
for name, model in models.items():
    probs = model.predict_proba(sample_input)[0]
    top5_idx = np.argsort(probs)[::-1][:5]
    top5_crops = [(model.classes_[i], round(probs[i] * 100, 1)) for i in top5_idx if probs[i] > 0]
    print(f"• {name}: {top5_crops}")