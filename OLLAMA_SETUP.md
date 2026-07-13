# Multilingual Chat with Sarvam AI - Setup Guide

## What's implemented:
✅ Language selection in agent config
✅ Multilingual chat endpoint  
✅ Language detection (script-based)
✅ Dynamic prompt engineering for language preservation
✅ Sarvam AI integration
✅ Chat UI in EditAgent page

---

## Setup Instructions

### Step 1: Get Sarvam AI API Key

1. Visit https://www.sarvam.ai/
2. Sign up or log in to your account
3. Navigate to API Keys or Developer Settings
4. Create a new API key for your application
5. Copy the API key (you'll need it in Step 3)

### Step 2: Configure Backend

Edit `backend/.env`:
```env
SARVAM_API_KEY=your_api_key_here
SARVAM_URL=https://api.sarvam.ai
SARVAM_MODEL=sarvam-30b
```

Replace `your_api_key_here` with the actual API key from Step 1.

Available models on Sarvam AI:
- `sarvam-30b` - Default, recommended for new workloads (64K context)
- `sarvam-105b` - Best quality, larger model (128K context)

### Step 3: Start Backend

```bash
cd backend
npm run dev
```

The backend should be running on `http://localhost:4000`

### Step 4: Start Frontend

In another terminal:
```bash
cd client
npm run dev
```

The frontend should be running on `http://localhost:5173`

---

## Testing the Feature

1. **Create/Edit an Agent**
   - Go to Dashboard or click Edit on an agent
   - Select multiple languages (e.g., Hindi, English, Spanish)
   - Click "Configure" on Languages
   - Choose languages and click "Done"

2. **Open Chat Tab**
   - In the EditAgent page, click the "💬 Chat Test" tab
   - You should see the selected languages displayed

3. **Test Multilingual Chat**
   - Type in any language: 
     - English: "What is the capital of France?"
     - Hindi: "आप कौन हो?"
     - Spanish: "¿Hola, cómo estás?"
   - Click Send
   - Wait for Sarvam AI to generate response (typically 2-5 seconds)
   - Response should appear in the same language

---

## Troubleshooting

### "Failed to generate response" or "Cannot connect to Sarvam AI"
- ✅ Check that SARVAM_API_KEY is set in backend/.env
- ✅ Verify the API key is valid by checking your Sarvam dashboard
- ✅ Check SARVAM_URL in backend/.env (should be https://api.sarvam.ai/api/v1)
- ✅ Make sure backend server is running

### "Invalid API Key" error
- Go to https://www.sarvam.ai/ and verify your API key
- Make sure the key is copied correctly (no extra spaces)
- If expired, generate a new API key

### Response is in wrong language
- The language detection is script-based (looks for character sets)
- For better detection, add a library like `franc` or `langdetect`
- The LLM should respect the prompt instruction to reply in user's language

### Rate limit exceeded
- Sarvam AI has rate limits based on your plan
- Check your usage at https://www.sarvam.ai/
- Upgrade your plan if needed

### Backend startup fails
- Make sure SARVAM_API_KEY environment variable is set
- Run `cd backend && npm install` if dependencies are missing
- Check logs in the terminal for more details

---

## How Language Detection Works

Currently it's script-based (Hindi script, Tamil script, etc.):
```
Hindi (देवनागरी script) ✓
English ✓
Spanish/French (accented characters) ✓
Tamil/Telugu/Gujarati ✓
```

For production, use a language detection library:
```bash
npm install franc-min
```

Then update `ollama.service.js` to use it.

---

## Next Steps

1. Add database storage for conversations
2. Add language detection library for better accuracy
3. Add voice input/output
4. Add knowledge base context to the prompt
5. Add conversation history
6. Deploy Ollama to cloud (or use managed LLM API like Together.ai)
