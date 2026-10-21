from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from app.api.v1.endpoints.council import router as council_router

app = FastAPI(title="AgroGuard Council API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(council_router, prefix="/api/v1", tags=["Agentic Council"])

@app.get("/")
def root():
    return {"message": "AgroGuard Council API is active", "status": "ok"}

if __name__ == "__main__":
    uvicorn.run("run_council_api:app", host="127.0.0.1", port=8000, reload=False)
