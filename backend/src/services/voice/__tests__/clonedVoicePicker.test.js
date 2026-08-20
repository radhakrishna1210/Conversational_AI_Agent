// Cloned voices in the agent voice picker.
//
// A clone is stored under the synthetic 'Custom' provider and owned by ONE
// workspace, so the picker has to do two things no other voice needs: match it
// by the provider that will really speak it (so it lands in that provider's
// tab), and keep it inside its own tenant. It also has to lead the list, which
// is a paging problem, not a sorting one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { clonedVoiceFilter, pageAcrossGroups, resolveSynthesisTarget } from '../../voice.service.js';

const ALL = ['Google', 'ElevenLabs', 'Sarvam', 'Cartesia', 'FishAudio'];

describe('clonedVoiceFilter', () => {
  test('matches this workspace\'s clones on either cloning provider', () => {
    const f = clonedVoiceFilter(ALL, 'ws-1');
    assert.equal(f.provider.name, 'Custom');
    assert.equal(f.workspaceId, 'ws-1');
    assert.deepEqual(
      f.OR.map((c) => c.metadata.contains),
      ['"clonedProvider":"elevenlabs"', '"clonedProvider":"fishaudio"'],
    );
  });

  test('a provider tab shows only the clones that provider will speak', () => {
    // A Fish-hosted clone in the ElevenLabs tab would misstate who serves it.
    assert.deepEqual(
      clonedVoiceFilter(['FishAudio'], 'ws-1').OR.map((c) => c.metadata.contains),
      ['"clonedProvider":"fishaudio"'],
    );
    // Tabs that cannot host a clone show none.
    assert.equal(clonedVoiceFilter(['Google'], 'ws-1'), null);
  });

  test('never exposes clones without a workspace to scope them to', () => {
    assert.equal(clonedVoiceFilter(ALL, undefined), null);
  });
});

describe('pageAcrossGroups — clones lead, library follows', () => {
  const limit = 20;

  test('page 1 with few clones is clones then library', () => {
    const s = pageAcrossGroups({ skip: 0, limit, firstTotal: 3 });
    assert.deepEqual(s, { firstSkip: 0, firstTake: 3, secondSkip: 0 });
  });

  test('a page straddling the boundary takes the rest of the clones', () => {
    // 25 clones, page 2 (skip 20): 5 clones left, then the library starts.
    const s = pageAcrossGroups({ skip: 20, limit, firstTotal: 25 });
    assert.deepEqual(s, { firstSkip: 20, firstTake: 5, secondSkip: 0 });
  });

  test('pages past the clones read the library from the right offset', () => {
    const s = pageAcrossGroups({ skip: 40, limit, firstTotal: 3 });
    assert.deepEqual(s, { firstSkip: 3, firstTake: 0, secondSkip: 37 });
  });

  test('no clones at all leaves library paging untouched', () => {
    assert.deepEqual(
      pageAcrossGroups({ skip: 60, limit, firstTotal: 0 }),
      { firstSkip: 0, firstTake: 0, secondSkip: 60 },
    );
  });
});

describe('resolveSynthesisTarget — what the pipeline will actually call', () => {
  const customVoice = (meta) => ({
    provider: { name: 'Custom' },
    providerVoiceId: 'custom-ws-1-123',
    metadata: JSON.stringify(meta),
  });

  test('a trained clone is spoken by its host provider, not by "Custom"', () => {
    const t = resolveSynthesisTarget(customVoice({
      status: 'cloned', clonedProvider: 'fishaudio', clonedVoiceId: 'fish-model-1',
    }));
    assert.equal(t.providerName, 'FishAudio');
    assert.equal(t.providerVoiceId, 'fish-model-1');
  });

  test('a sample-only voice refuses to synthesize instead of speaking wrong', () => {
    assert.throws(
      () => resolveSynthesisTarget(customVoice({ status: 'sample_only', samplePath: 'a.webm' })),
      (err) => err.statusCode === 409,
    );
  });
});
