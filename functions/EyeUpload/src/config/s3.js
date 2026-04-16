const { S3Client } = require("@aws-sdk/client-s3");
const env = require("./env");

const s3Client = new S3Client({
  region: env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: env.AWSACCESSID,
    secretAccessKey: env.AWSSECRETKEY,
  },
});

module.exports = s3Client;
