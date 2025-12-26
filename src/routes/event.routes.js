const express = require('express');
const router = express.Router();
const eventService = require('../services/event.service');

/**
 * GET /api/v1/events/:id
 * Get event details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Event ID is required',
      });
    }

    const result = await eventService.getEventById(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error in get event by ID:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve event',
    });
  }
});

/**
 * GET /api/v1/events
 * Get all events with optional filters
 * Query params: status, categoryId, limit
 */
router.get('/', async (req, res) => {
  try {
    const { status, categoryId, limit } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (categoryId) filters.categoryId = categoryId;
    if (limit) filters.limit = parseInt(limit);

    const result = await eventService.getAllEvents(filters);

    res.json(result);
  } catch (error) {
    console.error('Error in get all events:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve events',
    });
  }
});

/**
 * GET /api/v1/events/category/:categoryId
 * Get events by category
 */
router.get('/category/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Category ID is required',
      });
    }

    const result = await eventService.getEventsByCategory(categoryId);

    res.json(result);
  } catch (error) {
    console.error('Error in get events by category:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve events',
    });
  }
});

/**
 * GET /api/v1/events/upcoming
 * Get upcoming events
 */
router.get('/upcoming/list', async (req, res) => {
  try {
    const { limit } = req.query;

    const result = await eventService.getUpcomingEvents(
      limit ? parseInt(limit) : 20
    );

    res.json(result);
  } catch (error) {
    console.error('Error in get upcoming events:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve upcoming events',
    });
  }
});

/**
 * GET /api/v1/categories
 * Get all categories
 */
router.get('/categories/all', async (req, res) => {
  try {
    const result = await eventService.getAllCategories();

    res.json(result);
  } catch (error) {
    console.error('Error in get categories:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve categories',
    });
  }
});

module.exports = router;
