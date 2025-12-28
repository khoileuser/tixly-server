const express = require('express');
const router = express.Router();
const multer = require('multer');
const eventService = require('../services/event.service');
const categoryService = require('../services/category.service');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Configure multer for memory storage (files will be uploaded to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

/**
 * GET /api/v1/admin/events
 * Get all events for admin (including drafts)
 * Admin only
 */
router.get('/events', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status, search, limit, offset } = req.query;

    const filters = {
      status,
      search,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0,
    };

    const result = await eventService.getAdminEvents(filters);
    res.json(result);
  } catch (error) {
    console.error('Error in GET /admin/events:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve events',
    });
  }
});

/**
 * POST /api/v1/admin/events
 * Create a new event
 * Admin only
 */
router.post(
  '/events',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  async (req, res) => {
    try {
      let eventData = req.body;

      // Parse JSON fields if they come as strings (from FormData)
      if (typeof eventData.categoryIds === 'string') {
        try {
          eventData.categoryIds = JSON.parse(eventData.categoryIds);
        } catch {
          eventData.categoryIds = [];
        }
      }

      // Parse numeric fields
      if (eventData.pricePerSeat) {
        eventData.pricePerSeat = parseFloat(eventData.pricePerSeat);
      }
      if (eventData.totalSeats) {
        eventData.totalSeats = parseInt(eventData.totalSeats);
      }
      if (eventData.seatsPerRow) {
        eventData.seatsPerRow = parseInt(eventData.seatsPerRow);
      }

      // Handle image upload if present
      if (req.file) {
        const uploadResult = await eventService.uploadEventImage(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );

        if (uploadResult.success) {
          eventData.imageUrl = uploadResult.data.url;
        } else {
          console.warn('Failed to upload image:', uploadResult.message);
        }
      }

      const result = await eventService.createEvent(eventData);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('Error in POST /admin/events:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create event',
      });
    }
  }
);

/**
 * PUT /api/v1/admin/events/:id
 * Update an existing event
 * Admin only
 */
router.put(
  '/events/:id',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Event ID is required',
        });
      }

      let updateData = req.body;

      // Parse JSON fields if they come as strings (from FormData)
      if (typeof updateData.categoryIds === 'string') {
        try {
          updateData.categoryIds = JSON.parse(updateData.categoryIds);
        } catch {
          updateData.categoryIds = [];
        }
      }

      // Parse numeric fields
      if (updateData.pricePerSeat) {
        updateData.pricePerSeat = parseFloat(updateData.pricePerSeat);
      }
      if (updateData.totalSeats) {
        updateData.totalSeats = parseInt(updateData.totalSeats);
      }
      if (updateData.seatsPerRow) {
        updateData.seatsPerRow = parseInt(updateData.seatsPerRow);
      }

      // Handle image upload if present
      if (req.file) {
        const uploadResult = await eventService.uploadEventImage(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        );

        if (uploadResult.success) {
          updateData.imageUrl = uploadResult.data.url;
        } else {
          console.warn('Failed to upload image:', uploadResult.message);
        }
      }

      const result = await eventService.updateEvent(id, updateData);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in PUT /admin/events/:id:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update event',
      });
    }
  }
);

/**
 * DELETE /api/v1/admin/events/:id
 * Delete an event
 * Admin only
 */
router.delete(
  '/events/:id',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Event ID is required',
        });
      }

      const result = await eventService.deleteEvent(id);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in DELETE /admin/events/:id:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete event',
      });
    }
  }
);

/**
 * PATCH /api/v1/admin/events/:id/status
 * Update event status (publish/unpublish)
 * Admin only
 */
router.patch(
  '/events/:id/status',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Event ID is required',
        });
      }

      if (!status || !['PUBLISHED', 'DRAFT'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Valid status (PUBLISHED or DRAFT) is required',
        });
      }

      const result = await eventService.updateEvent(id, { status });

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in PATCH /admin/events/:id/status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update event status',
      });
    }
  }
);

/**
 * POST /api/v1/admin/events/upload-image
 * Upload an image and get URL back (for pre-upload before form submission)
 * Admin only
 */
router.post(
  '/events/upload-image',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided',
        });
      }

      const result = await eventService.uploadEventImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in POST /admin/events/upload-image:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload image',
      });
    }
  }
);

/**
 * POST /api/v1/admin/categories
 * Create a new category
 * Admin only
 */
router.post(
  '/categories',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const result = await categoryService.createCategory(req.body);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('Error in POST /admin/categories:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create category',
      });
    }
  }
);

/**
 * PUT /api/v1/admin/categories/:id
 * Update a category
 * Admin only
 */
router.put(
  '/categories/:id',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Category ID is required',
        });
      }

      const result = await categoryService.updateCategory(id, req.body);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in PUT /admin/categories/:id:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update category',
      });
    }
  }
);

/**
 * DELETE /api/v1/admin/categories/:id
 * Delete a category
 * Admin only
 */
router.delete(
  '/categories/:id',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Category ID is required',
        });
      }

      const result = await categoryService.deleteCategory(id);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('Error in DELETE /admin/categories/:id:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete category',
      });
    }
  }
);

module.exports = router;
