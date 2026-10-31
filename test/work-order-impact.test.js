'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkOrderImpact } = require('../lib/work-order-impact');

const NOW = new Date('2026-10-31T12:00:00.000Z');

test('calculates school-scoped completion and resolution time from persisted history', () => {
  const impact = buildWorkOrderImpact([
    {
      schoolId: 'thung-song', type: 'facility', status: 'resolved', createdAt: '2026-10-30T08:00:00.000Z',
      history: [{ status: 'resolved', at: '2026-10-31T08:00:00.000Z' }],
    },
    {
      schoolId: 'thung-song', type: 'safety', status: 'in_progress', createdAt: '2026-10-29T08:00:00.000Z',
      history: [{ status: 'resolved', at: '2026-10-30T08:00:00.000Z' }, { status: 'in_progress', at: '2026-10-31T08:00:00.000Z' }],
    },
    {
      schoolId: 'hamster-hub', type: 'cleanliness', status: 'resolved', createdAt: '2026-10-30T08:00:00.000Z',
      history: [{ status: 'resolved', at: '2026-10-30T09:00:00.000Z' }],
    },
  ], 'thung-song', undefined, NOW);

  assert.equal(impact.totalWorkOrderCount, 2);
  assert.equal(impact.resolvedWorkOrderCount, 1);
  assert.equal(impact.activeWorkOrderCount, 1);
  assert.equal(impact.resolutionRatePercent, 50);
  assert.equal(impact.averageResolutionHours, 24);
  assert.equal(impact.categoryStats.find((row) => row.type === 'facility').resolved, 1);
  assert.equal(impact.categoryStats.find((row) => row.type === 'cleanliness').total, 0);
  assert.deepEqual(impact.trend.at(-1), { label: '26/10–1/11', created: 2, resolved: 2, createdPercent: 100, resolvedPercent: 100 });
});

test('returns honest empty states and an undefined rate when no work orders exist', () => {
  const impact = buildWorkOrderImpact([], 'thung-song', undefined, NOW);
  assert.equal(impact.totalWorkOrderCount, 0);
  assert.equal(impact.resolutionRatePercent, null);
  assert.equal(impact.averageResolutionHours, null);
  assert.equal(impact.categoryStats.reduce((sum, row) => sum + row.total, 0), 0);
  assert.equal(impact.trend.length, 4);
  assert.ok(impact.trend.every((week) => week.created === 0 && week.resolved === 0));
});

test('includes all schools only when the administrator has no school scope', () => {
  const orders = [
    { schoolId: 'thung-song', type: 'facility', status: 'received' },
    { schoolId: 'hamster-hub', type: 'safety', status: 'received' },
  ];
  assert.equal(buildWorkOrderImpact(orders, '').totalWorkOrderCount, 2);
});
