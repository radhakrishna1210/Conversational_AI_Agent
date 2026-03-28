import fetch from 'node-fetch';
import { env } from '../config/env.js';
import logger from './logger.js';

const BASE = `https://graph.facebook.com/${env.META_API_VERSION}`;

export class MetaApiError extends Error {
  constructor(message, statusCode, metaError) {
    super(message);
    this.name = 'MetaApiError';
    this.statusCode = statusCode;
    this.metaError = metaError;
  }
}

const metaRequest = async (path, options = {}, accessToken) => {
  const token = accessToken;
  const url = `${BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    logger.warn({ url, status: res.status, error: data.error }, 'Meta API error');
    throw new MetaApiError(
      data.error?.message ?? 'Meta API request failed',
      res.status,
      data.error
    );
  }

  return data;
};

export const metaGet = (path, accessToken, params = {}) => {
  const query = new URLSearchParams(params).toString();
  return metaRequest(`${path}${query ? `?${query}` : ''}`, { method: 'GET' }, accessToken);
};

export const metaPost = (path, body, accessToken) =>
  metaRequest(path, { method: 'POST', body }, accessToken);

export const metaDelete = (path, accessToken) =>
  metaRequest(path, { method: 'DELETE' }, accessToken);

// Exchange short-lived code for long-lived token
export const exchangeCodeForToken = async (code, redirectUri) => {
  const url = `${BASE}/oauth/access_token?client_id=${env.META_APP_ID}&client_secret=${env.META_APP_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new MetaApiError(data.error.message, res.status, data.error);
  return data;
};
