
var express = require('express');
var router = express.Router();
const fs = require('fs');
var seoData = require('./onPageSeo')

router.get('/data/:type', (req, res) => {
    let type = req.params.type;
    const fileContent = seoData[type];
    res.render('manageSeo', { fileContent,type });
   });



//    router.post('/update', (req, res) => {
//     const updatedContent = req.body.updatedContent;
//     const filePath = './routes/onPageSeo.js';
//     // Write the updated content back to the file
//     fs.writeFileSync(filePath, updatedContent, 'utf-8');
//     // Send a response indicating success
//     res.send('Changes saved successfully.');
//    });


router.post('/update', (req, res) => {
    const updatedHomePageContent = {
      title: req.body.title,
      description: req.body.description,
      author: req.body.author,
      abstract: req.body.abstract,
      keywords: req.body.keywords
    };

    const existingContent = seoData;
    // Update only the homePage data
    existingContent[req.body.type] = updatedHomePageContent;
    console.log( existingContent[req.body.type]);
    // Write the updated content back to the file
    fs.writeFileSync('./routes/onPageSeo.js', `module.exports = ${JSON.stringify(existingContent, null, 2)}`, 'utf-8');
    // Send a response indicating success
    res.send('Changes saved successfully.');
   });
   
module.exports = router;