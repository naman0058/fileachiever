
var express = require('express');
var router = express.Router();
var mysql = require('mysql')
var pool = require('./pool')



var today = new Date();
var dd = String(today.getDate()).padStart(2, '0');
var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
var yyyy = today.getFullYear();

today = yyyy + '-' + mm + '-' + dd;





router.get('/', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('index',{result:result}))
})

router.post('/contactus',(req,res)=>{
    let body = req.body
    body['date'] = today
    pool.query(`insert into contactus set ?`,body,(err,result)=>err ? console.log(err) : res.send('OK'))
})

router.get('/synopsis', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('synopsis',{result:result}))
})


//old route
router.get('/cse/:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('B.Tech/preview',{result:result})
    })
})



// new btech route
router.get('/btech-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('B.Tech/preview',{result:result})
    })
})


// new mtech route
router.get('/mtech-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('M.Tech/preview',{result:result})
    })
})


// new be route
router.get('/be-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BE/preview',{result:result})
    })
})


// new me route
router.get('/me-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ME/preview',{result:result})
    })
})


// new bca route
router.get('/bca-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BCA/preview',{result:result})
    })
})


// new mca route
router.get('/mca-final-year-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'HTML' || name = 'CSS' || name = 'JavaScript' || name = 'PHP';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('MCA/preview',{result:result})
    })
})




router.get('/cse/synopsis/:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'PHP' || name = 'JavaScript' || name = 'HTML' || name='CSS' || name = 'Jquery' || name = 'JSON';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('synopsis-preview',{result:result})
    })
})





router.get('/ieee-standard-project-report-:name',(req,res)=>{
    var query = `select * from project where seo_name = "${req.params.name}";`
    var query1 = `select * from programming_language where name = 'PHP' || name = 'JavaScript' || name = 'HTML' || name='CSS' || name = 'Jquery' || name = 'JSON';`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ieee/preview',{result:result})
    })
})




router.get('/ieee-standard-project-report-:name/customization',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ieee/customization',{result : result})
    })
    
})


//old route

router.get('/cse/:name/customization',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('customization',{result : result})
    })
    
})




//new btech edit route



router.get('/btech-final-year-project-report-:name/edit',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('B.Tech/customization',{result : result})
    })
    
})


//new mtech edit route

router.get('/mtech-final-year-project-report-:name/edit',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('M.Tech/customization',{result : result})
    })
    
})


//new be edit route

router.get('/be-final-year-project-report-:name/edit',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BE/customization',{result : result})
    })
    
})


//new me edit route


router.get('/me-final-year-project-report-:name/edit',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('ME/customization',{result : result})
    })
    
})




//new bca edit route

router.get('/bca-final-year-project-report-:name/edit',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('BCA/customization',{result : result})
    })
    
})



//new mca edit route

router.get('/mca-final-year-project-report-:name/edit',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('MCA/customization',{result : result})
    })
    
})




router.get('/cse/synopsis/:name/customization',(req,res)=>{
    var query = `select * from project where id = '${req.session.customizationid}';`
    var query1 = `select name,id from programming_language;`
    pool.query(query+query1,(err,result)=>{
        err ? console.log(err) : res.render('synopis_customization',{result : result})
    })
    
})




router.get('/make-your-own-project-pricing-list', (req, res) => { pool.query(`select name,seo_name,short_description from project`,
(err,result)=>err ? console.log(err) : res.render('make-your-own-project-pricing-list',{result:result}))
})
module.exports = router;