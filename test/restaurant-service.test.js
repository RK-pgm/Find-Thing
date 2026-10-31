'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRestaurantList, saveRestaurantRating, normalizeRestaurantMenuInputs } = require('../lib/restaurant-service');

function makeStore() {
  return {
    restaurants: [
      { id: 'school-a-shop', schoolId: 'school-a', name: 'ร้านข้าว', category: 'food', isActive: true, menus: [{ id: 'm1', name: 'ข้าวผัด', price: 35 }] },
      { id: 'school-a-hidden', schoolId: 'school-a', name: 'ร้านปิด', category: 'snack', isActive: false, menus: [] },
      { id: 'school-b-shop', schoolId: 'school-b', name: 'ร้านอื่น', category: 'drink', isActive: true, menus: [] },
    ],
    restaurantRatings: [
      { restaurantId: 'school-a-shop', schoolId: 'school-a', userId: 'u1', value: 4 },
      { restaurantId: 'school-a-shop', schoolId: 'school-a', userId: 'u2', value: 5 },
      { restaurantId: 'school-b-shop', schoolId: 'school-b', userId: 'u3', value: 1 },
    ],
  };
}

test('students see only active restaurants from their selected school and no voter identities', () => {
  const restaurants = buildRestaurantList(makeStore(), { schoolId: 'school-a', userId: 'u1' });
  assert.deepEqual(restaurants.map((entry) => entry.id), ['school-a-shop']);
  assert.equal(restaurants[0].ratingAverage, 4.5);
  assert.equal(restaurants[0].ratingCount, 2);
  assert.equal(restaurants[0].myRating, 4);
  assert.equal('userId' in restaurants[0], false);
  assert.equal('userId' in restaurants[0].menus[0], false);
});

test('admins can manage inactive shops but remain scoped to their school', () => {
  const restaurants = buildRestaurantList(makeStore(), { schoolId: 'school-a', includeInactive: true });
  assert.deepEqual(restaurants.map((entry) => entry.id), ['school-a-shop', 'school-a-hidden']);
  assert.equal(buildRestaurantList(makeStore(), { schoolId: '' }).length, 0);
});

test('a member can rate once and change their own rating without increasing the count', () => {
  const store = makeStore();
  const user = { id: 'u1', schoolId: 'school-a' };
  const result = saveRestaurantRating(store, user, 'school-a-shop', 2, '2026-10-31T10:00:00.000Z');
  assert.equal(result.ratingAverage, 3.5);
  assert.equal(result.ratingCount, 2);
  assert.equal(store.restaurantRatings.filter((entry) => entry.restaurantId === 'school-a-shop' && entry.userId === 'u1').length, 1);
});

test('ratings reject invalid stars and shops from another school', () => {
  const store = makeStore();
  assert.throws(() => saveRestaurantRating(store, { id: 'u1', schoolId: 'school-a' }, 'school-a-shop', 0), { status: 400 });
  assert.throws(() => saveRestaurantRating(store, { id: 'u1', schoolId: 'school-a' }, 'school-b-shop', 5), { status: 404 });
});

test('new shop menus and prices are normalized together and blank rows are ignored', () => {
  assert.deepEqual(normalizeRestaurantMenuInputs([
    { name: '', price: '' },
    { name: 'ข้าวผัด', price: '45' },
    { name: 'ชาเย็น', price: '25.50' },
  ]), [
    { name: 'ข้าวผัด', price: 45 },
    { name: 'ชาเย็น', price: 25.5 },
  ]);
  assert.deepEqual(normalizeRestaurantMenuInputs(undefined), []);
});

test('new shop menus reject missing prices, invalid amounts, and oversized lists', () => {
  assert.throws(() => normalizeRestaurantMenuInputs([{ name: 'ข้าวผัด', price: '' }]), { status: 400 });
  assert.throws(() => normalizeRestaurantMenuInputs([{ name: 'ข้าวผัด', price: '-1' }]), { status: 400 });
  assert.throws(() => normalizeRestaurantMenuInputs(Array.from({ length: 101 }, () => ({ name: 'ข้าวผัด', price: '40' }))), { status: 400 });
});
