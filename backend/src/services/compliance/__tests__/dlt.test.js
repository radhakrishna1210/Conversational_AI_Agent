import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyNumberSeries,
  describeSeries,
  evaluateCompliance,
  firstBlockingReason,
  isIndianNumber,
  parsePeId,
  seriesPermitsUseCase,
} from '../dlt.js';
import {
  CARRIER_APPLICATION_STATUS,
  CHECK_STATUS,
  DOCUMENT_KIND,
  DOCUMENT_STATUS,
  HEADER_STATUS,
  NUMBER_SERIES,
  PE_STATUS,
  TEMPLATE_STATUS,
  TM_BINDING_STATUS,
  USE_CASE,
  VOICE_NUMBER_STATUS,
} from '../../../constants/compliance.js';

describe('parsePeId', () => {
  test('identifies the issuing portal from the prefix', () => {
    assert.equal(parsePeId('1001234567890123456').operator.code, 'AIRTEL');
    assert.equal(parsePeId('1101234567890123456').operator.code, 'VI');
    assert.equal(parsePeId('1201234567890123456').operator.code, 'JIO');
    assert.equal(parsePeId('1301234567890123456').operator.code, 'PINGCONNECT');
    assert.equal(parsePeId('1401234567890123456').operator.code, 'BSNL');
    assert.equal(parsePeId('1601234567890123456').operator.code, 'TATA');
    assert.equal(parsePeId('1701234567890123456').operator.code, 'SMARTPING');
  });

  test('tolerates spaces and hyphens from copy-paste', () => {
    const r = parsePeId(' 1001234-567890 123456 ');
    assert.equal(r.ok, true);
    assert.equal(r.peId, '1001234567890123456');
  });

  test('rejects wrong lengths and says which way it is wrong', () => {
    const short = parsePeId('100123456789012345');
    assert.equal(short.ok, false);
    assert.match(short.error, /18/);

    assert.equal(parsePeId('10012345678901234567').ok, false);
    assert.equal(parsePeId('').ok, false);
  });

  test('rejects non-numeric input', () => {
    assert.equal(parsePeId('100ABC4567890123456').ok, false);
  });

  // The operator table is not constitutional — refusing a legitimate PE ID
  // because TRAI added a provider is worse than accepting an unknown prefix.
  test('accepts an unknown prefix but warns', () => {
    const r = parsePeId('9991234567890123456');
    assert.equal(r.ok, true);
    assert.equal(r.operator, null);
    assert.ok(r.warning);
  });
});

describe('classifyNumberSeries', () => {
  test('recognises the two series that are decidable from the digits', () => {
    assert.equal(classifyNumberSeries('+911402345678'), NUMBER_SERIES.PROMOTIONAL_140);
    assert.equal(classifyNumberSeries('+9116001234567'), NUMBER_SERIES.BFSI_1600);
  });

  test('flags a plain mobile CLI, which is never compliant for commercial outbound', () => {
    assert.equal(classifyNumberSeries('+919876543210'), NUMBER_SERIES.MOBILE);
    assert.equal(classifyNumberSeries('+917012345678'), NUMBER_SERIES.MOBILE);
  });

  // Bengaluru landlines are 80xxxxxxxx and mobile numbers also start with 8.
  // Guessing here would mislabel real numbers, so UNKNOWN is the honest answer
  // and the provisioning record is what carries the truth.
  test('returns UNKNOWN where landline and mobile ranges overlap', () => {
    assert.equal(classifyNumberSeries('+918041234567'), NUMBER_SERIES.UNKNOWN);
    assert.equal(classifyNumberSeries('+912212345678'), NUMBER_SERIES.UNKNOWN);
  });

  test('returns null for non-Indian numbers — DLT does not apply', () => {
    assert.equal(classifyNumberSeries('+14155551234'), null);
    assert.equal(classifyNumberSeries(''), null);
    assert.equal(classifyNumberSeries(undefined), null);
  });
});

describe('isIndianNumber', () => {
  test('only +91 E.164 counts', () => {
    assert.equal(isIndianNumber('+919876543210'), true);
    assert.equal(isIndianNumber('+1 415 555 1234'), false);
    assert.equal(isIndianNumber('9876543210'), false);
    assert.equal(isIndianNumber(null), false);
  });
});

describe('seriesPermitsUseCase', () => {
  test('promotional traffic requires a 140-series number', () => {
    assert.equal(seriesPermitsUseCase(NUMBER_SERIES.PROMOTIONAL_140, USE_CASE.PROMOTIONAL), true);
    assert.equal(seriesPermitsUseCase(NUMBER_SERIES.TRANSACTIONAL_LANDLINE, USE_CASE.PROMOTIONAL), false);
    assert.equal(seriesPermitsUseCase(NUMBER_SERIES.BFSI_1600, USE_CASE.PROMOTIONAL), false);
  });

  test('service/transactional traffic accepts landline or 1600', () => {
    assert.equal(seriesPermitsUseCase(NUMBER_SERIES.TRANSACTIONAL_LANDLINE, USE_CASE.TRANSACTIONAL), true);
    assert.equal(seriesPermitsUseCase(NUMBER_SERIES.BFSI_1600, USE_CASE.TRANSACTIONAL), true);
    assert.equal(seriesPermitsUseCase(NUMBER_SERIES.PROMOTIONAL_140, USE_CASE.TRANSACTIONAL), false);
  });

  test('a mobile or unknown series permits nothing', () => {
    for (const useCase of Object.values(USE_CASE)) {
      assert.equal(seriesPermitsUseCase(NUMBER_SERIES.MOBILE, useCase), false);
      assert.equal(seriesPermitsUseCase(NUMBER_SERIES.UNKNOWN, useCase), false);
    }
  });

  test('an undeclared use case permits nothing', () => {
    assert.equal(seriesPermitsUseCase(NUMBER_SERIES.PROMOTIONAL_140, null), false);
  });
});

// A workspace that has cleared every step. Individual tests break one thing.
const compliantState = () => ({
  suspended: false,
  useCase: USE_CASE.PROMOTIONAL,
  documents: [
    { kind: DOCUMENT_KIND.COI, status: DOCUMENT_STATUS.ACCEPTED },
    { kind: DOCUMENT_KIND.GST, status: DOCUMENT_STATUS.ACCEPTED },
  ],
  carrierApplicationStatus: CARRIER_APPLICATION_STATUS.APPROVED,
  peId: '1001234567890123456',
  peStatus: PE_STATUS.VERIFIED,
  tmBindingStatus: TM_BINDING_STATUS.BOUND,
  templates: [{ status: TEMPLATE_STATUS.APPROVED }],
  numbers: [{
    phoneNumber: '+911402345678',
    series: NUMBER_SERIES.PROMOTIONAL_140,
    headerStatus: HEADER_STATUS.REGISTERED,
    status: VOICE_NUMBER_STATUS.ACTIVE,
  }],
});

const itemFor = (evaluation, key) => evaluation.checklist.find((c) => c.key === key);

describe('evaluateCompliance', () => {
  test('a fully onboarded workspace is ready with nothing blocking', () => {
    const result = evaluateCompliance(compliantState());
    assert.equal(result.ready, true);
    assert.equal(result.blocking.length, 0);
    assert.equal(firstBlockingReason(result), null);
  });

  test('an empty workspace is not ready and reports every step as todo', () => {
    const result = evaluateCompliance({});
    assert.equal(result.ready, false);
    assert.ok(result.blocking.length >= 7);
    assert.equal(itemFor(result, 'use_case').status, CHECK_STATUS.TODO);
    assert.equal(itemFor(result, 'pe_registration').status, CHECK_STATUS.TODO);
    assert.ok(firstBlockingReason(result));
  });

  test('a suspended workspace is never ready, however complete the checklist', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      suspended: true,
      suspendedReason: 'Opt-out complaints',
    });
    assert.equal(result.ready, false);
    assert.equal(result.blocking.length, 0, 'checklist itself is complete');
    assert.match(firstBlockingReason(result), /suspended.*Opt-out complaints/);
  });

  test('either business-registration document satisfies the group', () => {
    for (const kind of [DOCUMENT_KIND.COI, DOCUMENT_KIND.UDYAM]) {
      const result = evaluateCompliance({
        ...compliantState(),
        documents: [
          { kind, status: DOCUMENT_STATUS.ACCEPTED },
          { kind: DOCUMENT_KIND.PAN, status: DOCUMENT_STATUS.ACCEPTED },
        ],
      });
      assert.equal(itemFor(result, 'business_registration').status, CHECK_STATUS.COMPLETE, kind);
      assert.equal(result.ready, true, kind);
    }
  });

  test('an uploaded but unreviewed document is waiting, not complete', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      documents: [
        { kind: DOCUMENT_KIND.COI, status: DOCUMENT_STATUS.UPLOADED },
        { kind: DOCUMENT_KIND.PAN, status: DOCUMENT_STATUS.ACCEPTED },
      ],
    });
    assert.equal(itemFor(result, 'business_registration').status, CHECK_STATUS.WAITING);
    assert.equal(result.ready, false);
  });

  test('a rejected document asks the client to re-upload', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      documents: [
        { kind: DOCUMENT_KIND.COI, status: DOCUMENT_STATUS.REJECTED },
        { kind: DOCUMENT_KIND.PAN, status: DOCUMENT_STATUS.ACCEPTED },
      ],
    });
    const item = itemFor(result, 'business_registration');
    assert.equal(item.status, CHECK_STATUS.REJECTED);
    assert.equal(item.actor, 'client');
  });

  // A verified PE with no telemarketer binding is the failure that looks fine
  // on paper: the client is registered, we have infrastructure, and nothing
  // connects the two — so the traffic is unregistered.
  test('a verified PE without TM binding still blocks', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      tmBindingStatus: TM_BINDING_STATUS.NOT_BOUND,
    });
    assert.equal(result.ready, false);
    assert.equal(itemFor(result, 'tm_binding').status, CHECK_STATUS.TODO);
  });

  test('a PE ID that is recorded but not yet confirmed is waiting', () => {
    const result = evaluateCompliance({ ...compliantState(), peStatus: PE_STATUS.SUBMITTED });
    assert.equal(result.ready, false);
    assert.equal(itemFor(result, 'pe_registration').status, CHECK_STATUS.WAITING);
  });

  test('a landline number cannot carry promotional traffic', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      useCase: USE_CASE.PROMOTIONAL,
      numbers: [{
        phoneNumber: '+918041234567',
        series: NUMBER_SERIES.TRANSACTIONAL_LANDLINE,
        headerStatus: HEADER_STATUS.REGISTERED,
        status: VOICE_NUMBER_STATUS.ACTIVE,
      }],
    });
    assert.equal(result.ready, false);
    const item = itemFor(result, 'number_assigned');
    assert.equal(item.status, CHECK_STATUS.REJECTED);
    assert.match(item.detail, /does not permit/);
  });

  test('a 140 number cannot carry service/transactional traffic either', () => {
    const result = evaluateCompliance({ ...compliantState(), useCase: USE_CASE.TRANSACTIONAL });
    assert.equal(result.ready, false);
    assert.equal(itemFor(result, 'number_assigned').status, CHECK_STATUS.REJECTED);
  });

  test('a released number does not count as assigned', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      numbers: [{
        phoneNumber: '+911402345678',
        series: NUMBER_SERIES.PROMOTIONAL_140,
        headerStatus: HEADER_STATUS.REGISTERED,
        status: VOICE_NUMBER_STATUS.RELEASED,
      }],
    });
    assert.equal(result.ready, false);
    assert.equal(itemFor(result, 'number_assigned').status, CHECK_STATUS.TODO);
  });

  test('a correct number whose header is unregistered still blocks', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      numbers: [{
        phoneNumber: '+911402345678',
        series: NUMBER_SERIES.PROMOTIONAL_140,
        headerStatus: HEADER_STATUS.NOT_REGISTERED,
        status: VOICE_NUMBER_STATUS.ACTIVE,
      }],
    });
    assert.equal(result.ready, false);
    assert.equal(itemFor(result, 'number_assigned').status, CHECK_STATUS.COMPLETE);
    assert.equal(itemFor(result, 'header_registered').status, CHECK_STATUS.TODO);
  });

  test('a template that is only submitted is not an approved template', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      templates: [{ status: TEMPLATE_STATUS.SUBMITTED }],
    });
    assert.equal(result.ready, false);
    assert.equal(itemFor(result, 'voice_template').status, CHECK_STATUS.WAITING);
  });

  test('a rejected carrier application surfaces the carrier reason', () => {
    const result = evaluateCompliance({
      ...compliantState(),
      carrierApplicationStatus: CARRIER_APPLICATION_STATUS.REJECTED,
      carrierRejectionReason: 'GST certificate illegible',
    });
    assert.equal(result.ready, false);
    assert.match(itemFor(result, 'carrier_application').detail, /illegible/);
  });

  test('the checklist is stable in shape so the UI can render it directly', () => {
    for (const item of evaluateCompliance({}).checklist) {
      assert.equal(typeof item.key, 'string');
      assert.equal(typeof item.label, 'string');
      assert.ok(Object.values(CHECK_STATUS).includes(item.status));
      assert.equal(typeof item.actor, 'string');
    }
  });
});

describe('describeSeries', () => {
  test('names every series in language an operator would use', () => {
    assert.match(describeSeries(NUMBER_SERIES.PROMOTIONAL_140), /140/);
    assert.match(describeSeries(NUMBER_SERIES.BFSI_1600), /1600/);
    assert.match(describeSeries(NUMBER_SERIES.TRANSACTIONAL_LANDLINE), /landline/);
    assert.match(describeSeries(NUMBER_SERIES.MOBILE), /mobile/);
    assert.match(describeSeries('anything else'), /unrecognised/);
  });
});
