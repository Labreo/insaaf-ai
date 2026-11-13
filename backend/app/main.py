"""FastAPI application entrypoint for Insaaf AI backend."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import deep_health, router
from app.db import init_db
from app.pipeline.orchestrator import seed_fast_stage_results
from app.services.kanoon.client import kanoon_client


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    await kanoon_client.warm_landmark_cache()
    await seed_fast_stage_results()
    yield


app = FastAPI(
    title="Insaaf AI Backend",
    version="0.1.0",
    description="Junior-lawyer workflow automation with time-boxed Kanoon search, Authority Lock, Bias Firewall, and hash-chained Reviewer Ledger.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/v1")
app.add_api_route("/health/deep", deep_health, methods=["GET"])

