import asyncio
import websockets
import json
import os

async def test_tts_websocket():
    # WebSocket URI
    uri = "ws://localhost:8000/ws/tts"
    
    # Test payload
    payload = {
        "text": "Hello! This is a test of the real-time XTTS streaming via WebSockets. I am receiving audio chunks and saving them to a file.",
        "voice": "female"
    }
    
    output_file = "ws_test_output.wav"
    
    print(f"Connecting to {uri}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            # 1. Send the JSON request
            await websocket.send(json.dumps(payload))
            print(f"Request sent: {payload['text'][:50]}...")
            
            audio_data = bytearray()
            chunk_count = 0
            
            # 2. Receive chunks until connection closes
            try:
                while True:
                    message = await websocket.recv()
                    
                    if isinstance(message, str):
                        # Handle potential JSON error messages
                        data = json.loads(message)
                        if "error" in data:
                            print(f"❌ Server Error: {data['error']}")
                            break
                    else:
                        # Handle binary audio chunks
                        chunk_count += 1
                        print(f"Received chunk {chunk_count}: {len(message)} bytes")
                        audio_data.extend(message)
                        
            except websockets.exceptions.ConnectionClosedOK:
                print("✅ Connection closed gracefully by server.")
            except websockets.exceptions.ConnectionClosedError as e:
                print(f"⚠️ Connection closed with error: {e}")
            
            # 3. Save the accumulated audio to a .wav file
            if audio_data:
                with open(output_file, "wb") as f:
                    f.write(audio_data)
                print(f"\n🎉 Success! Saved {len(audio_data)} bytes to '{output_file}'")
                print(f"Total chunks received: {chunk_count}")
            else:
                print("\n❌ No audio data was received.")
                
    except Exception as e:
        print(f"❌ Failed to connect or error occurred: {e}")
        print("\nNote: Make sure the FastAPI server is running at localhost:8000")

if __name__ == "__main__":
    # Ensure 'websockets' is installed: pip install websockets
    try:
        asyncio.run(test_tts_websocket())
    except KeyboardInterrupt:
        print("\nTest stopped by user.")
