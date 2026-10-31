'use strict';
const crypto = require('node:crypto');

function buildRestaurantList(store, { schoolId, userId = '', includeInactive = false } = {}) {
  if (!schoolId) return [];
  return store.restaurants
    .filter((restaurant) => restaurant.schoolId === schoolId && (includeInactive || restaurant.isActive !== false))
    .sort((left, right) => left.name.localeCompare(right.name, 'th'))
    .map((restaurant) => {
      const ratings = store.restaurantRatings.filter((rating) => rating.restaurantId === restaurant.id && rating.schoolId === schoolId);
      const ratingTotal = ratings.reduce((sum, rating) => sum + rating.value, 0);
      return {
        id: restaurant.id,
        schoolId: restaurant.schoolId,
        ...(restaurant.schoolName ? { schoolName: restaurant.schoolName } : {}),
        name: restaurant.name,
        category: restaurant.category,
        location: restaurant.location || '',
        description: restaurant.description || '',
        isActive: restaurant.isActive !== false,
        menus: (Array.isArray(restaurant.menus) ? restaurant.menus : []).map(({ id, name, price, createdAt, updatedAt }) => ({ id, name, price, ...(includeInactive ? { createdAt, updatedAt } : {}) })),
        ratingAverage: ratings.length ? Math.round((ratingTotal / ratings.length) * 10) / 10 : null,
        ratingCount: ratings.length,
        ...(userId ? { myRating: ratings.find((rating) => rating.userId === userId)?.value || 0 } : {}),
        ...(includeInactive ? { createdAt: restaurant.createdAt, updatedAt: restaurant.updatedAt } : {}),
      };
    });
}

function saveRestaurantRating(store, user, restaurantId, value, now = new Date().toISOString()) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    const error = new Error('คะแนนรีวิวต้องอยู่ระหว่าง 1 ถึง 5 ดาว'); error.status = 400; throw error;
  }
  if (!user.schoolId) {
    const error = new Error('เลือกโรงเรียนในโปรไฟล์ก่อนให้คะแนนร้านอาหาร'); error.status = 403; throw error;
  }
  const restaurant = store.restaurants.find((entry) => entry.id === restaurantId && entry.schoolId === user.schoolId && entry.isActive !== false);
  if (!restaurant) {
    const error = new Error('ไม่พบร้านอาหารในชุมชนโรงเรียนของคุณ'); error.status = 404; throw error;
  }
  let rating = store.restaurantRatings.find((entry) => entry.restaurantId === restaurantId && entry.userId === user.id);
  if (rating) { rating.value = value; rating.updatedAt = now; }
  else store.restaurantRatings.push({ id: crypto.randomUUID(), restaurantId, schoolId: user.schoolId, userId: user.id, value, createdAt: now, updatedAt: now });
  const ratings = store.restaurantRatings.filter((entry) => entry.restaurantId === restaurantId && entry.schoolId === user.schoolId);
  return {
    ok: true,
    ratingAverage: Math.round((ratings.reduce((sum, entry) => sum + entry.value, 0) / ratings.length) * 10) / 10,
    ratingCount: ratings.length,
    myRating: value,
  };
}

module.exports = { buildRestaurantList, saveRestaurantRating };
