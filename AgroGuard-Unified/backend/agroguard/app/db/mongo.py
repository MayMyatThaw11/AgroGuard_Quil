"""MongoDB access for health updates.

Health updates (and their photos, stored in GridFS) live in MongoDB, separate
from the PostgreSQL database that backs the rest of the API. The client is
created lazily so the API still starts — and every non-health-update route
still works — when MongoDB isn't running.
"""

from functools import lru_cache

from gridfs import AsyncGridFSBucket
from pymongo import AsyncMongoClient
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import get_settings

HEALTH_UPDATES = "health_updates"
IMAGE_BUCKET = "health_images"
CHAT_MESSAGES = "chat_messages"


@lru_cache(maxsize=1)
def _client() -> AsyncMongoClient:
    # A short server-selection timeout turns "Mongo isn't running" into a
    # quick, clear 503 instead of a 30-second hang.
    return AsyncMongoClient(get_settings().mongo_url, serverSelectionTimeoutMS=3000, tz_aware=True)


def get_database() -> AsyncDatabase:
    return _client()[get_settings().mongo_database]


def health_updates() -> AsyncCollection:
    return get_database()[HEALTH_UPDATES]


def chat_messages() -> AsyncCollection:
    return get_database()[CHAT_MESSAGES]


def image_bucket() -> AsyncGridFSBucket:
    return AsyncGridFSBucket(get_database(), bucket_name=IMAGE_BUCKET)
