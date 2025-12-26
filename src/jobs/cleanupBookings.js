const bookingService = require('../services/booking.service');

// Run cleanup every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;

let cleanupTimer = null;

const startCleanupScheduler = () => {
  if (cleanupTimer) {
    console.log('Cleanup scheduler already running');
    return;
  }

  console.log('Starting booking cleanup scheduler...');

  // Run cleanup immediately on start
  runCleanup();

  // Then schedule regular cleanups
  cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL);
};

const stopCleanupScheduler = () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    console.log('Booking cleanup scheduler stopped');
  }
};

const runCleanup = async () => {
  try {
    const result = await bookingService.cleanupExpiredBookings();
    if (result.deleted > 0) {
      console.log(`Cleaned up ${result.deleted} expired booking(s)`);
    }
  } catch (error) {
    console.error('Error during booking cleanup:', error);
  }
};

module.exports = {
  startCleanupScheduler,
  stopCleanupScheduler,
};
