# LLM Configuration & Execution Module

A modular, production-ready LLM integration system for the Conversational AI Backend platform. Supports multiple AI providers with factory pattern architecture, strict validation, and comprehensive error handling.

## 📋 Features

- **Multi-Provider Support**: OpenAI, Azure OpenAI, Google Gemini, and Custom LLMs
- **Factory Pattern Architecture**: Easy provider selection and instantiation
- **Strict Model Validation**: Each provider only accepts its allowed models
- **Temperature Control**: Full support for temperature configuration (0-1)
- **Timeout Handling**: Configurable timeouts for all provider requests
- **Fallback Mechanism**: Automatic fallback to OpenAI if primary provider fails
- **Comprehensive Logging**: Request tracking with request IDs and performance metrics
- **Production-Ready**: Error handling, validation, and secure API key management

## 🏗️ Architecture

```
src/
├── constants/
│   └── llmModels.js          # Model definitions & validation logic
├── controllers/
│   └── llm.controller.js      # API endpoint handlers
├── services/
│   ├── llm.factory.js         # Provider factory pattern
│   └── llm/
│       ├── openai.service.js        # OpenAI provider
│       ├── azure.service.js         # Azure OpenAI provider
│       ├── gemini.service.js        # Google Gemini provider
│       └── custom.service.js        # Custom LLM provider
└── routes/
    └── llm.routes.js          # API route definitions
```

## 🚀 Setup & Installation

### 1. Install Dependencies

The required LLM SDKs are already listed in `package.json`. Install them with:

```bash
npm install
```

This will install:
- `openai` - OpenAI SDK
- `@azure/openai` - Azure OpenAI SDK
- `@google/generative-ai` - Google Generative AI SDK

### 2. Configure Environment Variables

Copy the template and fill in your API keys:

```bash
cp .env.llm.template .env
```

Then edit `.env` with your credentials:

```env
# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_KEY=your_azure_key_here
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Custom LLM
CUSTOM_LLM_BASE_URL=http://localhost:8000
CUSTOM_LLM_API_KEY=your_custom_key_here

# Defaults
DEFAULT_LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-4o
DEFAULT_LLM_TEMPERATURE=0.7
```

## 📦 Supported Providers & Models

### OpenAI

**Allowed Models:**
- `gpt-3.5-turbo`
- `gpt-4.1-mini`
- `gpt-4.1-nano`
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-5.1`

**Requirements:**
- `OPENAI_API_KEY` environment variable

**Example:**
```javascript
{
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7
}
```

### Azure OpenAI

**Allowed Models:**
- `azure-gpt-4.1-mini`
- `azure-gpt-4.1-nano`
- `azure-gpt-4o`
- `azure-gpt-4o-mini`

**Requirements:**
- `AZURE_OPENAI_ENDPOINT` - Your Azure endpoint URL
- `AZURE_OPENAI_KEY` - Your Azure API key
- `deploymentName` - Azure deployment name (in request config)

**Example:**
```javascript
{
  provider: "azure",
  model: "azure-gpt-4o",
  temperature: 0.7,
  deploymentName: "my-deployment"
}
```

### Google Gemini

**Allowed Models:**
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

**Requirements:**
- `GEMINI_API_KEY` environment variable

**Example:**
```javascript
{
  provider: "gemini",
  model: "gemini-2.5-flash",
  temperature: 0.7
}
```

### Custom LLM (LLaMA, etc.)

**Allowed Models:**
- `llama-3.3-70b-versatile`

**Requirements:**
- `CUSTOM_LLM_BASE_URL` - Your LLM API endpoint
- `CUSTOM_LLM_API_KEY` - Optional API key for your endpoint

**Expected Endpoint Behavior:**
```
POST {CUSTOM_LLM_BASE_URL}/generate
Content-Type: application/json

{
  "model": "llama-3.3-70b-versatile",
  "message": "user message",
  "system_prompt": "system prompt",
  "temperature": 0.7,
  "max_tokens": 2000
}

Response:
{
  "response": "generated text"
}
```

## 🔌 API Endpoints

### Generate LLM Response

**POST** `/api/v1/workspaces/:workspaceId/llm/generate`

Generates a response from the configured LLM provider.

**Request Body:**
```json
{
  "agentId": "agent-123",
  "message": "Hello, how are you?",
  "provider": "openai",              // optional, uses default if not provided
  "model": "gpt-4o",                 // optional, uses default if not provided
  "temperature": 0.7,                // optional, default: 0.7
  "systemPrompt": "You are helpful", // optional, default provided
  "maxTokens": 2000,                 // optional
  "useFallback": true                // optional, enables fallback to OpenAI
}
```

**Response:**
```json
{
  "success": true,
  "agentId": "agent-123",
  "message": "I'm doing great, thank you for asking!",
  "provider": "openai",
  "model": "gpt-4o",
  "timestamp": "2024-12-19T10:30:00Z",
  "duration": 1250
}
```

**Error Response:**
```json
{
  "error": "Invalid model for OpenAI: gpt-5",
  "details": "Model not found"
}
```

### Get Supported Providers

**GET** `/api/v1/workspaces/:workspaceId/llm/providers`

Returns all supported providers and their models.

**Response:**
```json
{
  "providers": [
    {
      "name": "openai",
      "models": ["gpt-3.5-turbo", "gpt-4o", ...],
      "modelCount": 6
    },
    {
      "name": "azure",
      "models": ["azure-gpt-4o", ...],
      "modelCount": 4
    },
    {
      "name": "gemini",
      "models": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
      "modelCount": 2
    },
    {
      "name": "custom",
      "models": ["llama-3.3-70b-versatile"],
      "modelCount": 1
    }
  ],
  "totalProviders": 4,
  "totalModels": 13
}
```

### Get Models for Provider

**GET** `/api/v1/workspaces/:workspaceId/llm/models/:provider`

Returns allowed models for a specific provider.

**Example:** `GET /api/v1/workspaces/ws-123/llm/models/openai`

**Response:**
```json
{
  "provider": "openai",
  "models": [
    "gpt-3.5-turbo",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5.1"
  ]
}
```

### Validate LLM Configuration

**POST** `/api/v1/workspaces/:workspaceId/llm/validate`

Validates an LLM configuration before use.

**Request Body:**
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "temperature": 0.7
}
```

**Success Response:**
```json
{
  "valid": true,
  "config": {
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.7
  }
}
```

**Error Response:**
```json
{
  "valid": false,
  "errors": [
    "Invalid model for provider openai. Allowed: gpt-3.5-turbo, gpt-4o, ..."
  ]
}
```

## 🧠 Usage Examples

### Basic Usage - Generate Response

```javascript
import axios from 'axios';

const generateResponse = async () => {
  const response = await axios.post(
    '/api/v1/workspaces/ws-123/llm/generate',
    {
      agentId: 'agent-456',
      message: 'What is machine learning?',
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7
    }
  );
  
  console.log(response.data.message); // Generated AI response
};
```

### Using Different Providers

```javascript
// OpenAI
const openaiRequest = {
  agentId: 'agent-1',
  message: 'Hello',
  provider: 'openai',
  model: 'gpt-4o'
};

// Azure OpenAI
const azureRequest = {
  agentId: 'agent-2',
  message: 'Hello',
  provider: 'azure',
  model: 'azure-gpt-4o',
  deploymentName: 'my-gpt4-deployment'
};

// Gemini
const geminiRequest = {
  agentId: 'agent-3',
  message: 'Hello',
  provider: 'gemini',
  model: 'gemini-2.5-flash'
};

// Custom LLM
const customRequest = {
  agentId: 'agent-4',
  message: 'Hello',
  provider: 'custom',
  model: 'llama-3.3-70b-versatile'
};
```

### Validate Before Using

```javascript
// Validate configuration
const validation = await axios.post(
  '/api/v1/workspaces/ws-123/llm/validate',
  {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.9
  }
);

if (validation.data.valid) {
  // Use the validated config
  console.log('Configuration is valid');
}
```

## ⚙️ Configuration

### Temperature Values

Temperature controls randomness/creativity (0-1 scale):
- `0.0` - Deterministic, repeatable responses
- `0.3-0.5` - Focused, factual responses
- `0.7-0.8` - Balanced, natural responses
- `1.0` - Maximum randomness, creative responses

### Timeout Configuration

Default timeouts by provider (in milliseconds):
- OpenAI: 30 seconds
- Azure OpenAI: 30 seconds
- Gemini: 30 seconds
- Custom LLM: 30 seconds

Modify in `src/constants/llmModels.js` if needed.

### Max Tokens

Default maximum tokens: 2000 per request. Adjust via `maxTokens` parameter in request body.

## 🛡️ Error Handling

The module includes comprehensive error handling:

```javascript
// Invalid provider
{
  "error": "Invalid LLM provider: xyz. Supported providers: openai, azure, gemini, custom"
}

// Invalid model
{
  "error": "Invalid model 'gpt-5' for provider 'openai'. Allowed models: gpt-3.5-turbo, gpt-4o, ..."
}

// Invalid temperature
{
  "error": "Temperature must be a number between 0 and 1"
}

// Timeout
{
  "error": "OpenAI request timed out"
}

// Missing credentials
{
  "error": "OpenAI API key not configured"
}

// Network/API errors
{
  "error": "OpenAI error: 401 Unauthorized"
}
```

## 📊 Logging

All requests are logged with:
- Request ID for tracing
- Provider and model used
- Response duration
- Token usage (where available)
- Errors with full stack traces

Enable debug logs:
```bash
DEBUG=* npm run dev
```

## 🔐 Security Best Practices

1. **Never commit API keys** - Use `.env` file (included in `.gitignore`)
2. **Validate input** - All inputs are validated server-side
3. **Use HTTPS** - Always use HTTPS in production
4. **Rotate keys** - Regularly rotate your API keys
5. **Rate limiting** - Apply rate limiting at the application level
6. **Monitor usage** - Track API usage to detect unusual activity

## 🧪 Testing

### Test OpenAI Integration

```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "agentId": "test-agent",
    "message": "Hello",
    "provider": "openai",
    "model": "gpt-4o"
  }'
```

### Test Provider Support

```bash
curl http://localhost:4000/api/v1/workspaces/ws-123/llm/providers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔧 Customization

### Adding a New Provider

1. Create `src/services/llm/mynewprovider.service.js`
2. Implement the provider class with `generateResponse()` method
3. Add to factory in `src/services/llm.factory.js`
4. Add models to `src/constants/llmModels.js`
5. Add environment variables to `.env.llm.template`

Example:

```javascript
// src/services/llm/mynewprovider.service.js
class MyNewProviderService {
  async generateResponse(message, config, options) {
    // Implementation
  }
  
  getAllowedModels() {
    return ['model-1', 'model-2'];
  }
}
```

### Extending Functionality

The module is designed for extensibility:
- Add new LLM providers without modifying existing code
- Extend validation logic in `llmModels.js`
- Add new endpoints in `llm.controller.js`
- Customize behavior via environment variables

## 📈 Performance

- **Average response time**: 1-3 seconds (depends on provider)
- **Concurrent requests**: Limited by provider rate limits
- **Memory usage**: ~50MB base + variable per provider
- **Connection pooling**: Handled by SDK clients

## 🐛 Troubleshooting

### "OpenAI API key not configured"

**Solution**: Set `OPENAI_API_KEY` in `.env`

### "Invalid model for provider"

**Solution**: Check allowed models with `/llm/models/:provider` endpoint

### "Request timed out"

**Solution**: Increase timeout in `src/constants/llmModels.js` or check provider status

### "CORS error"

**Solution**: Ensure request comes from allowed origin (check `CLIENT_URL` in `.env`)

## 📚 Additional Resources

- [OpenAI Documentation](https://platform.openai.com/docs)
- [Azure OpenAI Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Google Gemini Documentation](https://ai.google.dev/)
- [LLaMA Documentation](https://www.llama.com/)

## 📝 License

This module is part of the Conversational AI Agent platform.

## 🤝 Support

For issues or questions about the LLM module, please refer to the main project documentation or create an issue in the repository.
