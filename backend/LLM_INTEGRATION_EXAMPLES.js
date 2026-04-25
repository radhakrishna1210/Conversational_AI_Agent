/**
 * LLM Module - Usage Examples & Integration Reference
 * 
 * This file demonstrates how to use the LLM module in various scenarios
 * and how to integrate it into your agent system.
 */

// ==========================================
// 1. BASIC USAGE - GENERATE RESPONSE
// ==========================================

async function example1_basicGenerateResponse() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'What is artificial intelligence?'
    })
  });

  const data = await response.json();
  console.log('AI Response:', data.message);
  console.log('Duration:', data.duration, 'ms');
}

// ==========================================
// 2. USING DIFFERENT PROVIDERS
// ==========================================

// OpenAI Example
async function example2_openaiProvider() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'Explain quantum computing',
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      systemPrompt: 'You are an expert in quantum computing.'
    })
  });

  return response.json();
}

// Azure OpenAI Example
async function example3_azureProvider() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'Generate a code snippet',
      provider: 'azure',
      model: 'azure-gpt-4o',
      temperature: 0.3, // Lower temperature for code
      deploymentName: 'my-gpt4-deployment'
    })
  });

  return response.json();
}

// Gemini Example
async function example4_geminiProvider() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'Create a creative story',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      temperature: 0.9 // Higher temperature for creativity
    })
  });

  return response.json();
}

// Custom LLM Example (LLaMA)
async function example5_customProvider() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'Translate to Spanish',
      provider: 'custom',
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5
    })
  });

  return response.json();
}

// ==========================================
// 3. VALIDATION BEFORE USAGE
// ==========================================

async function example6_validateConfig() {
  // Validate provider/model combination
  const response = await fetch('/api/v1/workspaces/ws-123/llm/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7
    })
  });

  const result = await response.json();
  
  if (result.valid) {
    console.log('Configuration is valid:', result.config);
    // Proceed with API call using this config
  } else {
    console.error('Configuration errors:', result.errors);
  }
}

// ==========================================
// 4. DISCOVER AVAILABLE PROVIDERS & MODELS
// ==========================================

async function example7_listProviders() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/providers', {
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  });

  const data = await response.json();
  console.log('Available providers:', data.providers);
  console.log('Total models:', data.totalModels);
}

async function example8_listProviderModels() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/models/openai', {
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
  });

  const data = await response.json();
  console.log('OpenAI models:', data.models);
}

// ==========================================
// 5. ADVANCED USAGE - CUSTOM OPTIONS
// ==========================================

async function example9_advancedOptions() {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'Write a detailed technical article',
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.6,
      systemPrompt: 'You are a technical writer with expertise in cloud computing.',
      maxTokens: 4000, // Custom token limit
      useFallback: true // Fallback to OpenAI if primary provider fails
    })
  });

  return response.json();
}

// ==========================================
// 6. AGENT INTEGRATION - BACKEND USAGE
// ==========================================

// This would be used in your agent service
async function example10_agentService_generateResponse(agentId, userMessage) {
  try {
    // 1. Fetch agent configuration from database
    // const agent = await Agent.findById(agentId);
    // OR use hardcoded config for demo
    const agentConfig = {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      systemPrompt: 'You are a helpful customer support agent.'
    };

    // 2. Validate configuration
    const validation = await validateLLMConfig(agentConfig);
    if (!validation.valid) {
      throw new Error(`Invalid agent config: ${validation.errors.join(', ')}`);
    }

    // 3. Generate response
    const response = await generateLLMResponse(agentId, userMessage, agentConfig);
    
    // 4. Process and return response
    return {
      success: true,
      message: response.message,
      metadata: {
        provider: response.provider,
        model: response.model,
        duration: response.duration
      }
    };
  } catch (error) {
    console.error('Error generating agent response:', error);
    throw error;
  }
}

// ==========================================
// 7. ERROR HANDLING
// ==========================================

async function example11_errorHandling() {
  try {
    const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_JWT_TOKEN'
      },
      body: JSON.stringify({
        agentId: 'agent-123',
        message: 'Hello',
        provider: 'invalid-provider', // This will cause an error
        model: 'some-model'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle different error types
      switch (response.status) {
        case 400:
          console.error('Validation error:', data.error);
          break;
        case 404:
          console.error('Provider not found:', data.error);
          break;
        case 500:
          console.error('Server error:', data.error);
          break;
        default:
          console.error('Unknown error:', data.error);
      }
    } else {
      console.log('Success:', data.message);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

// ==========================================
// 8. FALLBACK MECHANISM
// ==========================================

async function example12_fallbackMechanism() {
  // If primary provider fails, automatically fallback to OpenAI
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'Generate a response',
      provider: 'gemini', // Preferred provider
      model: 'gemini-2.5-flash',
      useFallback: true // If Gemini fails, will use OpenAI
    })
  });

  return response.json();
}

// ==========================================
// 9. PERFORMANCE MONITORING
// ==========================================

async function example13_performanceMonitoring() {
  const startTime = Date.now();

  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId: 'agent-123',
      message: 'Performance test message'
    })
  });

  const data = await response.json();
  const totalTime = Date.now() - startTime;

  console.log('Performance Metrics:', {
    clientTime: totalTime,
    serverTime: data.duration,
    networkTime: totalTime - data.duration,
    provider: data.provider,
    model: data.model
  });
}

// ==========================================
// 10. BATCH PROCESSING
// ==========================================

async function example14_batchProcessing(agentId, messages) {
  const results = [];

  for (const message of messages) {
    try {
      const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR_JWT_TOKEN'
        },
        body: JSON.stringify({
          agentId,
          message
        })
      });

      const data = await response.json();
      results.push({
        message,
        response: data.message,
        success: true
      });
    } catch (error) {
      results.push({
        message,
        error: error.message,
        success: false
      });
    }

    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return results;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function validateLLMConfig(config) {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify(config)
  });

  return response.json();
}

async function generateLLMResponse(agentId, message, config) {
  const response = await fetch('/api/v1/workspaces/ws-123/llm/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      agentId,
      message,
      ...config
    })
  });

  return response.json();
}

// ==========================================
// EXPORTS FOR USE IN OTHER FILES
// ==========================================

export {
  example1_basicGenerateResponse,
  example2_openaiProvider,
  example3_azureProvider,
  example4_geminiProvider,
  example5_customProvider,
  example6_validateConfig,
  example7_listProviders,
  example8_listProviderModels,
  example9_advancedOptions,
  example10_agentService_generateResponse,
  example11_errorHandling,
  example12_fallbackMechanism,
  example13_performanceMonitoring,
  example14_batchProcessing
};
