const { S3Client } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWSACCESSID,
    secretAccessKey: process.env.AWSSECRETKEY,
  },
});

module.exports = s3Client;
