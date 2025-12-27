/**
 * Models Index
 * Central export point for all DynamoDB models
 */

const EventModel = require('./event.model');
const BookingModel = require('./booking.model');
const UserModel = require('./user.model');
const CategoryModel = require('./category.model');

module.exports = {
  EventModel,
  BookingModel,
  UserModel,
  CategoryModel,
};
