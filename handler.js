'use strict';

const im = require('imagemagick');
const fs = require('fs');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
  let data = null;
  const operation = event.queryStringParameters ? event.queryStringParameters.operation : null;
  if (event.httpMethod == 'GET') {
    return getPage();
  } else {
    try {
      data = JSON.parse(event.body);
    } catch (e) {
      data = {
        "customArgs": decodeURIComponent(event.body.split('&')[1].split('=')[1]),
        "base64Image": decodeURIComponent(event.body.split('&')[3].split('=')[1])
      }
    }
    switch (operation) {
      case 'ping':
        return sendRes(200, 'pong');
      case 'convert':
        return await operate(data);
      default:
        return sendRes(401, '`Unrecognized operation "${operation}"`');
    }
  }
};

const sendRes = (status, body) => {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html"
    },
    body: body
  };
  return response;
}

const operate = async (body) => {
  const customArgs = body.customArgs.split(',') || [];
  let outputExtension = body.outputExtension ? body.outputExtension : 'png';
  let inputFile = null;
  let outputFile = null;

  try {
    if (body.base64Image) {
      inputFile = '/tmp/inputFile.png';
      const buffer = new Buffer(body.base64Image, 'base64');
      fs.writeFileSync(inputFile, buffer);
      customArgs.unshift(inputFile);
    }

    outputFile = `/tmp/outputFile.${outputExtension}`;
    customArgs.push(outputFile);

    // [input, customArgs, output]
    await performConvert(customArgs);
    let fileBuffer = new Buffer(fs.readFileSync(outputFile));
    fs.unlinkSync(outputFile);
    await putfile(fileBuffer);
    return sendRes(200, '<img src="data:image/png;base64,' + fileBuffer.toString('base64') + '"//>');
  } catch (e) {
    console.log(`Error:${e}`);
    return sendRes(500, e);
  }
};

const performConvert = (params) => {
  return new Promise(function (res, rej) {
    im.convert(params, (err) => {
      if (err) {
        console.log(`Error${err}`);
        rej(err);
      } else {
        res('operation completed successfully');
      }
    });
  });
}

const putfile = async (buffer) => {
  let params = {
    Bucket: 'serverlessappdemo',
    Key: 'images/' + Date.now().toString() + '.png',
    Body: buffer
  };
  return await s3.putObject(params).promise();
}

const getPage = () => {
  let data = fs.readFileSync('./form.html', 'utf8');
  return sendRes(200, data);
}
