/**
 * Middleware exports
 */
const { requireAdmin, requireWriter } = require('./auth');

module.exports = {
  requireAdmin,
  requireWriter,
};
