const express = require('express');
const router = express.Router();
const categoryService = require('../services/category.service');

/**
 * GET /categories
 * Get all categories
 */
router.get('/', async (req, res) => {
  try {
    const result = await categoryService.getAllCategories();
    res.json(result);
  } catch (error) {
    console.error('Error in GET /categories:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
});

/**
 * GET /categories/:id
 * Get a specific category by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await categoryService.getCategoryById(id);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error in GET /categories/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
});

module.exports = router;
