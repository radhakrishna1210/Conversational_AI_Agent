# LLM Module - Quick Start Guide

Get up and running with the LLM Configuration & Execution module in 5 minutes.

## 📦 Prerequisites

- Node.js 20+
- Backend running with `npm run dev`
- Valid JWT token for API calls

## 🚀 Quick Start

### Step 1: Configure API Keys

Add to your `.env` file:

```env
# Choose your primary provider
OPENAI_API_KEY=your_openai_key_here

# Optional: Add other providers
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your_azure_key_here
GEMINI_API_KEY=your_gemini_key_here

# Defaults
DEFAULT_LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-4o
DEFAULT_LLM_TEMPERATURE=0.7
```

### Step 2: Test the Endpoints

**Check Available Providers:**
```bash
curl -X GET http://localhost:4000/api/v1/workspaces/ws-123/llm/providers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Generate a Response:**
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "agentId": "test-agent",
    "message": "Hello! How can you help me?"
  }'
```

**Validate Configuration:**
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.7
  }'
```

### Step 3: Integrate in Your Code

```javascript
// Frontend/Agent Code
async function generateResponse() {
  const response = await fetch(
    '/api/v1/workspaces/ws-123/llm/generate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        agentId: 'my-agent',
        message: 'What is machine learning?'
      })
    }
  );
  
  const data = await response.json();
  console.log('AI Response:', data.message);
}
```

## 📋 Supported Providers

| Provider | Models | Setup Difficulty | Cost |
|----------|--------|------------------|------|
| **OpenAI** | gpt-4o, gpt-3.5-turbo, etc. | Easy | Pay-as-you-go |
| **Azure** | azure-gpt-4o, etc. | Medium | Enterprise pricing |
| **Gemini** | gemini-2.5-flash, etc. | Easy | Free tier available |
| **Custom** | llama-3.3-70b-versatile | Hard | Self-hosted |

## 🔧 Common Configurations

### Budget-Friendly (Gemini Free)
```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash-lite",
  "temperature": 0.7
}
```

### Best Performance (OpenAI GPT-4)
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "temperature": 0.7
}
```

### Cost-Effective (OpenAI 3.5)
```json
{
  "provider": "openai",
  "model": "gpt-3.5-turbo",
  "temperature": 0.7
}
```

### Enterprise (Azure)
```json
{
  "provider": "azure",
  "model": "azure-gpt-4o",
  "temperature": 0.7,
  "deploymentName": "my-deployment"
}
```

## 🎯 Use Cases

### Customer Support
```javascript
{
  "provider": "openai",
  "model": "gpt-4o",
  "temperature": 0.3, // Lower for consistency
  "systemPrompt": "You are a helpful customer support agent."
}
```

### Content Generation
```javascript
{
  "provider": "openai",
  "model": "gpt-4o",
  "temperature": 0.8, // Higher for creativity
  "systemPrompt": "You are a creative content writer."
}
```

### Code Generation
```javascript
{
  "provider": "openai",
  "model": "gpt-4o",
  "temperature": 0.2, // Very low for accuracy
  "systemPrompt": "You are an expert programmer. Generate clean, efficient code."
}
```

### Analysis
```javascript
{
  "provider": "openai",
  "model": "gpt-4o",
  "temperature": 0.5, // Balanced
  "systemPrompt": "You are an expert analyst."
}
```

## 🆘 Troubleshooting

### "API key not configured"
**Solution:** Check `.env` file has `OPENAI_API_KEY` set correctly

### "Invalid model for provider"
**Solution:** Use `/llm/models/:provider` endpoint to see allowed models

### "Request timed out"
**Solution:** Check provider status, or try a simpler request

### "CORS error"
**Solution:** Ensure request is from allowed origin (check `CLIENT_URL`)

### "401 Unauthorized"
**Solution:** Check JWT token is valid and not expired

## 📚 Next Steps

1. **Read Full Documentation:** See [LLM_MODULE_README.md](./LLM_MODULE_README.md)
2. **API Reference:** See [LLM_API_DOCUMENTATION.md](./LLM_API_DOCUMENTATION.md)
3. **Code Examples:** See [LLM_INTEGRATION_EXAMPLES.js](./LLM_INTEGRATION_EXAMPLES.js)
4. **Architecture Details:** Review source files in `src/services/llm/`

## 💡 Tips

- **Start with OpenAI:** Easiest to set up, best documentation
- **Use Fallback:** Enable `useFallback: true` for reliability
- **Monitor Costs:** Track API usage for budgeting
- **Validate First:** Use `/validate` endpoint before generating responses
- **Temperature Testing:** Experiment with different temperatures for your use case

## 🔐 Security

- Never commit `.env` file to git
- Rotate API keys regularly
- Use API key restrictions where available
- Monitor API usage for unusual patterns
- Use HTTPS in production

## 📞 Support

- Check logs: Enable `DEBUG=* npm run dev`
- Test endpoints: Use provided curl examples
- Validate config: Use `/validate` endpoint
- Review examples: See `LLM_INTEGRATION_EXAMPLES.js`

## 🎓 Learning Path

1. **Day 1:** Set up one provider (OpenAI recommended)
2. **Day 2:** Try different models and temperatures
3. **Day 3:** Add validation and error handling
4. **Day 4:** Implement fallback mechanism
5. **Day 5:** Add other providers for redundancy

---

**Ready to get started?** Run the generate endpoint now! 🚀
