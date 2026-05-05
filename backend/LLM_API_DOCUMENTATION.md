# LLM Module - API Documentation

Complete API reference for the LLM Configuration & Execution module.

## Base URL

```
/api/v1/workspaces/:workspaceId/llm
```

All endpoints are authenticated and workspace-scoped.

## Authentication

All endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## Endpoints

### 1. Generate LLM Response

Generate a response from the configured LLM provider.

**Endpoint:**
```
POST /api/v1/workspaces/:workspaceId/llm/generate
```

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

**Request Body:**
```json
{
  "agentId": "string (required)",
  "message": "string (required)",
  "provider": "string (optional)",
  "model": "string (optional)",
  "temperature": "number (optional, 0-1)",
  "systemPrompt": "string (optional)",
  "maxTokens": "number (optional)",
  "useFallback": "boolean (optional, default: true)"
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| agentId | string | Yes | Unique identifier for the agent |
| message | string | Yes | User message to process |
| provider | string | No | LLM provider (openai, azure, gemini, custom). Uses default if not provided |
| model | string | No | Model name. Uses default if not provided |
| temperature | number | No | Randomness (0-1). Default: 0.7 |
| systemPrompt | string | No | System prompt for the model. Default: "You are a helpful AI assistant." |
| maxTokens | number | No | Maximum tokens in response. Default: 2000 |
| useFallback | boolean | No | Enable fallback to OpenAI if provider fails. Default: true |

**Success Response (200):**
```json
{
  "success": true,
  "agentId": "agent-123",
  "message": "Generated response text...",
  "provider": "openai",
  "model": "gpt-4o",
  "timestamp": "2024-12-19T10:30:00Z",
  "duration": 1250
}
```

**Error Responses:**

**400 - Bad Request:**
```json
{
  "error": "Missing required fields: agentId and message"
}
```

```json
{
  "error": "Invalid model 'gpt-5' for provider 'openai'. Allowed models: gpt-3.5-turbo, gpt-4o, gpt-4o-mini, gpt-5.1"
}
```

```json
{
  "error": "Temperature must be a number between 0 and 1"
}
```

**500 - Server Error:**
```json
{
  "error": "OpenAI request timed out"
}
```

```json
{
  "error": "Internal server error",
  "details": "OpenAI API key not configured"
}
```

**Examples:**

### Example 1: Basic Request (Uses Defaults)
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "agentId": "agent-001",
    "message": "Hello, how are you?"
  }'
```

### Example 2: OpenAI with Custom Temperature
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "agentId": "agent-001",
    "message": "Generate a creative story",
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.9,
    "maxTokens": 3000
  }'
```

### Example 3: Azure OpenAI with Deployment
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "agentId": "agent-002",
    "message": "Write code in Python",
    "provider": "azure",
    "model": "azure-gpt-4o",
    "deploymentName": "my-gpt4-deployment",
    "temperature": 0.3
  }'
```

### Example 4: With Fallback Enabled
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "agentId": "agent-003",
    "message": "Analyze this text",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "useFallback": true
  }'
```

---

### 2. Get All Supported Providers

List all available LLM providers and their models.

**Endpoint:**
```
GET /api/v1/workspaces/:workspaceId/llm/providers
```

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Success Response (200):**
```json
{
  "providers": [
    {
      "name": "openai",
      "models": [
        "gpt-3.5-turbo",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-5.1"
      ],
      "modelCount": 6
    },
    {
      "name": "azure",
      "models": [
        "azure-gpt-4.1-mini",
        "azure-gpt-4.1-nano",
        "azure-gpt-4o",
        "azure-gpt-4o-mini"
      ],
      "modelCount": 4
    },
    {
      "name": "gemini",
      "models": [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite"
      ],
      "modelCount": 2
    },
    {
      "name": "custom",
      "models": [
        "llama-3.3-70b-versatile"
      ],
      "modelCount": 1
    }
  ],
  "totalProviders": 4,
  "totalModels": 13
}
```

**Example:**
```bash
curl -X GET http://localhost:4000/api/v1/workspaces/ws-123/llm/providers \
  -H "Authorization: Bearer eyJhbGc..."
```

---

### 3. Get Models for Specific Provider

List models available for a specific provider.

**Endpoint:**
```
GET /api/v1/workspaces/:workspaceId/llm/models/:provider
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| provider | string | Provider name (openai, azure, gemini, custom) |

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Success Response (200):**
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

**Error Responses:**

**400 - Bad Request:**
```json
{
  "error": "Provider is required"
}
```

**404 - Not Found:**
```json
{
  "error": "Unknown provider: xyz",
  "supportedProviders": ["openai", "azure", "gemini", "custom"]
}
```

**Examples:**

```bash
# Get OpenAI models
curl -X GET http://localhost:4000/api/v1/workspaces/ws-123/llm/models/openai \
  -H "Authorization: Bearer eyJhbGc..."

# Get Azure models
curl -X GET http://localhost:4000/api/v1/workspaces/ws-123/llm/models/azure \
  -H "Authorization: Bearer eyJhbGc..."

# Get Gemini models
curl -X GET http://localhost:4000/api/v1/workspaces/ws-123/llm/models/gemini \
  -H "Authorization: Bearer eyJhbGc..."
```

---

### 4. Validate LLM Configuration

Validate an LLM configuration before using it.

**Endpoint:**
```
POST /api/v1/workspaces/:workspaceId/llm/validate
```

**Request Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

**Request Body:**
```json
{
  "provider": "string (required)",
  "model": "string (required)",
  "temperature": "number (optional, 0-1)"
}
```

**Success Response (200):**
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

**Error Response (400):**
```json
{
  "valid": false,
  "errors": [
    "Invalid model 'gpt-999' for provider openai. Allowed: gpt-3.5-turbo, gpt-4o, gpt-4o-mini, gpt-5.1",
    "Temperature must be a number between 0 and 1"
  ]
}
```

**Examples:**

### Example 1: Valid Configuration
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "temperature": 0.7
  }'
```

### Example 2: Invalid Configuration
```bash
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "provider": "openai",
    "model": "gpt-999",
    "temperature": 1.5
  }'
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found (resource not found) |
| 500 | Server Error |

## Rate Limiting

Rate limiting is applied at the application level. Default limits:
- 100 requests per minute per user
- 1000 requests per hour per workspace

Check response headers for rate limit info:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1703001600
```

## Error Handling

All errors include an `error` field describing the issue:

```json
{
  "error": "Description of what went wrong",
  "details": "Additional context (only in development mode)"
}
```

## Provider-Specific Notes

### OpenAI
- Requires `OPENAI_API_KEY` environment variable
- Supports all listed models
- Rate limited by OpenAI (varies by plan)

### Azure OpenAI
- Requires `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, and `AZURE_OPENAI_API_VERSION`
- Must provide `deploymentName` in request
- Models use "azure-" prefix (e.g., "azure-gpt-4o")

### Google Gemini
- Requires `GEMINI_API_KEY` environment variable
- Limited model selection
- Streaming responses not yet supported

### Custom LLM
- Requires `CUSTOM_LLM_BASE_URL` environment variable
- Expected to return `{ response: "..." }` in JSON
- Timeout: 30 seconds (configurable)

## Testing Endpoints

### Using curl

```bash
# Test basic endpoint
curl -X GET http://localhost:4000/api/v1/workspaces/ws-123/llm/providers \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test with data
curl -X POST http://localhost:4000/api/v1/workspaces/ws-123/llm/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"agentId":"test","message":"Hello"}'
```

### Using JavaScript/Fetch

```javascript
const response = await fetch(
  '/api/v1/workspaces/ws-123/llm/generate',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      agentId: 'test',
      message: 'Hello'
    })
  }
);

const data = await response.json();
console.log(data);
```

### Using Python

```python
import requests

headers = {
    'Content-Type': 'application/json',
    'Authorization': f'Bearer {token}'
}

payload = {
    'agentId': 'test',
    'message': 'Hello'
}

response = requests.post(
    'http://localhost:4000/api/v1/workspaces/ws-123/llm/generate',
    json=payload,
    headers=headers
)

print(response.json())
```

## Version History

**v1.0.0** (Current)
- Initial release
- Support for OpenAI, Azure, Gemini, Custom LLM
- Basic generate, validate, and list endpoints
- Factory pattern implementation
- Timeout handling and fallback mechanism
- Comprehensive error handling

## Support & Issues

For issues or questions:
1. Check [LLM_MODULE_README.md](./LLM_MODULE_README.md) for detailed documentation
2. Review [LLM_INTEGRATION_EXAMPLES.js](./LLM_INTEGRATION_EXAMPLES.js) for code examples
3. Check application logs for error details
4. Verify environment variables are set correctly
