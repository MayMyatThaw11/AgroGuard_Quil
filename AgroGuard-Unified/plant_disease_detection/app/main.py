from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import predict

app = FastAPI(
    title="MyanGlow Plant Disease Detection API",
    version="2.0.0",
    description="Modular 5-Group ASEAN Plant Disease Classification Backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supports both /api/v1/ml/predict and /ml/predict
app.include_router(predict.router, prefix="/api/v1/ml", tags=["Disease Detection (v1)"])
app.include_router(predict.router, prefix="/ml", tags=["Disease Detection"])


@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok", "service": "AgroGuard 5-Group Disease Detection API"}