/**
 * Authentication middleware
 */

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminid) {
    return res.redirect('/admin?redirect=' + encodeURIComponent(req.originalUrl || '/'));
  }
  next();
}

function requireWriter(req, res, next) {
  if (!req.session || !req.session.blogWriter) {
    return res.redirect('/blog-writer/login');
  }
  next();
}

module.exports = {
  requireAdmin,
  requireWriter,
};
