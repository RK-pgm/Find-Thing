'use strict';

function buildWorkOrderImpact(workOrders, schoolId, categoryDefinitions = [
  { type: 'facility', label: 'อาคารหรืออุปกรณ์ชำรุด' },
  { type: 'cleanliness', label: 'ความสะอาด' },
  { type: 'safety', label: 'ปัญหาความปลอดภัย' },
], now = new Date()) {
  const visibleOrders = workOrders.filter((order) => !schoolId || order.schoolId === schoolId);
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const trend = Array.from({ length: 4 }, (_, index) => {
    const start = new Date(weekStart);
    start.setUTCDate(start.getUTCDate() - (3 - index) * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const lastDay = new Date(end.getTime() - 86400000);
    const label = `${start.getUTCDate()}/${start.getUTCMonth() + 1}–${lastDay.getUTCDate()}/${lastDay.getUTCMonth() + 1}`;
    return { label, start: start.toISOString(), end: end.toISOString(), created: 0, resolved: 0 };
  });
  const resolvedDurations = [];
  const categoryStats = categoryDefinitions.map(({ type, label }) => ({ type, label, total: 0, resolved: 0 }));

  for (const order of visibleOrders) {
    const category = categoryStats.find((entry) => entry.type === order.type);
    if (category) {
      category.total += 1;
      if (order.status === 'resolved') category.resolved += 1;
    }
    const createdAt = Date.parse(order.createdAt || '');
    if (Number.isFinite(createdAt)) {
      const bucket = trend.find((entry) => createdAt >= Date.parse(entry.start) && createdAt < Date.parse(entry.end));
      if (bucket) bucket.created += 1;
    }
    const resolvedEvents = (order.history || []).filter((event) => event.status === 'resolved' && Number.isFinite(Date.parse(event.at || '')));
    const resolvedEvent = resolvedEvents[resolvedEvents.length - 1];
    if (resolvedEvent) {
      const resolvedAt = Date.parse(resolvedEvent.at);
      if (order.status === 'resolved' && Number.isFinite(createdAt) && resolvedAt >= createdAt)
        resolvedDurations.push((resolvedAt - createdAt) / 3600000);
      const bucket = trend.find((entry) => resolvedAt >= Date.parse(entry.start) && resolvedAt < Date.parse(entry.end));
      if (bucket) bucket.resolved += 1;
    }
  }

  const resolvedWorkOrderCount = visibleOrders.filter((order) => order.status === 'resolved').length;
  const totalWorkOrderCount = visibleOrders.length;
  const maxTrendCount = Math.max(1, ...trend.flatMap((week) => [week.created, week.resolved]));
  return {
    totalWorkOrderCount,
    resolvedWorkOrderCount,
    activeWorkOrderCount: totalWorkOrderCount - resolvedWorkOrderCount,
    resolutionRatePercent: totalWorkOrderCount ? Math.round((resolvedWorkOrderCount / totalWorkOrderCount) * 100) : null,
    averageResolutionHours: resolvedDurations.length ? Math.round(resolvedDurations.reduce((sum, hours) => sum + hours, 0) / resolvedDurations.length) : null,
    categoryStats,
    trend: trend.map(({ label, created, resolved }) => ({ label, created, resolved, createdPercent: Math.round((created / maxTrendCount) * 100), resolvedPercent: Math.round((resolved / maxTrendCount) * 100) })),
  };
}

module.exports = { buildWorkOrderImpact };
