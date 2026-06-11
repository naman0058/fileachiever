const fs = require('fs');
const { google } = require('googleapis');
const cloudinary = require('cloudinary').v2;
const path = require('path');
var express = require('express');
var router = express.Router();
var pool = require('../routes/pool');
const util = require('util');
const queryAsync = util.promisify(pool.query).bind(pool);



router.get('/', async (req, res) => {
  try {
    const folders = await queryAsync(
      'SELECT DISTINCT folder_name FROM freelance_works ORDER BY folder_name ASC'
    );
    const rows = await queryAsync(
      'SELECT folder_name, image_url, type FROM freelance_works ORDER BY folder_name ASC, id ASC'
    );

    const portfolioByFolder = {};
    const featuredMix = [];
    const featuredFoldersSeen = new Set();

    for (const row of rows) {
      const fn = row.folder_name;
      const url = row.image_url;
      if (row.type === 'drive') continue;
      const ext = (url || '').split('.').pop().toLowerCase().split('?')[0];
      const isVideo = ext === 'mp4' || ext === 'webm' || ext === 'mov';

      if (!portfolioByFolder[fn]) portfolioByFolder[fn] = [];
      if (portfolioByFolder[fn].length < 5 && !isVideo) {
        portfolioByFolder[fn].push(url);
      }
      if (featuredMix.length < 12 && !isVideo && !featuredFoldersSeen.has(fn)) {
        featuredMix.push({ folder: fn, url });
        featuredFoldersSeen.add(fn);
      }
    }

    res.render('Manisha/index', {
      page: 'Home',
      folders,
      portfolioByFolder,
      featuredMix,
    });
  } catch (err) {
    console.error('[manisha] home:', err);
    res.render('Manisha/index', {
      page: 'Home',
      folders: [],
      portfolioByFolder: {},
      featuredMix: [],
    });
  }
});


router.get('/done',async(req,res)=>{
 res.json({msg:'done'})
  // res.send('fo')
})


router.get('/services',async(req,res)=>{
  res.render('Manisha/services',{page:'Services'})
  // res.send('fo')
})



router.get('/works',async(req,res)=>{
  pool.query(`SELECT DISTINCT folder_name FROM freelance_works`,(err,result)=>{
    if(err) throw err;
    else res.render('Manisha/works',{result,page:'Works'})
  })
  
  // res.send('fo')
})


router.get('/works/:folderName',async(req,res)=>{
  const folderName = req.params.folderName;
  pool.query(`SELECT * FROM freelance_works WHERE folder_name = ?`, [folderName], (err, result) => {
    if (err) throw err;
    if (!result || !result.length) {
      return pool.query(
        `SELECT DISTINCT folder_name FROM freelance_works WHERE folder_name != ? ORDER BY folder_name ASC LIMIT 6`,
        [folderName],
        (err2, relatedFolders) => {
          if (err2) throw err2;
          res.render('Manisha/worksDetails', {
            result: [],
            folderName,
            page: 'Works',
            pageTitle: formatPageTitle(folderName),
            relatedFolders: relatedFolders || []
          });
        }
      );
    }
    if (result[0].type === 'drive') {
      return res.redirect(result[0].image_url);
    }
    pool.query(
      `SELECT DISTINCT folder_name FROM freelance_works WHERE folder_name != ? ORDER BY folder_name ASC LIMIT 6`,
      [folderName],
      (err2, relatedFolders) => {
        if (err2) throw err2;
        res.render('Manisha/worksDetails', {
          result,
          folderName,
          page: 'Works',
          pageTitle: formatPageTitle(folderName),
          relatedFolders: relatedFolders || []
        });
      }
    );
  });
});

function formatPageTitle(folderName) {
  if (!folderName) return 'Portfolio | Manisha Creations';
  const title = folderName.split(' ').map((part) => {
    if (/^\d/.test(part)) return part;
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join(' ');
  return `${title} Portfolio | Manisha Creations`;
}





module.exports = router;

// // Configure Cloudinary
cloudinary.config({ 
  cloud_name: 'dr5dofa3x', 
  api_key: '478517358714162', 
  api_secret: '2zKSb54BTVftqMWnU0lAQrt2OTw'
});

// // Authenticate Google Drive API
const auth = new google.auth.GoogleAuth({
  keyFile: 'googleDrive.json', 
  scopes: ['https://www.googleapis.com/auth/drive']
});



const drive = google.drive({ version: 'v3', auth });

// // Google Drive Folder ID (Replace with your actual folder ID)
const FOLDER_ID = '1l9yDb_UKvIkLzaPD_4JE6k02hWN2ZT7j';

async function getDriveFiles() {
  const res = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)'
  });
//   console.log('Files:', res.data.files);
  return res.data.files;
}

// getDriveFiles()

// Function to upload file to Cloudinary
 


async function uploadFileToCloudinary(fileId, fileName, folderName = "WHITEBOARD ANIMATION") {
  const filePath = path.join(__dirname, fileName);

  try {
    // Download file from Google Drive
    const dest = fs.createWriteStream(filePath);
    await drive.files
      .get({ fileId, alt: "media" }, { responseType: "stream" })
      .then((res) => new Promise((resolve, reject) => {
        res.data.pipe(dest);
        dest.on("finish", resolve);
        dest.on("error", reject);
      }));

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, { 
      resource_type: "video",
      folder: folderName 
    });
    

    console.log(`Uploaded: ${fileName} - ${result.secure_url}`);

    // Save to MySQL database
    await saveToDatabase(folderName, result.secure_url);

    // Delete local file after upload
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error(`Error uploading ${fileName}:`, error);
  }
}

/**
 * Saves the uploaded file's folder and URL into the database
 */
async function saveToDatabase(folder, imagePath) {
  try {
    const query = `INSERT INTO freelance_works (folder_name, image_url) VALUES (?, ?)`;
    await queryAsync(query, [folder, imagePath]);
    console.log(`Saved to DB: Folder - ${folder}, Image - ${imagePath}`);
  } catch (error) {
    console.error("Error saving to database:", error);
  }
}

/**
 * Function to process multiple files
 */
async function processFiles() {
  const files = await getDriveFiles();
  for (const file of files) {
    console.log(`Processing: ${file.name}`);
    await uploadFileToCloudinary(file.id, file.name);
  }
}

  
  // Run the process
  // processFiles();









// Call the function
// fetchCloudinaryFolders();