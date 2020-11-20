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
      <div>File: <input type="file" name="someExpressFiles" multiple="multiple" /></div>
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
        res.json({ fields, files });
    });
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
