export const INTEGRATION_PROVIDERS = {
  google_calendar: {
    key: 'google_calendar',
    name: 'Google Calendar',
    category: 'During Call',
    connectType: 'oauth',
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'],
      clientIdEnv: 'GOOGLE_CLIENT_ID',
      clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
      // Per-provider: the callback route is /integrations/:provider/callback,
      // so the three Google integrations cannot share one redirect URI.
      // Unset by default — createOAuthConnectUrl then derives the correct
      // per-provider callback from CLIENT_URL.
      redirectUriEnv: 'GOOGLE_CALENDAR_REDIRECT_URI',
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    apiBaseUrlEnv: 'GOOGLE_API_BASE_URL',
    syncEndpoint: '/calendar/v3/users/me/calendarList',
  },
  google_meet: {
    key: 'google_meet',
    name: 'Google Meet',
    category: 'During Call',
    connectType: 'oauth',
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/userinfo.email'],
      clientIdEnv: 'GOOGLE_CLIENT_ID',
      clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
      redirectUriEnv: 'GOOGLE_MEET_REDIRECT_URI',
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    apiBaseUrlEnv: 'GOOGLE_API_BASE_URL',
    syncEndpoint: '/calendar/v3/users/me/calendarList',
  },
  google_sheets: {
    key: 'google_sheets',
    name: 'Google Sheets',
    category: 'Post Call',
    connectType: 'oauth',
    oauth: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly'],
      clientIdEnv: 'GOOGLE_CLIENT_ID',
      clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
      redirectUriEnv: 'GOOGLE_SHEETS_REDIRECT_URI',
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    apiBaseUrlEnv: 'GOOGLE_API_BASE_URL',
    syncEndpoint: '/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27&pageSize=10',
  },
  cal: {
    key: 'cal',
    name: 'Cal.com',
    category: 'During Call',
    connectType: 'apikey',
    connectFields: [
      { name: 'apiKey', label: 'API Key', placeholder: 'cal_live_...', type: 'password', help: 'Get from cal.com/settings/developer/api-keys' },
    ],
    oauth: null,
    apiBaseUrl: 'https://api.cal.com',
    syncEndpoint: '/v2/me',
    verifyUrl: 'https://api.cal.com/v2/me',
  },
  calendly: {
    key: 'calendly',
    name: 'Calendly',
    category: 'During Call',
    connectType: 'apikey',
    connectFields: [
      { name: 'personalToken', label: 'Personal Access Token', placeholder: 'eyJra...', type: 'password', help: 'Get from calendly.com/integrations/api_webhooks' },
    ],
    oauth: null,
    apiBaseUrl: 'https://api.calendly.com',
    syncEndpoint: '/users/me',
    verifyUrl: 'https://api.calendly.com/users/me',
    webhookSigningKeyEnv: 'CALENDLY_WEBHOOK_SIGNING_KEY',
  },
  salesforce: {
    key: 'salesforce',
    name: 'Salesforce',
    category: 'Post Call',
    connectType: 'apikey',
    connectFields: [
      { name: 'instanceUrl', label: 'Instance URL', placeholder: 'https://yourorg.salesforce.com', type: 'text', help: 'Your Salesforce org URL' },
      { name: 'accessToken', label: 'Access Token', placeholder: '00D...', type: 'password', help: 'From Setup → API → Reset Security Token or use OAuth' },
    ],
    oauth: null,
    syncEndpoint: '/services/data/v60.0/query?q=SELECT%20Id,Name,Email%20FROM%20Lead%20LIMIT%20100',
  },
  zoho: {
    key: 'zoho',
    name: 'Zoho CRM',
    category: 'Post Call',
    connectType: 'oauth',
    oauth: {
      // {accountsBase} is resolved from ZOHO_ACCOUNTS_BASE_URL (env.js) at
      // request time — see zohoAccountsBase() in integrations.service.js.
      // Zoho orgs live on one specific data center (.com/.eu/.in/.com.cn/.jp/
      // .au, picked at signup) and a client_id registered there is invisible
      // to every other DC's accounts server. Hardcoding accounts.zoho.com here
      // silently broke every non-.com org with Zoho's "invalid_client" error.
      authorizationUrl: '{accountsBase}/oauth/v2/auth',
      tokenUrl: '{accountsBase}/oauth/v2/token',
      scope: ['ZohoCRM.modules.ALL', 'ZohoCRM.settings.READ'],
      clientIdEnv: 'ZOHO_CLIENT_ID',
      clientSecretEnv: 'ZOHO_CLIENT_SECRET',
      redirectUriEnv: 'ZOHO_REDIRECT_URI',
      // access_type=offline + prompt=consent are what make Zoho actually
      // include a refresh_token in the response — omit either and it silently
      // issues an access-only grant that dies in ~1h with no way to renew it.
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    // Real CRM calls go to metadata.apiDomain (returned per-connection at
    // token exchange — see completeOAuthCallback), NOT a fixed host: Zoho's
    // API domain depends on which data center the org signed up in.
    syncEndpoint: '/crm/v3/Leads?per_page=1',
  },
  notion: {
    key: 'notion',
    name: 'Notion',
    category: 'Post Call',
    connectType: 'oauth',
    oauth: {
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      // Notion has no OAuth `scope` concept — access is whatever capabilities
      // the integration was given in Notion's own dashboard, plus whichever
      // pages the user picks on the consent screen. Nothing to request here.
      scope: [],
      clientIdEnv: 'NOTION_CLIENT_ID',
      clientSecretEnv: 'NOTION_CLIENT_SECRET',
      redirectUriEnv: 'NOTION_REDIRECT_URI',
      extraParams: { owner: 'user' },
      // Notion's token endpoint wants HTTP Basic auth (client_id:client_secret)
      // + a JSON body, not client_id/secret as form fields like every other
      // provider here — exchangeCode() branches on this flag.
      tokenAuthMethod: 'basic_json',
    },
    syncEndpoint: '/v1/users/me',
  },
  hubspot: {
    key: 'hubspot',
    name: 'HubSpot',
    category: 'Post Call',
    connectType: 'apikey',
    connectFields: [
      { name: 'accessToken', label: 'Private App Access Token', placeholder: 'pat-na1-...', type: 'password', help: 'Get from HubSpot → Settings → Integrations → Private Apps' },
    ],
    oauth: null,
    apiBaseUrl: 'https://api.hubapi.com',
    syncEndpoint: '/crm/v3/objects/contacts?limit=10&properties=email,firstname,lastname',
    verifyUrl: 'https://api.hubapi.com/crm/v3/objects/contacts?limit=1',
  },
  slack: {
    key: 'slack',
    name: 'Slack',
    category: 'Post Call',
    connectType: 'apikey',
    connectFields: [
      { name: 'botToken', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password', help: 'Get from api.slack.com/apps → OAuth & Permissions → Bot User OAuth Token' },
      { name: 'channelId', label: 'Default Channel ID (optional)', placeholder: 'C01234ABC', type: 'text', help: 'Channel to post notifications to' },
    ],
    oauth: null,
    apiBaseUrl: 'https://slack.com/api',
    syncEndpoint: '/auth.test',
    verifyUrl: 'https://slack.com/api/auth.test',
    webhookSigningSecretEnv: 'SLACK_SIGNING_SECRET',
  },
  twilio: {
    key: 'twilio',
    name: 'Twilio',
    category: 'During Call',
    connectType: 'apikey',
    connectFields: [
      { name: 'accountSid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxxx', type: 'text', help: 'Get from console.twilio.com' },
      { name: 'authToken', label: 'Auth Token', placeholder: 'your_auth_token', type: 'password', help: 'Get from console.twilio.com' },
    ],
    oauth: null,
    apiBaseUrl: 'https://api.twilio.com',
    syncEndpoint: '/2010-04-01/Accounts.json',
  },
  genesys: {
    key: 'genesys',
    name: 'Genesys',
    category: 'During Call',
    connectType: 'apikey',
    connectFields: [
      { name: 'clientId', label: 'OAuth Client ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type: 'text', help: 'Get from Genesys Cloud Admin → OAuth' },
      { name: 'clientSecret', label: 'OAuth Client Secret', placeholder: 'your_client_secret', type: 'password', help: 'Get from Genesys Cloud Admin → OAuth' },
      { name: 'region', label: 'Region', placeholder: 'mypurecloud.com', type: 'text', help: 'e.g. mypurecloud.com, mypurecloud.ie, mypurecloud.de' },
    ],
    oauth: null,
    syncEndpoint: '/api/v2/users/me',
  },
  make: {
    key: 'make',
    name: 'Make',
    category: 'Post Call',
    connectType: 'webhook',
    connectFields: [
      { name: 'webhookUrl', label: 'Make Webhook URL', placeholder: 'https://hook.eu1.make.com/...', type: 'url', help: 'Create a scenario in Make → add Webhooks module → copy the URL' },
    ],
    oauth: null,
  },
  zapier: {
    key: 'zapier',
    name: 'Zapier',
    category: 'Post Call',
    connectType: 'webhook',
    connectFields: [
      { name: 'webhookUrl', label: 'Zapier Webhook URL', placeholder: 'https://hooks.zapier.com/...', type: 'url', help: 'Create a Zap → Trigger: Webhooks by Zapier → copy the URL' },
    ],
    oauth: null,
  },
  n8n: {
    key: 'n8n',
    name: 'n8n',
    category: 'Post Call',
    connectType: 'webhook',
    connectFields: [
      { name: 'webhookUrl', label: 'n8n Webhook URL', placeholder: 'https://your-n8n.com/webhook/...', type: 'url', help: 'Add Webhook node in n8n → copy the production URL' },
    ],
    oauth: null,
  },
  ghl: {
    key: 'ghl',
    name: 'GoHighLevel',
    category: 'Post Call',
    connectType: 'webhook',
    connectFields: [
      { name: 'webhookUrl', label: 'GHL Webhook URL', placeholder: 'https://services.leadconnectorhq.com/...', type: 'url', help: 'In GHL → Settings → Integrations → Webhooks → Create' },
    ],
    oauth: null,
  },
  custom_api: {
    key: 'custom_api',
    name: 'Custom API',
    category: 'During Call',
    connectType: 'custom',
    connectFields: [
      { name: 'endpointUrl', label: 'Endpoint URL', placeholder: 'https://api.yoursite.com/endpoint', type: 'url', help: 'The API endpoint to call' },
      { name: 'method', label: 'HTTP Method', placeholder: 'POST', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], help: '' },
      { name: 'authType', label: 'Auth Type', placeholder: 'none', type: 'select', options: ['none', 'bearer', 'api_key'], help: '' },
      { name: 'authValue', label: 'Auth Token / API Key', placeholder: 'your_token_here', type: 'password', help: 'Leave blank if no auth' },
    ],
    oauth: null,
  },
};
export const INTEGRATION_ORDER = [
  'google_calendar',
  'google_meet',
  'google_sheets',
  'cal',
  'calendly',
  'salesforce',
  'zoho',
  'notion',
  'hubspot',
  'slack',
  'twilio',
  'genesys',
  'make',
  'zapier',
  'n8n',
  'ghl',
  'custom_api',
];

export const INTEGRATION_NAME_TO_KEY = Object.fromEntries(
  Object.values(INTEGRATION_PROVIDERS).map((provider) => [provider.name.toLowerCase(), provider.key])
);