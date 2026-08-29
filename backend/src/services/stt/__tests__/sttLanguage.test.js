// The bug these pin: the agent editor stores a DISPLAY NAME ("Hindi"), and the
// batch transcriber handed that straight to Sarvam as `language_code`. Sarvam
// answered HTTP 400 with the list of codes it actually takes, so the fallback
// failed the whole turn — and had therefore never once worked for an agent with
// a specific language set. Only "Multi" appeared to work, because there the
// field was omitted entirely and the failure stayed invisible.
//
// Deepgram had a mapper for exactly this. Sarvam had none. The two now share one
// table, because a second map living beside a second provider is how the first
// one came to be missing.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDeepgramLanguage,
  toSarvamLanguage,
  SARVAM_AUTODETECT,
  STT_LANGUAGES,
} from '../sttLanguage.js';

describe('toSarvamLanguage', () => {
  test('maps the display names the editor actually stores', () => {
    // These four are the entire dropdown in the agent editor.
    assert.equal(toSarvamLanguage('Hindi'), 'hi-IN');
    assert.equal(toSarvamLanguage('English'), 'en-IN');
    assert.equal(toSarvamLanguage('Tamil'), 'ta-IN');
    assert.equal(toSarvamLanguage('Multi'), SARVAM_AUTODETECT);
  });

  test('never returns a value Sarvam would reject', () => {
    // The whole failure mode was a hard 400 on an unexpected value. Anything
    // this function cannot place must degrade to auto-detect, never to the
    // input, and never to undefined.
    const accepted = /^(unknown|[a-z]{2,3}-IN)$/;
    for (const input of ['Hindi', 'Klingon', '', null, undefined, 42, 'Spanish', 'zz', {}, []]) {
      const out = toSarvamLanguage(input);
      assert.match(out, accepted, `"${String(input)}" produced "${out}"`);
    }
  });

  test('a language Sarvam does not serve becomes auto-detect, not a 400', () => {
    assert.equal(toSarvamLanguage('Spanish'), SARVAM_AUTODETECT);
    assert.equal(toSarvamLanguage('Japanese'), SARVAM_AUTODETECT);
  });

  test('passes an Indian locale straight through, normalising its case', () => {
    assert.equal(toSarvamLanguage('hi-IN'), 'hi-IN');
    assert.equal(toSarvamLanguage('ta-in'), 'ta-IN');
    assert.equal(toSarvamLanguage('kok-IN'), 'kok-IN');
  });

  test('promotes a bare code only when the table knows that language', () => {
    // "hi" is unambiguous; inventing "zz-IN" from an unknown code is not.
    assert.equal(toSarvamLanguage('hi'), 'hi-IN');
    assert.equal(toSarvamLanguage('ta'), 'ta-IN');
    assert.equal(toSarvamLanguage('zz'), SARVAM_AUTODETECT);
  });
});

describe('toDeepgramLanguage', () => {
  test('still behaves as it did before the table was shared', () => {
    assert.equal(toDeepgramLanguage('Hindi'), 'hi');
    assert.equal(toDeepgramLanguage('Multi'), 'multi');
    assert.equal(toDeepgramLanguage('English (Indian)'), 'en-IN');
    assert.equal(toDeepgramLanguage('hi'), 'hi');
    assert.equal(toDeepgramLanguage('en-GB'), 'en-GB');
    assert.equal(toDeepgramLanguage(''), undefined);
    assert.equal(toDeepgramLanguage(undefined), undefined);
  });

  test('an unknown language is undefined, so the caller can omit the param', () => {
    // Deliberately unlike Sarvam: Deepgram treats a missing language as
    // "detect", and guessing wrong there degrades the transcript silently.
    assert.equal(toDeepgramLanguage('Klingon'), undefined);
  });
});

describe('the shared table', () => {
  test('every entry serves at least one provider', () => {
    for (const [name, entry] of Object.entries(STT_LANGUAGES)) {
      assert.ok(entry.deepgram || entry.sarvam, `"${name}" maps to nothing at all`);
    }
  });

  test('every Sarvam code is an Indian locale or the auto-detect value', () => {
    // Sarvam publishes Indian locales only. A bare "hi" or an "es-ES" here would
    // be the same 400 this file exists to prevent, just further from the log.
    for (const [name, entry] of Object.entries(STT_LANGUAGES)) {
      if (!entry.sarvam) continue;
      assert.match(entry.sarvam, /^(unknown|[a-z]{2,3}-IN)$/, `"${name}" → "${entry.sarvam}"`);
    }
  });

  test('the editor’s four options are all present', () => {
    for (const name of ['multi', 'english', 'hindi', 'tamil']) {
      assert.ok(STT_LANGUAGES[name], `the editor offers "${name}" but the table has no entry`);
    }
  });
});
