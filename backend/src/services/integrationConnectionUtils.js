const PLACEHOLDER_TOKENS = [
  'your_',
  'example',
  'placeholder',
  'changeme',
  'mock',
  'xxxx',
  'insert here',
  'your-token',
  'your-api-key',
  'your-auth-token',
  'your_client_secret',
  'your_access_token',
  'your_webhook_url',
];

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

export const isPlaceholderValue = (value) => {
  const text = normalizeText(value);
  if (!text) return true;
  const lower = text.toLowerCase();
  if (lower.includes('<your') || lower.includes('your_') || lower.includes('your-')) return true;
  if (lower.includes('example.com') || lower.includes('example')) return true;
  if (lower.includes('placeholder') || lower.includes('changeme')) return true;
  if (lower.includes('mock')) return true;
  if (lower.includes('your-token') || lower.includes('your-api-key') || lower.includes('your-auth-token')) return true;
  if (/^(x{3,}|[a-z]{3,})$/.test(lower) && lower.includes('x')) return true;
  return PLACEHOLDER_TOKENS.some((token) => lower.includes(token));
};

export const normalizeIntegrationName = (value, fallbackName) => {
  const text = normalizeText(value);
  if (!text) return fallbackName;
  if (isPlaceholderValue(text)) return fallbackName;
  return text;
};

export const buildConnectionIdentity = (providerName, credentials = {}, extraMeta = {}) => {
  const displayName = normalizeIntegrationName(credentials.integrationName ?? credentials.name, providerName);
  const description = normalizeText(credentials.description);
  const meta = { ...extraMeta };
  if (description) meta.description = description;
  return { displayName, description, metadata: meta };
};

export const normalizeWebhookUrl = (value) => {
  const text = normalizeText(value);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(text)) {
    const [identifier, host] = text.split('@');
    return `https://${host.replace(/\/+$/, '')}/${identifier.replace(/^\/+|\/+$/g, '')}`;
  }
  if (text.startsWith('www.')) return `https://${text}`;
  if (text.includes('.') && !text.includes(' ')) return `https://${text.replace(/^\/+|\/+$/g, '')}`;
  return text;
};

export const isValidWebhookUrl = (value) => {
  const normalized = normalizeWebhookUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const WEBHOOK_HOST_PATTERNS = {
  make: /(^|\.)make\.com$/i,
  zapier: /(^|\.)zapier\.com$/i,
  n8n: /webhook/i,
  ghl: /(^|\.)(leadconnectorhq\.com|gohighlevel\.com)$/i,
};

export const validateWebhookProviderUrl = (providerKey, value) => {
  const normalized = normalizeWebhookUrl(value);
  if (!isValidWebhookUrl(normalized)) {
    throw Object.assign(new Error('A valid HTTPS webhook URL is required.'), { statusCode: 400 });
  }
  const pattern = WEBHOOK_HOST_PATTERNS[providerKey];
  if (pattern) {
    const host = new URL(normalized).hostname;
    const path = new URL(normalized).pathname;
    const matches = providerKey === 'n8n' ? pattern.test(path) || pattern.test(normalized) : pattern.test(host);
    if (!matches) {
      const labels = { make: 'Make (hook.*.make.com)', zapier: 'Zapier (hooks.zapier.com)', n8n: 'n8n (…/webhook/…)', ghl: 'GoHighLevel (leadconnectorhq.com)' };
      throw Object.assign(new Error(`URL does not look like a ${labels[providerKey] ?? providerKey} webhook.`), { statusCode: 400 });
    }
  }
  return normalized;
};

export const validateIntegrationCredentials = (providerKey, credentials = {}) => {
  const values = { ...(credentials ?? {}) };

  const requiredFields = [];
  if (['google_calendar', 'google_meet', 'google_sheets'].includes(providerKey)) requiredFields.push({ key: 'accessToken', label: 'OAuth access token' });
  if (providerKey === 'calendly') requiredFields.push({ key: 'personalToken', label: 'Personal access token' });
  if (providerKey === 'cal') requiredFields.push({ key: 'apiKey', label: 'API key' });
  if (providerKey === 'hubspot') requiredFields.push({ key: 'accessToken', label: 'Access token' });
  if (providerKey === 'slack') requiredFields.push({ key: 'botToken', label: 'Bot token' });
  if (providerKey === 'salesforce') {
    requiredFields.push({ key: 'instanceUrl', label: 'Instance URL' });
    requiredFields.push({ key: 'accessToken', label: 'Access token' });
  }
  if (providerKey === 'twilio') {
    requiredFields.push({ key: 'accountSid', label: 'Account SID' });
    requiredFields.push({ key: 'authToken', label: 'Auth token' });
  }
  if (providerKey === 'genesys') {
    requiredFields.push({ key: 'clientId', label: 'Client ID' });
    requiredFields.push({ key: 'clientSecret', label: 'Client secret' });
    requiredFields.push({ key: 'region', label: 'Region' });
  }
  if (['make', 'zapier', 'n8n', 'ghl'].includes(providerKey)) requiredFields.push({ key: 'webhookUrl', label: 'Webhook URL' });
  if (providerKey === 'custom_api') {
    requiredFields.push({ key: 'endpointUrl', label: 'Endpoint URL' });
  }

  for (const field of requiredFields) {
    const value = values[field.key];
    if (isPlaceholderValue(value)) {
      throw Object.assign(new Error(`${field.label} is required and must be a real value.`), { statusCode: 400 });
    }
  }

  return values;
};
