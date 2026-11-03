import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings

router = APIRouter()


@router.websocket("/ws/analisis/{analisis_id}")
async def websocket_analisis(websocket: WebSocket, analisis_id: str):
    await websocket.accept()

    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"analisis:{analisis_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"analisis:{analisis_id}")
        await pubsub.close()
        await redis.aclose()
