var createError = require('http-errors');
const http = require('http');
var cookieSession = require('cookie-session')
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var compression = require('compression')
var bodyParser = require('body-parser')

var indexRouter = require('./routes/index');
var index1 = require('./routes/index1');
var index2 = require('./routes/index2');
var programming_language = require('./routes/programming_language');
var admin = require('./routes/admin');
var project = require('./routes/project');
var preview = require('./routes/preview');
var allprojects = require('./routes/allprojects');
var userlogin = require('./routes/user-login');
var customization = require('./routes/customization');
var userverification = require('./routes/user-verification');
var user_project  = require('./routes/user_project');
var ownproject = require('./routes/ownproject');
var htaccess = require('./routes/htaccess');
var robot = require('./routes/robot');
var terms = require('./routes/terms');
var sitemap = require('./routes/sitemap');
var aboutus = require('./routes/aboutus')
var ads = require('./routes/ads')
var notes = require('./routes/notes')
var source_code = require('./routes/source_code');
var cors = require('cors')


// newchanges
var BTech = require('./routes/B.Tech')
var MTech = require('./routes/M.Tech')
var BCA = require('./routes/BCA')
var MCA = require('./routes/MCA')
var BE = require('./routes/BE')
var ME = require('./routes/ME')
var api = require('./routes/api')

var ieee = require('./routes/ieee/ieeeproject')
//var facebooklogin = require('./routes/facebooklogin');
var app = express();
app.use(compression())


var app = express();


var corsOptions = {
  origin: 'https://earthinvestorsgroup.com/',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.use(logger('dev'));
app.use(express.json({limit: '50mb'}));
app.use(bodyParser.json({ limit: "200mb" }));
app.use(bodyParser.urlencoded({ limit: "200mb",  extended: true, parameterLimit: 1000000 }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));



app.get('/events', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')

  // send a ping approx every 2 seconds
  var timer = setInterval(function () {
    res.write('data: ping\n\n')

    // !!! this is the important part
    res.flush()
  }, 2000)

  res.on('close', function () {
    clearInterval(timer)
  })
})


app.use(cookieSession({
  name: 'session',
  keys: ['naman'],

  // Cookie Options
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}))



app.use('/', indexRouter);
app.use('/index1',index1);
app.use('/index2',index2);
app.use('/admin',admin)
app.use('/programming_language',programming_language);
app.use('/project',project);
app.use('/preview',preview);
app.use('/readymade-project-file',allprojects);
app.use('/privacy-policy',userlogin);
app.use('/terms-and-conditions',terms);
app.use('/customization',customization);
app.use('/user-verification',userverification);
app.use('/make-your-own-project',ownproject);
app.use('/user-project',user_project)
app.use('/.htaccess',htaccess);
app.use('/robots.txt',robot);
app.use('/sitemap.xml',sitemap)
app.use('/aboutus',aboutus)
app.use('/ads.txt',ads)
app.use('/ieee-standard-project-report',ieee)
app.use('/class-12-physics-notes-download',notes)


// new work

app.use('/btech-final-year-project-report',BTech)
app.use('/mtech-final-year-project-report',MTech)
app.use('/bca-final-year-project-report',BCA)
app.use('/mca-final-year-project-report',MCA)
app.use('/be-final-year-project-report',BE)
app.use('/me-final-year-project-report',ME)
app.use('/final-year-projects-source-code',source_code)
app.use('/api',api)
//app.use('/facebooklogin',facebooklogin);
// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});





module.exports = app;
