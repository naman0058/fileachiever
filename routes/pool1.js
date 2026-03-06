// Re-export from config (backward compatibility)
// Note: config uses mysql2 (callback); pool1 originally used mysql2/promise
// Keeping sync with config - if promise API needed, use pool1.promise()
const { pool1: p } = require('../config/database');
module.exports = p;
