import asyncio
import websockets
import json

async def test():
    uri = "ws://localhost:8000/api/tts/ws/tts"
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri, open_timeout=5) as ws:
            print("Connected!")
            payload = {"text": "Hello", "voice": "female"}
            await ws.send(json.dumps(payload))
            print("Sent payload, waiting for response...")
            chunks = 0
            try:
                async for msg in ws:
                    if isinstance(msg, bytes):
                        chunks += 1
                        print(f"  Chunk {chunks}: {len(msg)} bytes")
                    else:
                        print(f"  Text: {msg}")
            except websockets.exceptions.ConnectionClosed as e:
                print(f"Connection closed: {e}")
            print(f"Done. Total chunks: {chunks}")
    except Exception as e:
        print(f"FAILED: {type(e).__name__}: {e}")

asyncio.run(test())
