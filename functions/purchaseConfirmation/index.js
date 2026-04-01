const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const axios = require('axios');
const mime = require('mime-types');
const { parse } = require('lambda-multipart-parser');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const OrderSchema = require('./models/Order');
const ShopInfoSchema = require('./models/ShopInfo');
const OrderVerificationSchema = require('./models/OrderVerification');
const UserSchema = require('./models/User');
const ImageCollectionSchema = require('./models/ImageCollection');

// S3 Configuration
const BASE_URL = process.env.AWS_BUCKET_BASE_URL;
const BUCKET = process.env.AWS_BUCKET_NAME;

const s3Client = new S3Client({
    region: process.env.AWS_BUCKET_REGION,
    credentials: {
        accessKeyId: process.env.AWSACCESSID,
        secretAccessKey: process.env.AWSSECRETKEY,
    },
});

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
    if (conn == null) {
        conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log('MongoDB primary connected to database: petpetclub');
        // Register schemas
        mongoose.model('OrderVerification', OrderVerificationSchema, 'orderVerification');
        mongoose.model('Order', OrderSchema, 'order');
        mongoose.model('ShopInfo', ShopInfoSchema, 'shopInfo');
        mongoose.model('ImageCollection', ImageCollectionSchema, 'imageCollection');
        mongoose.model('User', UserSchema, 'users');
    }
    return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
    return await connectToMongoDB();
};

// File utility functions
const getFileSize = (file) => {
    try {
        const fileSizeInBytes = file.buffer.length;
        const fileSizeInKilobytes = fileSizeInBytes / 1024;
        const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
        return {
            bytes: fileSizeInBytes,
            kilobytes: fileSizeInKilobytes,
            megabytes: fileSizeInMegabytes,
        };
    } catch (error) {
        console.error('Error getting file size:', error);
        return null;
    }
};

const getFileMime = (file) => {
    return mime.lookup(file.originalname) || 'application/octet-stream';
};

const getFileExtension = (file) => {
    return file.originalname.split('.').pop();
};

const addImageFileToStorage = async (image, folder, owner = 'user') => {
    try {
        // Connect to primary database for writes
        await connectToMongoDB();
        const ImageCollection = mongoose.model('ImageCollection');
        const img = await ImageCollection.create({});
        const mimeType = getFileMime(image);
        const size = getFileSize(image);
        const ext = getFileExtension(image);
        const fileName = `${img._id}.${ext}`;
        const url = `${BASE_URL}/${folder}/${fileName}`;
        const params = {
            Bucket: BUCKET,
            Key: `${folder}/${fileName}`,
            Body: image.buffer,
            ACL: 'public-read',
            ContentType: mimeType,
        };

        await s3Client.send(new PutObjectCommand(params));
        await ImageCollection.updateOne(
            { _id: img._id },
            {
                fileName,
                url,
                fileSize: size.megabytes,
                mimeType,
                owner,
            }
        );


        return url;
    } catch (err) {
        console.error('Error uploading to S3:', err);
        throw err;
    }
};

async function postData(url = "", data = {}, headers) {
    // Default options are marked with *
    const response = await fetch(url, {
        method: "POST", // *GET, POST, PUT, DELETE, etc.
        headers: headers,
        body: JSON.stringify(data), // body data type must match "Content-Type" header
    });
    return response.json(); // parses JSON response into native JavaScript objects
}

// Helper: Send email
async function sendOrderEmail(to, subject, order, cc) {
    const imageSrc = order.option === "PTag"
        ? "https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68e37c919c1c33505d734e28/68e37e919c1c33505d734e33.png"
        : "https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68e37c919c1c33505d734e28/68e37c919c1c33505d734e2a.png";
    let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465,
        secure: true,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const html =
        `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="format-detection" content="telephone=no">
            <title>PTag 訂單資料：${order.tempId}</title>
        </head>
        <body style="margin:0; padding:0; background:#f4f4f4; font-family:Helvetica,Arial,sans-serif; color:#050505; font-size:16px; line-height:1.4;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                <td align="center">
                    <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px; background:white; margin:20px 0;">
                        <tr>
                        <td style="padding:20px;">
                        <!-- Header -->
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                            <td style="font-size:56px; font-family:Helvetica; font-weight:700; color:#050505; padding-left:20px;">PTag</td>
                            </tr>
                        </table>

                        <!-- Greeting -->
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:40px;">
                            <tr>
                            <td align="center" style="padding:0 20px;">
                                <img src="https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68de55a8d0f07572c59344be/68e663980dea8b9a98db1552.png" alt="Check Icon" width="70" height="70" style="display:block;" />
                            </td>
                            </tr>
                            <tr>
                            <td align="center" style="font-size:24px; font-family:Helvetica; font-weight:700; color:black; padding:20px 0;">
                                多謝！已經成功訂購 ${order.option} 寵物牌
                            </td>
                            </tr>
                            <tr>
                            <td align="center" style="font-size:24px; font-family:Helvetica; font-weight:700; color:#FFB60C;">
                                訂單編號：${order.tempId}
                            </td>
                            </tr>
                        </table>

                        <!-- Order Details Section -->
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#FCF8F3; margin-bottom:40px;">
                            <tr>
                            <td style="padding:20px;">
                                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td style="font-size:24px; font-family:Helvetica; font-weight:700; margin-bottom:24px;">訂單詳情</td>
                                </tr>
                                <tr>
                                    <td style="padding:24px 0;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="200" style="padding-right:40px;">
                                            <img src="${imageSrc}" alt="Option Image" width="200" height="200" style="display:block;" />
                                        </td>
                                        <td width="*" valign="top" style="padding-top:50px;">
                                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                            <tr>
                                                <td style="font-size:24px; font-family:Helvetica; font-weight:700;">
                                                ${order.option === "PTagAir" ? "Ptag" : order.option}
                                                ${order.option === "PTagAir" ? '<span style="color:#65A8FB; font-weight:400;">Air</span>' : ''}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color:#969696; font-size:18px;">
                                                ${order.optionSize ? '<img src="https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68de55a8d0f07572c59344be/68e6640b0dea8b9a98db1558.png" alt="Check" width="20" height="20" style="display:inline;" /> ' + order.optionSize + ' 毫米' : ""}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="color:#969696; font-size:18px;">
                                                <img src="https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68de55a8d0f07572c59344be/68e6640b0dea8b9a98db1558.png" alt="Check" width="20" height="20" style="display:inline;" /> 
                                                ${order.optionColor ? order.optionColor : "白色"}
                                                </td>
                                            </tr>
                                            </table>
                                        </td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="height:2px; background:#D1D1D1; font-size:0; line-height:0;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="font-size:24px; font-family:Helvetica; font-weight:700; padding:24px 0 10px 0;">
                                    ${order.option === "PTagAir" ? "Ptag Air" : 'Ptag'} 打印內容
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:24px; font-family:Helvetica; font-weight:700; padding-bottom:10px;">寵物資料</td>
                                </tr>
                                <tr>
                                    <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-bottom:10px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="30%" style="font-size:18px; font-family:Helvetica; font-weight:400;">寵物名稱:</td>
                                        <td>${order.petName}</td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-bottom:16px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="30%" style="font-size:18px; font-family:Helvetica; font-weight:400; vertical-align:top;">照片:</td>
                                        <td>
                                            <img src="${order.petImg ? order.petImg : 'https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/68e37c919c1c33505d734e28/68e37ec59c1c33505d734e38.png'}" alt="Pet Image" width="400" height="250" style="display:block; border-radius:20px;" />
                                        </td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-bottom:10px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="30%" style="font-size:18px; font-family:Helvetica; font-weight:400;">收件人:</td>
                                        <td>${order.lastName}</td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-bottom:10px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="30%" style="font-size:18px; font-family:Helvetica; font-weight:400;">聯絡電話:</td>
                                        <td>${order.phoneNumber ? order.phoneNumber : ''}</td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-bottom:10px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="30%" style="font-size:18px; font-family:Helvetica; font-weight:400;">送貨方法:</td>
                                        <td>${order.delivery}</td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-bottom:16px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="30%" style="font-size:18px; font-family:Helvetica; font-weight:400; vertical-align:top;">送貨地址:</td>
                                        <td width="70%" style="font-size:18px; font-family:Helvetica; font-weight:400;">${order.address}</td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="font-size:24px; font-family:Helvetica; font-weight:700; padding:10px 0;">付款資料</td>
                                </tr>
                                <tr>
                                    <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-bottom:24px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                        <tr>
                                        <td width="30%" style="font-size:18px; font-family:Helvetica; font-weight:400;">付款方法:</td>
                                        <td>${order.paymentWay}</td>
                                        </tr>
                                    </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="height:2px; background:#D1D1D1; font-size:0; line-height:0;">&nbsp;</td>
                                </tr>
                                </table>

                                <!-- Price Summary -->
                                <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="margin:40px 0;">
                                
                                <tr>
                                    <td width="50%" style="padding:8px 0; font-size:18px; font-family:Helvetica; color:black; text-align:left;">單價</td>
                                    <td width="50%" style="padding:8px 0; font-size:18px; font-family:Helvetica; color:black; text-align:right;">$${order.price}</td>
                                </tr>
                                <tr>
                                    <td width="50%" style="padding:8px 0; font-size:18px; font-family:Helvetica; color:black; text-align:left;">運費</td>
                                    <td width="50%" style="padding:8px 0; font-size:18px; font-family:Helvetica; color:black; text-align:right;">$50</td>
                                </tr>
                                <tr>
                                    <td width="50%" style="padding:8px 0; font-size:18px; font-family:Helvetica; color:black; text-align:left;">合共</td>
                                    <td width="50%" style="padding:8px 0; font-size:18px; font-family:Helvetica; font-weight:700; color:black; text-align:right;">$${parseFloat(order.price) + 50}</td>
                                </tr>
                                </table>

                            </td>
                            </tr>
                        </table>

                        <!-- Payment Instructions -->
                        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px; padding:20px;">
                            <tr>
                            <td style="font-size:18px; font-family:Helvetica; font-weight:700;">付款說明</td>
                            </tr>
                            <tr>
                            <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                請於 3 個工作天內付款，否則該訂單將會取消。<br />
                                付款時請備註訂單編號 (多張訂單只需輸入其一訂單編號)<br />
                                <span style="text-decoration:underline;">轉數快</span><br />
                                快速支付系統識別碼 - 105134076<br /><br />
                                <span style="text-decoration:underline;">滙豐銀行</span><br />
                                747-237832-838 Pet Pet Club Limited <br /><br />
                                付款後，可經以下途徑提交付款記錄 (入數紙)：<br />
                                WhatsApp：5988 4711 / 5576 4375 或<br />
                                Email：support@ptag.com.hk
                            </td>
                            </tr>
                        </table>

                        <!-- Delivery Instructions -->
                        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px; padding:20px;">
                            <tr>
                            <td style="font-size:18px; font-family:Helvetica; font-weight:700;">送貨說明</td>
                            </tr>
                            <tr>
                            <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                <span style="text-decoration:underline;">順豐快遞</span><br />
                                如非選擇順豐站或順豐智能櫃, 順豐派送時將會收取額外附加費 <br /><br />
                                <span style="text-decoration:underline;">交貨時間</span><br />
                                確認付款後，5星期內送貨 (如需更換照片，以照片更新日為準)
                            </td>
                            </tr>
                        </table>

                        <!-- After-Sales Instructions -->
                        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px; padding:20px;">
                            <tr>
                            <td style="font-size:18px; font-family:Helvetica; font-weight:700;">售後說明</td>
                            </tr>
                            <tr>
                            <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                <span style="text-decoration:underline;">關於退換貨</span><br />
                                只要符合下述條件其中一項就可以提出退貨申請：<br />
                                1. 實際收到的貨品與所訂購貨品不符合<br />
                                2. 貨品有瑕疵或於運送過程中有損壞<br />
                                退貨請於收到貨品3個工作天內提出換貨申請，<br />
                                經專人核實後將提供一換一服務，詳情請參閱使用條款
                            </td>
                            </tr>
                        </table>

                        <!-- Contact -->
                        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px; padding:20px;">
                            <tr>
                            <td style="font-size:18px; font-family:Helvetica; font-weight:700;">
                                如有任何疑問，請回覆本電子郵件或<br />WhatsApp：5988 4711 / 5576 4375聯絡我們
                            </td>
                            </tr>
                        </table>

                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:32px 0 40px 0;">
                            <tr>
                                <td align="center">
                                    <table border="0" cellspacing="0" cellpadding="0" role="presentation">
                                        <tr>
                                            <td style="border-radius:8px; background-color:#FFB60C;">
                                                <a href="https://www.ptag.com.hk/ptag-air/confirmation?qr=${order.newOrderVerification_id}" 
                                                target="_blank" 
                                                style="background-color:#FFB60C; border:2px solid #FFB60C; border-radius:8px; color:#050505; display:inline-block; font-family:Helvetica,Arial,sans-serif; font-size:18px; font-weight:bold; line-height:48px; padding:0 40px; text-align:center; text-decoration:none; min-width:200px; -webkit-text-size-adjust:none; mso-hide:all;">
                                                    查看訂單詳情
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        </td>
                    </tr>
                    </table>
                </td>
                </tr>
            </table>
        </body>
        </html>
        `;

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        cc,
        subject,
        html,
    });
}

async function sendPtagDetectionEmail(to, subject, petDetails, cc) {
    let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465,
        secure: true,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    })

    const html =
        `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="format-detection" content="telephone=no">
            <title>PTag | 您的寵物 ${petDetails.name} (${petDetails.tagId}) 最新位置更新</title>
        </head>
        <body style="margin:0; padding:0; background:#f4f4f4; font-family:Helvetica,Arial,sans-serif; color:#050505; font-size:16px; line-height:1.4;">
            <body style="margin:0; padding:0; background:#f4f4f4; font-family:Helvetica,Arial,sans-serif; color:#050505; font-size:16px; line-height:1.4;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                <td align="center">
                    <table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px; background:white; margin:20px 0;">
                        <tr>
                        <td style="padding:20px;">
                        <!-- Header -->
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                            <td style="font-size:56px; font-family:Helvetica; font-weight:700; color:#050505; padding-left:20px;">PTag</td>
                            </tr>
                        </table>

                        <!-- Body -->
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding-top:40px; padding-left:20px;">
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400;">您好,</td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                    感謝您使用PTag寵物牌。<br />
                                    我們偵測到寵物${petDetails.name} (${petDetails.tagId}) 位置：<br />
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:20px; font-family:Helvetica; font-weight:700; padding-top:20px;">
                                    🐾 最新位置更新時間：${petDetails.dateTime}<br />
                                    🐾 當前位置：請點擊 
                                    <a href="${petDetails.locationURL}" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style="color: #11A4E1; text-decoration: none; font-weight: bold;">
                                        [現時寵物位置]
                                    </a> 
                                    查看實時地圖
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:20px;">
                                    如果您的寵物目前不在預期位置，建議您盡快前往該位置尋找。
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:40px;">
                                    如有任何疑問，請回覆本電子郵件告知
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                    PTag
                                </td>
                            </tr>
                        </table>

                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:30px 0;">
                            <tr>
                                <td style="font-size:0; line-height:0; height:1px; background:#cccccc;">&nbsp;</td>
                            </tr>
                        </table>

                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                            <td style="font-size:56px; font-family:Helvetica; font-weight:700; color:#050505; padding-left:20px;">PTag</td>
                            </tr>
                        </table>

                        <!-- Body -->
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding-top:40px; padding-left:20px;">
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400;">Hello,</td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                    Thank you for using PTag. <br />
                                    We have detected the location of pet ${petDetails.name} (${petDetails.tagId}):<br />
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:20px; font-family:Helvetica; font-weight:700; padding-top:20px;">
                                    🐾 Latest location update time: ${petDetails.dateTime}.<br />
                                    🐾 Current location: Please click  
                                    <a href="${petDetails.locationURL}" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        style="color: #11A4E1; text-decoration: none; font-weight: bold;">
                                        [Current Pet Location]
                                    </a> 
                                    to view the real-time map.
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:20px;">
                                    If your pet is not currently at the expected location, we recommend that you go to that location to look for it as soon as possible.。
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:40px;">
                                    If you have any questions, please reply to this email.
                                </td>
                            </tr>
                            <tr>
                                <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                    PTag
                                </td>
                            </tr>
                        </table>
                        </td>
                    </tr>
                    </table>
                </td>
                </tr>
            </table>
        </body>
        </html>
        `;

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        cc,
        subject,
        html,
    });
}

const generateTagId = () => {
    const alphabet = 'ACDEFGHJKLMNPQRTUVWXYZ';
    const number = '23456789';
    return (
        alphabet[Math.floor(Math.random() * alphabet.length)] +
        number[Math.floor(Math.random() * number.length)] +
        alphabet[Math.floor(Math.random() * alphabet.length)] +
        number[Math.floor(Math.random() * number.length)] +
        alphabet[Math.floor(Math.random() * alphabet.length)] +
        number[Math.floor(Math.random() * number.length)]
    );
};

const generateQrCodeImage = async (order, shortUrl, tagId) => {
    if (order.isPTagAir) {
        return `${BASE_URL}/pet-images/ptag+id.png`;
    }
    try {
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shortUrl)}`;
        const response = await axios.get(qrCodeUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');

        // Connect to primary database for writes
        await connectToMongoDB();
        const ImageCollection = mongoose.model('ImageCollection');
        const img = await ImageCollection.create({});
        const fileName = `${img._id}.png`;
        const url = `${BASE_URL}/qr-codes/${fileName}`;
        const s3Params = {
            Bucket: BUCKET,
            Key: `qr-codes/${fileName}`,
            Body: imageBuffer,
            ACL: 'public-read',
            ContentType: 'image/png',
        };
        await s3Client.send(new PutObjectCommand(s3Params));
        await ImageCollection.updateOne(
            { _id: img._id },
            {
                fileName,
                url,
                fileSize: imageBuffer.length / (1024 * 1024),
                mimeType: 'image/png',
                owner: 'system',
            }
        );


        return url;
    } catch (error) {
        console.error('Error downloading/uploading QR code:', error.message);
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shortUrl)}`;
    }
};

async function shortenUrl(longUrl) {
    try {
        const response = await axios.get('https://cutt.ly/api/api.php', {
            params: { key: process.env.CUTTLY_API_KEY, short: longUrl },
        });
        if (response.data.url && response.data.url.shortLink) {
            return response.data.url.shortLink;
        }
        console.error('Cutt.ly API error:', response.data);
        return longUrl;
    } catch (error) {
        console.error('Error shortening URL:', error.message);
        return longUrl;
    }
}

const generateShortUrl = async (order, tagId) => {
    if (order.isPTagAir) {
        return 'www.ptag.com.hk/landing';
    }
    const longUrl = `https://www.ptag.com.hk/php/qr_info.php?qr=${tagId}`;
    return await shortenUrl(longUrl);
};

exports.handler = async (event, context) => {
    // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        // Get connection for reads
        const readConn = await getReadConnection();

        const Order = readConn.model('Order');
        const ShopInfo = readConn.model('ShopInfo');
        const OrderVerification = readConn.model('OrderVerification');

        const isShopInfo = event.resource?.includes("/shop-info") || event.path?.includes("/shop-info");
        const isConfirmation = event.resource?.includes("/confirmation") || event.path?.includes("/confirmation");
        const isOrder = event.resource?.includes("/orders") || event.path?.includes("/orders");
        const isOrderVerification = event.resource?.includes("/order-verification") || event.path?.includes("/order-verification");
        const isWhatsAppSFMessage = event.resource?.includes("/whatsapp-SF-message") || event.path?.includes("/whatsapp-SF-message");
        const isSendPtagDetectionEmail = event.resource?.includes("/send-ptag-detection-email") || event.path?.includes("/send-ptag-detection-email");
        const orderVerification_to_delete = event.pathParameters?.orderVerificationId;

        const { httpMethod, path } = event;

        // Helper function to format API Gateway response
        const formatResponse = (statusCode, body) => ({
            statusCode,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(body),
        });

        // Handle routes
        if (httpMethod === 'POST' && isConfirmation) {
            const parsed = await parse(event, true);
            const {
                lastName,
                phoneNumber,
                address,
                email,
                option,
                type,
                tempId,
                paymentWay,
                shopCode,
                delivery,
                price,
                promotionCode,
                petContact,
                petName,
                optionImg,
                optionSize,
                optionColor,
                lang,
            } = parsed;

            // Safely extract files by fieldname — support multiple files
            const petImgFile = (parsed.files || [])
                .filter(f => f.fieldname === 'pet_img');

            const discountProofFile = (parsed.files || [])
                .filter(f => f.fieldname === 'discount_proof');

            console.log(parsed, petImgFile, discountProofFile);


            let petImgUrl = '';
            if (petImgFile) {
                let images = petImgFile.map((file) => ({
                    buffer: file.content,
                    originalname: file.filename,
                }));
                const folder = `user-uploads/orders/${tempId}`;
                const urls = await Promise.all(
                    images.map(async (image) => await addImageFileToStorage(image, folder, 'user'))
                );
                petImgUrl = urls[0] || '';
            }

            // Save discount proof file
            let discountProofUrl = '';
            if (discountProofFile) {
                let proofFiles = discountProofFile.map((file) => ({
                    buffer: file.content,
                    originalname: file.filename,
                }));
                const folder = `user-uploads/orders/${tempId}/discount-proofs`;
                const urls = await Promise.all(
                    proofFiles.map(async (file) => await addImageFileToStorage(file, folder, 'user'))
                );
                discountProofUrl = urls[0] || '';
            }

            // Connect to primary database for writes
            await connectToMongoDB();
            const PrimaryOrder = mongoose.model('Order');

            const order = new PrimaryOrder({
                lastName, phoneNumber, address, email, option, type, tempId,
                petImg: petImgUrl, paymentWay, shopCode, delivery, price, promotionCode,
                petContact, petName, buyDate: new Date(),
                isPTagAir: option === 'PTagAir' || option === 'PTagAir_member',
                sfWayBillNumber: null, language: lang,
            });
            await order.save();

            let tagId;
            let isUnique = false;
            // Use read connection for checking uniqueness
            const readConnForCheck = await getReadConnection();
            const OrderVerificationForCheck = readConnForCheck.model('OrderVerification');
            while (!isUnique) {
                tagId = generateTagId();
                const existingTag = await OrderVerificationForCheck.findOne({ tagId });
                if (!existingTag) {
                    isUnique = true;
                }
            }
            const shortUrl = await generateShortUrl(order, tagId);

            // Connect to primary database for writes
            await connectToMongoDB();
            const PrimaryOrderVerification = mongoose.model('OrderVerification');

            const orderVerification = new PrimaryOrderVerification({
                tagId, staffVerification: false, contact: phoneNumber, verifyDate: null,
                tagCreationDate: order.buyDate, petName: petName, masterEmail: email,
                shortUrl, qrUrl: await generateQrCodeImage(order, shortUrl, tagId),
                petUrl: petImgUrl, orderId: tempId, location: address, petHuman: lastName,
                pendingStatus: false, option: option, type: type, optionSize: optionSize,
                optionColor: optionColor, price: price, discountProof: discountProofUrl, 
                cancelled: false
            });
            const newOrderVerification = await orderVerification.save();
            const newOrderVerification_id = newOrderVerification._id;

            await sendOrderEmail(email, `PTag 訂單資料：${tempId}`, {
                lastName, phoneNumber, address, email, option, type, tempId,
                petImg: petImgUrl, paymentWay, shopCode, delivery, price, promotionCode,
                petContact, petName, optionImg, optionColor, optionSize, newOrderVerification_id
            }, "support@ptag.com.hk");

            //whatsapp Order Success Message
            if (!phoneNumber) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Missing phone number' }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                };
            }

            const headers = {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                Authorization: process.env.WHATSAPP_BEARER_TOKEN
            };

            const whatsappNumber = `+852${phoneNumber}`;

            // const data = {
            //     messaging_product: "whatsapp",
            //     recipient_type: "individual",
            //     to: whatsappNumber,
            //     template: {
            //         name: "hello_world",
            //         language: {
            //             code: "en_US"
            //         }
            //     }
            // };

            let templateName;
            let languageCode;

            if (lang === 'chn') {
                templateName = 'ptag_order_chn';
                languageCode = 'zh_CN'; 
            } else {
                templateName = 'ptag_order_eng';
                languageCode = 'en';
            }

            const data = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: whatsappNumber,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: [
                        // Body parameters ({{1}}, {{2}}, {{3}})
                        {
                            type: "body",
                            parameters: [
                                { type: "text", text: lastName },
                                { type: "text", text: option === "PTagAir" ? "Ptag Air" : 'PTag' },
                                { type: "text", text: tempId },
                            ],
                        },
                        // Button parameter ({{4}} – dynamic URL suffix)
                        {
                            type: "button",
                            sub_type: "url",
                            index: 0,
                            parameters: [
                                {
                                    type: "text",
                                    text: newOrderVerification_id,
                                },
                            ],
                        },
                    ],
                },
            };

            const result = await postData(
                "https://graph.facebook.com/v22.0/942066048990138/messages",
                data,
                headers
            );

            console.log("result: ", result);


            return formatResponse(200, {
                success: true,
                message: `Order placed successfully.`,
                purchase_code: tempId,
                price,
                _id: newOrderVerification_id,
            });
        }

        if (isSendPtagDetectionEmail) {
            const body = JSON.parse(event.body || '{}');
            const {
                name,
                tagId,
                dateTime,
                locationURL,
                email,
            } = body;

            await sendPtagDetectionEmail(email, `PTag | 您的寵物 ${name} (${tagId}) 最新位置更新 | Your pet ${name} (${tagId}) Latest location update`,
                { name, tagId, dateTime, locationURL }, "notification@ptag.com.hk");

            return formatResponse(200, {
                success: true,
                message: `Email sent successfully.`,
            });
        }

        if (httpMethod === 'GET' && isOrder) {
            // Use read connection
            const readConnOrders = await getReadConnection();
            const OrderModel = readConnOrders.model('Order');
            const orders = await OrderModel.find({});
            return formatResponse(200, { success: true, orders });
        }

        if (httpMethod === 'GET' && isShopInfo) {
            // Use read connection
            const readConnShopInfo = await getReadConnection();
            const ShopInfoModel = readConnShopInfo.model('ShopInfo');
            const shopInfo = await ShopInfoModel.find({});
            return formatResponse(200, { success: true, shopInfo });
        }

        if (httpMethod === 'GET' && isOrderVerification) {
            // Use read connection
            const readConnOrderVerification = await getReadConnection();
            const OrderVerificationModel = readConnOrderVerification.model('OrderVerification');
            const orderVerification = await OrderVerificationModel.find({});
            return formatResponse(200, { success: true, orderVerification });
        }

        // if (httpMethod === 'DELETE' && isOrder) {
        //     await Order.deleteMany({});
        //     return formatResponse(200, { success: true, message: 'All orders deleted' });
        // }

        // if (httpMethod === 'DELETE' && isOrderVerification) {
        //     await OrderVerification.deleteMany({});
        //     return formatResponse(200, { success: true, message: 'All order verifications deleted' });
        // }

        if (httpMethod === 'DELETE' && orderVerification_to_delete) {
            // Connect to primary database for writes
            await connectToMongoDB();
            const PrimaryOrderVerificationDelete = mongoose.model('OrderVerification');

            await PrimaryOrderVerificationDelete.deleteOne({ _id: orderVerification_to_delete });

            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "Id deleted successfully!",
                    orderVerificationId: orderVerification_to_delete,
                }),
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            };
        }

        if (httpMethod === 'POST' && isWhatsAppSFMessage) {
        }

        return formatResponse(404, { success: false, message: 'Route not found' });
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, message: 'System busy, please try again later.' }),
        };
    }
};