'use strict'
const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')
const compression = require('compression')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const formidable = require('formidable');
const app = express()
const router = express.Router()

const aws = require('aws-sdk');
const client = new aws.S3();



app.set('view engine', 'pug')

if (process.env.NODE_ENV === 'test') {
    // NOTE: aws-serverless-express uses this app for its integration tests
    // and only applies compression to the /sam endpoint during testing.
    router.use('/sam', compression())
} else {
    router.use(compression())
}

router.use(cors())
router.use(bodyParser.json())
router.use(bodyParser.urlencoded({ extended: true }))
router.use(awsServerlessExpressMiddleware.eventContext())

// NOTE: tests can't find the views directory without this
app.set('views', path.join(__dirname, 'views'));

router.get('/', function (req, res) {
    res.send('Hello World!');
});

router.get('/submit', (req, res) => {
    res.send(`
    <h2>With <code>"express"</code> npm package</h2>
    <form action="/Prod/submit" enctype="multipart/form-data" method="post">
      <div>Text field title: <input type="text" name="title" /></div>
      <div>Single: <input type="file" name="files" multiple="multiple" />   
      <div>Multiple<input type="file" name="multiple" multiple="multiple" />
      <input type="submit" value="Upload" />
    </form>
  `);
});

router.post('/submit', (req, res, next) => {
    // const form = formidable({ multiples: true , uploadDir: __dirname });

    const default_max_size = 200 * 1024 * 1024; //200MB
    const s3_max_size = 5000 * 1024 * 1024; //5TB using presigned urls
    const api_gateway_max_size = 10 * 1024 * 1024; //10MB FOR API GATEWAY

    const options = { maxFileSize: api_gateway_max_size , multiples: true , uploadDir: '/tmp' };
    const form = formidable(options);

    form.parse(req, (err, fields, files) => {
        if (err) {
            next(err);
            return;
        }
        //Todo: Remove all this - we are printing for demonstrational purposes - goes against reactive manifesto by forcing delay
        //console.log('submission: ' + JSON.stringify({ fields, files }));
        printFields(fields)
        printS3Location(files);
        res.json({ fields, files });
    });
});

function printFields(fields) {
    Object.keys(fields).forEach(function(key) {
        console.table('[ ' + key + ' ] : ' + fields[key])
    })
}

//IF EACH FILE INPUT GOES TO A DIFFERENT FIELD (CLEANER) - USE THIS
function printS3Location(files) {
    Object.keys(files).forEach(function(key) {
        if(key==='multiple')
        {
            let multiple = files[key];
            Object.keys(multiple).forEach(function(key) {
                console.table('[ ' + key + ' ] : ' + multiple[key].name + ' : ' + multiple[key].path);
            });
        } else {
                console.table('[ ' + key + ' ] : ' + files[key].name + ' : ' + files[key].path)
        }
    })
}




// router.post('/submit', (req, res, next) => {
//     // const form = formidable({ multiples: true , uploadDir: __dirname });
//
//     const default_max_size = 200 * 1024 * 1024; //200MB
//     const s3_max_size = 5000 * 1024 * 1024; //5TB using presigned urls
//     const api_gateway_max_size = 10 * 1024 * 1024; //10MB FOR API GATEWAY
//
//     const options = { maxFileSize: api_gateway_max_size , multiples: true , uploadDir: '/tmp' };
//     const form = formidable(options);
//
//     form.parse(req, (err, fields, files) => {
//         if (err) {
//             next(err);
//             return;
//         }
//         res.json({ fields, files });
//     });
// });



router.get('/postform', async (req, res) => {


    var PostParams = {
        Bucket: 'lambda-express-private',
        Expires: 10 * 60,
        Conditions: [
            ['starts-with', '$key', 'path/to/uploads/']
        ]
    };

    const POSTsignedURL = await (new Promise((resolve, reject) => {
        client.createPresignedPost(PostParams, (err, data) => {      if (err) {
            reject(err)
        } else {
            resolve(data)
        }
        });
    }));

    // return res.json({
    //     POSTsignedURL
    // })

    let url = POSTsignedURL.url;
    let key = 'path/to/uploads/file.png';

    let fields = POSTsignedURL.fields;

    let credentials = fields['X-Amz-Credential'];
    let algorithm = fields['X-Amz-Algorithm'];
    let postbydate = fields['X-Amz-Date'];
    let singature = fields['X-Amz-Signature'];
    let policy = fields['Policy'];

    console.log('credentials : ' + credentials);
    console.log('algorithm : ' + algorithm);
    console.log('postbydate : ' + postbydate);
    console.log('singature : ' + singature);
    console.log('policy : ' + policy);

    // console.log(fields);


    try{


      //
      //   res.send(`
      //   <h2>With <code>"express"</code> npm package</h2>
      //   <form action="/Prod/submit" enctype="multipart/form-data" method="post">
      //     <div>Text field title: <input type="text" name="title" /></div>
      //     <div>File: <input type="file" name="someExpressFiles" multiple="multiple" /></div>
      //     <input type="submit" value="Upload" />
      //   </form>
      // `);

        res.send(`
    <form action="${url}" method="post" enctype="multipart/form-data">
    <input type="input"  name="key" value="${key}" /><br />
    <input type="text"   name="X-Amz-Credential" value="${credentials}" />
    <input type="text"   name="X-Amz-Algorithm" value="${algorithm}" />
    <input type="text"   name="X-Amz-Date" value="${postbydate}" />
    <input type="hidden" name="Policy" value="${policy}" />
    <input type="hidden" name="X-Amz-Signature" value="${singature}" />
    <input type="file"   name="file" /> <br />
    <input type="submit" name="submit" value="Upload to Amazon S3" />
  </form>
  `);

    }
    catch(err)
    {console.log(err)}

});




//this worked
// router.get('/hello', (req, res) => {
//   res.send('Hello World!');
// })

// The aws-serverless-express library creates a server and listens on a Unix
// Domain Socket for you, so you can remove the usual call to app.listen.
// app.listen(3000)
app.use('/', router)

// Export your express server so you can import it in the lambda function.
module.exports = app
