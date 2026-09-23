import json
from typing import List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        payload = json.dumps(message, default=str)
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

@router.websocket("/ws/live")
async def websocket_live_tracking(websocket: WebSocket):
    """WebSocket endpoint for Admin Web Dashboard to receive live location updates in real-time."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; can receive ping/pong or client commands
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
