// backend/src/services/voice/deterministicStateMachine.js
/**
 * Deterministic State Machine for Critical Structured Flows
 *
 * Prevents LLM hallucinations during sensitive data collection (OTPs, credit cards,
 * account numbers, zip codes) by locking the dialogue into deterministic slot-filling mode.
 */

/**
 * Validates a credit card number using Luhn algorithm.
 */
export function validateLuhn(numberStr) {
  const digits = String(numberStr).replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Creates a deterministic state machine for a specific workflow (e.g. OTP verification or card capture).
 *
 * @param {object} schema
 * @param {Array<{ name: string, prompt: string, type: 'otp'|'card'|'digits'|'text', length?: number, validate?: (v: string) => boolean }>} schema.slots
 * @param {Function} [schema.onComplete]
 */
export function createDeterministicStateMachine(schema) {
  const slots = schema.slots || [];
  let currentSlotIndex = 0;
  const collectedValues = {};
  let completed = false;

  function getCurrentPrompt() {
    if (completed || currentSlotIndex >= slots.length) {
      return null;
    }
    return slots[currentSlotIndex].prompt;
  }

  function processUserInput(input) {
    if (completed || currentSlotIndex >= slots.length) {
      return { status: 'already_completed', collected: { ...collectedValues } };
    }

    const currentSlot = slots[currentSlotIndex];
    const raw = String(input || '').trim();
    const digitsOnly = raw.replace(/\D/g, '');

    let isValid = false;
    let extractedValue = raw;

    switch (currentSlot.type) {
      case 'otp': {
        const expectedLen = currentSlot.length || 6;
        if (digitsOnly.length === expectedLen) {
          isValid = true;
          extractedValue = digitsOnly;
        }
        break;
      }
      case 'card': {
        if (validateLuhn(digitsOnly)) {
          isValid = true;
          extractedValue = digitsOnly;
        }
        break;
      }
      case 'digits': {
        const expectedLen = currentSlot.length;
        if (!expectedLen || digitsOnly.length === expectedLen) {
          isValid = digitsOnly.length > 0;
          extractedValue = digitsOnly;
        }
        break;
      }
      case 'text':
      default: {
        isValid = raw.length >= (currentSlot.minLength || 1);
        extractedValue = raw;
        break;
      }
    }

    if (currentSlot.validate && isValid) {
      isValid = Boolean(currentSlot.validate(extractedValue));
    }

    if (!isValid) {
      return {
        status: 'retry',
        slot: currentSlot.name,
        prompt: `I didn't quite catch that. ${currentSlot.prompt}`,
        collected: { ...collectedValues },
      };
    }

    // Valid slot filled
    collectedValues[currentSlot.name] = extractedValue;
    currentSlotIndex++;

    if (currentSlotIndex >= slots.length) {
      completed = true;
      if (schema.onComplete) {
        schema.onComplete(collectedValues);
      }
      return {
        status: 'completed',
        collected: { ...collectedValues },
        prompt: schema.completionMessage || 'Thank you, I have verified all the details.',
      };
    }

    return {
      status: 'advance',
      slot: slots[currentSlotIndex].name,
      prompt: slots[currentSlotIndex].prompt,
      collected: { ...collectedValues },
    };
  }

  return {
    isLocked: () => !completed && currentSlotIndex < slots.length,
    getCurrentPrompt,
    processUserInput,
    getCollected: () => ({ ...collectedValues }),
  };
}
