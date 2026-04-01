import { S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWSACCESSID,
    secretAccessKey: process.env.AWSSECRETKEY,
  },
});

export default s3Client;
