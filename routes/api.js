var express = require('express');
var router = express.Router();
var pool =  require('./pool1');
var sending = require('./msg_function');
const { reset } = require('nodemon');
var cors = require('cors')



router.get('/get-country',cors(),(req,res)=>{
    pool.query(`select * from country order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})


router.get('/get-state-country-wise',cors(),(req,res)=>{
    pool.query(`select s.* , (select c.name from country c where c.id = s.countryid) as countryname from state s where s.countryid = '${req.query.countryid}' order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})


router.get('/get-amenities',cors(),(req,res)=>{
    pool.query(`select * from amenities order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-property_type',cors(),(req,res)=>{
    pool.query(`select * from property_type order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})


router.get('/get-state',cors(),(req,res)=>{
    pool.query(`select s.* , (select c.name from country c where c.id = s.countryid) as countryname from state s order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})


router.get('/get-developers',cors(),(req,res)=>{
    pool.query(`select d.* , (select c.name from country c where c.id = d.countryid) as countryname from developers d order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})


router.get('/get-developers-country-wise',cors(),(req,res)=>{
    pool.query(`select d.* , (select c.name from country c where c.id = d.countryid) as countryname from developers d where d.countryid = '${req.query.countryid}' order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-projects',cors(),(req,res)=>{
    pool.query(`select p.* ,
    (select d.name from developers d where d.id = p.developersid) as developername,
    (select s.name from state s where s.id = p.stateid) as statename,
     (select c.name from country c where c.id = p.countryid) as countryname
      from projects p order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-agent',cors(),(req,res)=>{
    pool.query(`select a.* , (select c.name from country c where c.id = a.countryid) as countryname from agent a order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-listing',cors(),(req,res)=>{
    pool.query(`select l.* , 
    (select c.name from country c where c.id = l.countryid) as countryname,
    (select s.name from state s where s.id = l.stateid) as statename,
    (select d.name from developers d where d.id = l.developersid) as developername,
    (select p.name from projects p where p.id = l.projectid) as projectname,
    (select a.name from agent a where a.id = l.agentid) as agentname,
    (select p.name from property_type p where p.id = l.propertytypeid) as propert_type_name

     from listing l order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-listing-amenities',cors(),(req,res)=>{
    pool.query(`select * from listing_amenities where listingid = '${req.query.id}' order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})


router.get('/get-listing_imagess',cors(),(req,res)=>{
    pool.query(`select l.* , (select li.name from listing li where li.id = l.listingid) as listingname from listing_imagess l order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-brochure',cors(),(req,res)=>{
    pool.query(`select l.* , (select li.name from listing li where li.id = l.listingid) as listingname from brochure l order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-review',cors(),(req,res)=>{
    pool.query(`select l.* , (select li.name from listing li where li.id = l.listingid) as listingname from review l order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/get-notes',cors(),(req,res)=>{
    pool.query(`select l.* , (select li.name from listing li where li.id = l.listingid) as listingname from notes l order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})





router.get('/listing-by-developers',cors(),(req,res)=>{
    pool.query(`select l.* ,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1) as listingimage1,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1,1) as listingimage2,
   (select i.image from listing_imagess i where i.listingid = l.id limit 2,1) as listingimage3,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1) as listing_amenities1,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1) as listing_amenities2,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1) as listing_amenities3,


   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1)) as listing_amenitiesicon1,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1)) as listing_amenitiesicon2,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1)) as listing_amenitiesicon3


     from listing l where l.developersid = (select d.id from developers d where d.seo_name = '${req.query.developer_name}') order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})








router.get('/projects-by-developers',cors(),(req,res)=>{
    pool.query(`select l.*
     from projects l where l.developersid = (select d.id from developers d where d.seo_name = '${req.query.developer_name}') order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/projects-by-state',cors(),(req,res)=>{
    pool.query(`select l.*
     from projects l where l.stateid = (select d.id from state d where d.seo_name = '${req.query.state_name}') order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})





router.get('/listing-by-project-type',cors(),(req,res)=>{
    pool.query(`select l.* ,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1) as listingimage1,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1,1) as listingimage2,
   (select i.image from listing_imagess i where i.listingid = l.id limit 2,1) as listingimage3,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1) as listing_amenities1,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1) as listing_amenities2,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1) as listing_amenities3,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1)) as listing_amenitiesicon1,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1)) as listing_amenitiesicon2,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1)) as listing_amenitiesicon3

     from listing l where l.projectid = (select d.id from projects d where d.seo_name = '${req.query.project_name}') order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})






router.get('/listing-by-property-type',cors(),(req,res)=>{
    pool.query(`select l.* ,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1) as listingimage1,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1,1) as listingimage2,
   (select i.image from listing_imagess i where i.listingid = l.id limit 2,1) as listingimage3,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1) as listing_amenities1,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1) as listing_amenities2,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1) as listing_amenities3,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1)) as listing_amenitiesicon1,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1)) as listing_amenitiesicon2,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1)) as listing_amenitiesicon3

     from listing l where l.propertytypeid = (select d.id from property_type d where d.seo_name = '${req.query.property_type}') order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})



router.get('/listing-by-state',cors(),(req,res)=>{
    pool.query(`select l.* ,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1) as listingimage1,
   (select i.image from listing_imagess i where i.listingid = l.id limit 1,1) as listingimage2,
   (select i.image from listing_imagess i where i.listingid = l.id limit 2,1) as listingimage3,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1) as listing_amenities1,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1) as listing_amenities2,
   (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1) as listing_amenities3,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1)) as listing_amenitiesicon1,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1)) as listing_amenitiesicon2,
   (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1)) as listing_amenitiesicon3

     from listing l where l.stateid = (select d.id from state d where d.seo_name = '${req.query.state_name}') order by id desc`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})




router.get('/listing-details',cors(),(req,res)=>{
    var query = `select l.*,
    (select c.name from country c where c.id = l.countryid) as countryname,
    (select s.name from state s where s.id = l.stateid) as statename,
    (select d.name from developers d where d.id = l.developersid) as developername,
    (select d.description from developers d where d.id = l.developersid) as developer_description,
    (select d.seo_name from developers d where d.id = l.developersid) as developer_seo_name,

    (select d.icon from developers d where d.id = l.developersid) as developer_image,


    (select p.name from projects p where p.id = l.projectid) as projectname,
    (select a.name from agent a where a.id = l.agentid) as agentname
    from listing l where l.id = '${req.query.id}';`
    var query1 = `select * from listing_imagess where listingid = '${req.query.id}';`
    var query2 = `select l.* , (select a.icon from amenities a where a.name = l.amenitiesid) as amenities_icon from listing_amenities l where l.listingid = '${req.query.id}';`
    var query3 = `select * from review where listingid = '${req.query.id}';`
    var query4 = `select * from brochure where listingid = '${req.query.id}';`
    pool.query(query+query1+query2+query3+query4,(err,result)=>{
        if(err) throw err;
        else res.json(result)
    })


    

})


router.post('/enquiry_submit',cors(),(req,res)=>{
    let body = req.body;
    body['date'] = sending.date_and_time()
    pool.query(`insert into enquiry set ?`,body,(err,result)=>{
        if(err) throw err;
        else {
            res.json({msg:'success'})
        }
    })
})



router.post('/contact_submit',cors(),(req,res)=>{
    let body = req.body;
    body['date'] = sending.date_and_time()
    pool.query(`insert into contact set ?`,body,(err,result)=>{
        if(err) throw err;
        else {
            res.json({msg:'success'})
        }
    })
})




router.get('/top-10-agent/:name',cors(),(req,res)=>{
    if(req.params.name == 'all'){
   pool.query(`select * from agent order by id limit 10`,(err,result)=>{
    if(err) throw err;
    else res.json(result)
   })
    }
    else{
    pool.query(`select * from agent where countryid = (select c.id from country c where c.name = '${req.params.name}') order by id limit 10`,(err,result)=>{
        if(err) throw err;
        else {
            res.json(result)
        }
    })
    }
})



router.get('/featured/state',cors(),(req,res)=>{
    pool.query(`select * from state where isFeatured = 'yes' order by id desc limit 4`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})





router.post('/search',cors(),(req,res)=>{
    // console.log(`select * from listing where stateid = '${req.body.stateid}' and propertytypeid in (${req.body.property_typeid}) and price >= ${req.body.min_price} and price <= ${req.body.max_price}`)
    pool.query(`select l.* ,
    (select s.name from state s where s.id = l.stateid) as statename,
    (select i.image from listing_imagess i where i.listingid = l.id limit 1) as listingimage1,
    (select i.image from listing_imagess i where i.listingid = l.id limit 1,1) as listingimage2,
    (select i.image from listing_imagess i where i.listingid = l.id limit 2,1) as listingimage3,
    (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1) as listing_amenities1,
    (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1) as listing_amenities2,
    (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1) as listing_amenities3,
    (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1)) as listing_amenitiesicon1,
    (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 1,1)) as listing_amenitiesicon2,
    (select i.icon from amenities i where i.name = (select i.amenitiesid from listing_amenities i where i.listingid = l.id limit 2,1)) as listing_amenitiesicon3
    from listing l 
    where l.stateid = '${req.body.stateid}' and l.propertytypeid in (${req.body.property_typeid}) and l.price >= ${req.body.min_price} and l.price <= ${req.body.max_price}`,(err,result)=>{
        if(err) throw err;
        else res.json(result);
    })
})





module.exports = router