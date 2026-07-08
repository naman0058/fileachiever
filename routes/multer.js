var multer = require('multer');
var path = require('path')

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/images/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})

/** Source code zip / readme / schema / sql uploads (affiliate dashboard) */
const SOURCE_CODE_MAX_BYTES = 5 * 1024 * 1024;

var upload = multer({ storage: storage });

var sourceCodeUpload = multer({
  storage: storage,
  limits: { fileSize: SOURCE_CODE_MAX_BYTES }
});

module.exports = upload;
module.exports.sourceCodeUpload = sourceCodeUpload;
module.exports.SOURCE_CODE_MAX_BYTES = SOURCE_CODE_MAX_BYTES;