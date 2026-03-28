import prisma from '../config/prisma.js';
import { metaGet, metaPost } from './metaApi.js';
import logger from './logger.js';
import { env } from '../config/env.js';
import { decryptToken } from './encryption.js';

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AssignedNumberResult
 * @property {string} phoneNumber
 * @property {string} phoneNumberId
 * @property {string} wabaId
 * @property {string} accessToken        Decrypted — ready for immediate API use
 * @property {string|null} displayName
 */

/**
 * @typedef {Object} NumberHealthResult
 * @property {string} qualityRating      e.g. "GREEN" | "YELLOW" | "RED"
 * @property {string} messagingLimit     Meta messaging_limit_tier value
 * @property {string} displayName        Verified display name
 * @property {string} status             Meta number status
 */

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Create a sub-WABA under the master Meta Business Account for a workspace,
 * then persist the returned waba_id to the Workspace record.
 *
 * @param {string} workspaceId
 * @param {string} businessName
 * @returns {Promise<string>} waba_id
 */
export const createSubWABA = async (workspaceId, businessName) => {
  logger.info({ workspaceId, businessName }, 'Creating sub-WABA');

  const data = await metaPost(
    `/${env.META_BUSINESS_ID}/owned_whatsapp_business_accounts`,
    { name: businessName, timezone_id: 'Asia/Kolkata', currency: 'INR' },
    env.META_SYSTEM_USER_TOKEN
  );

  const wabaId = data.id;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { wabaId },
  });

  logger.info({ workspaceId, businessName, wabaId }, 'Sub-WABA created');
  return wabaId;
};

/**
 * Find the first AVAILABLE number in the pool, atomically mark it ASSIGNED,
 * update the Workspace flag, and upsert the WhatsappNumber record.
 *
 * @param {string} workspaceId
 * @param {string} wabaId
 * @returns {Promise<AssignedNumberResult>}
 */
export const assignNumberFromPool = async (workspaceId, wabaId) => {
  // Interactive transaction so findFirst + updateMany form one atomic unit,
  // preventing two concurrent requests from claiming the same pool entry.
  let poolEntry;

  await prisma.$transaction(async (tx) => {
    poolEntry = await tx.numberPool.findFirst({ where: { status: 'AVAILABLE' } });

    if (!poolEntry) {
      throw Object.assign(
        new Error('No numbers available. Please contact support.'),
        { statusCode: 503 }
      );
    }

    // Atomic claim — only proceeds if the row is still AVAILABLE at write time
    const { count } = await tx.numberPool.updateMany({
      where: { id: poolEntry.id, status: 'AVAILABLE' },
      data: { status: 'ASSIGNED', assignedTo: workspaceId },
    });

    if (count === 0) {
      throw Object.assign(
        new Error('No numbers available. Please contact support.'),
        { statusCode: 503 }
      );
    }

    await tx.workspace.update({
      where: { id: workspaceId },
      data: { numberAssigned: true },
    });

    await tx.whatsappNumber.upsert({
      where: {
        workspaceId_phoneNumber: { workspaceId, phoneNumber: poolEntry.phoneNumber },
      },
      create: {
        workspaceId,
        phoneNumber: poolEntry.phoneNumber,
        displayName: poolEntry.displayName ?? poolEntry.phoneNumber,
        metaPhoneNumberId: poolEntry.phoneNumberId,
        wabaId,
        accessToken: poolEntry.accessToken, // encrypted
        status: 'ACTIVE',
      },
      update: {
        metaPhoneNumberId: poolEntry.phoneNumberId,
        wabaId,
        accessToken: poolEntry.accessToken, // encrypted
        displayName: poolEntry.displayName ?? poolEntry.phoneNumber,
        status: 'ACTIVE',
      },
    });
  });

  // Decrypt outside the transaction to keep transaction duration minimal
  const accessToken = decryptToken(poolEntry.accessToken);

  logger.info(
    { workspaceId, phoneNumber: poolEntry.phoneNumber },
    'Number assigned from pool'
  );

  return {
    phoneNumber: poolEntry.phoneNumber,
    phoneNumberId: poolEntry.phoneNumberId,
    wabaId,
    accessToken, // decrypted — for immediate use by caller
    displayName: poolEntry.displayName,
  };
};

/**
 * Register a phone number under a WABA via the Meta API (triggers OTP delivery).
 *
 * @param {string} phoneNumber   Digits only, no country code prefix
 * @param {string} wabaId
 * @returns {Promise<string>}    phone_number_id returned by Meta
 */
export const registerNumber = async (phoneNumber, wabaId) => {
  logger.info({ phoneNumber, wabaId }, 'Registering phone number with Meta');

  const data = await metaPost(
    `/${wabaId}/phone_numbers`,
    { cc: '91', phone_number: phoneNumber, method: 'SMS' },
    env.META_SYSTEM_USER_TOKEN
  );

  const phoneNumberId = data.id;

  logger.info({ phoneNumber, wabaId, phoneNumberId }, 'Phone number registered');
  return phoneNumberId;
};

/**
 * Submit the OTP code received by the business to verify ownership.
 *
 * @param {string} phoneNumberId
 * @param {string} code
 * @returns {Promise<boolean>}
 */
export const verifyOTP = async (phoneNumberId, code) => {
  try {
    await metaPost(
      `/${phoneNumberId}/verify_code`,
      { code },
      env.META_SYSTEM_USER_TOKEN
    );
    logger.info({ phoneNumberId }, 'OTP verification succeeded');
    return true;
  } catch (err) {
    logger.warn({ phoneNumberId, error: err.message }, 'OTP verification failed');
    throw err;
  }
};

/**
 * Fetch quality rating, messaging limit tier, and status for a registered number.
 *
 * @param {string} phoneNumberId
 * @param {string} accessToken   Plain (decrypted) access token for this number
 * @returns {Promise<NumberHealthResult>}
 */
export const getNumberHealth = async (phoneNumberId, accessToken) => {
  const data = await metaGet(
    `/${phoneNumberId}`,
    accessToken,
    { fields: 'quality_rating,messaging_limit_tier,verified_name,status' }
  );

  /** @type {NumberHealthResult} */
  const result = {
    qualityRating: data.quality_rating ?? '',
    messagingLimit: data.messaging_limit_tier ?? '',
    displayName: data.display_name ?? data.verified_name ?? '',
    status: data.status ?? '',
  };

  logger.info({ phoneNumberId, ...result }, 'Number health fetched');
  return result;
};
