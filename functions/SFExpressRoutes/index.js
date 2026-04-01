const https = require('https');
const crypto = require('crypto');
const axios = require('axios');
const querystring = require('querystring');
const mongoose = require('mongoose');
const OrderSchema = require('./models/Order');
const nodemailer = require('nodemailer');

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
    if (conn == null) {
        conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log('MongoDB primary connected to database: petpetclub');
        // Register schemas
        mongoose.model('Order', OrderSchema, 'order');
    }
    return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
    return await connectToMongoDB();
};

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateMsgDigest({ msgData, timestamp, checkword }) {
    const input = msgData + timestamp + checkword;
    const urlEncoded = encodeURIComponent(input);
    const hash = crypto.createHash('md5').update(urlEncoded, 'utf8').digest();
    return hash.toString('base64');
}

// Step 1: Get Access Token from SF Express
async function getAccessToken() {
    const partnerID = process.env.SF_CUSTOMER_CODE;
    // const secret = process.env.SF_SANDBOX_CHECK_CODE;
    const secret = process.env.SF_PRODUCTION_CHECK_CODE;

    // const url = 'https://sfapi-sbox.sf-express.com/oauth2/accessToken'; // for testing
    const url = 'https://sfapi.sf-express.com/oauth2/accessToken'; // for production
    const postData = querystring.stringify({
        grantType: 'password',
        secret: secret,
        partnerID: partnerID
    });

    const options = {
        // hostname: 'sfapi-sbox.sf-express.com', // for test
        hostname: 'sfapi.sf-express.com', // for prod
        path: '/oauth2/accessToken',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.accessToken) {
                        resolve(json.accessToken);
                    } else {
                        reject(new Error(`Token error: ${JSON.stringify(json)}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Helper to download the PDF (only needed for Option 2)
async function downloadPdf(url, token) {
    const parsed = new URL(url);
    const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { 'X-Auth-token': token },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`Download failed: ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.end();
    });
}

async function sendwayBillEmail(to, subject, wayBillNo, pdfBuffer) {
    let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465,
        secure: true,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    })

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="format-detection" content="telephone=no">
            <title>PTag | PDF of Waybill: ${wayBillNo}</title>
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

                                    <!-- Body -->
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding-top:40px; padding-left:20px;">
                                        <tr>
                                            <td style="font-size:18px; font-family:Helvetica; font-weight:400;">Hello,</td>
                                        </tr>
                                        <tr>
                                            <td style="font-size:18px; font-family:Helvetica; font-weight:400; padding-top:10px;">
                                                Please find the attached waybill PDF for <strong>${wayBillNo}</strong>.<br />                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="font-size:18px; font-family:Helvetica; font-weight:400;padding-top:10px;">Best regards,</td>
                                        </tr>
                                        <tr>
                                            <td style="font-size:18px; font-family:Helvetica; font-weight:400;">PTag</td>
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

    // Send email with PDF attachment
    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject: subject,
        html,
        attachments: [
            {
                filename: `Waybill_${wayBillNo}.pdf`,   // e.g. Waybill_SF5102635685184.pdf
                content: pdfBuffer,                     // Buffer containing PDF binary
                contentType: 'application/pdf',
            },
        ],
    });
}

exports.handler = async (event) => {
    try {
        // Get connection for reads
        const readConn = await getReadConnection();
        
        const CUSTOMER_CODE = process.env.SF_CUSTOMER_CODE;
        const SANDBOX_CHECK_CODE = process.env.SF_SANDBOX_CHECK_CODE;
        const PRODUCTION_CHECK_CODE = process.env.SF_PRODUCTION_CHECK_CODE;

        const sfCreateOrder = event.resource?.includes("/create-order") || event.path?.includes("/create-order");
        const GetPickupLocation = event.resource?.includes("/get-pickup-locations") || event.path?.includes("/get-pickup-locations");
        const GetToken = event.resource?.includes("/get-token") || event.path?.includes("/get-token");
        const GetArea = event.resource?.includes("/get-area") || event.path?.includes("/get-area");
        const GetNetCode = event.resource?.includes("/get-netCode") || event.path?.includes("/get-netCode");
        const sfPrintCloudWayBill = event.resource?.includes("/print-cloud-waybill") || event.path?.includes("/print-cloud-waybill");
        const GetPdfWayBill = event.resource?.includes("/get-pdf-wayBill") || event.path?.includes("/get-pdf-wayBill");

        if (sfCreateOrder) {
            // Use read connection for finding orders
            const OrderRead = readConn.model('Order');
            const customerDetails = JSON.parse(event.body || '{}');
            console.log("boyd", customerDetails)

            if (!customerDetails.lastName || !customerDetails.phoneNumber || !customerDetails.address) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Missing details' }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                };
            }

            const generate_orderId = "T" + Math.floor(Math.random() * 1e10);


            const innerRequest = {
                expressTypeId: 1,
                payMethod: 1,
                isGenEletricPic: 1,
                isReturnRouteLabel: 1,
                cargoDetails: [{ name: 'PTag', count: customerDetails.count }], // if single order count : 1
                contactInfoList: [
                    {
                        contactType: 1,
                        contact: 'Pet Pet Club',
                        tel: '85255764375',
                        country: 'HK',
                        province: 'Hong Kong',
                        city: 'Tsuen Wan',
                        address: 'D3, 29/F, TML Tower, 3 Hoi Shing Road, Tsuen Wan',
                    },
                    {
                        contactType: 2,
                        contact: customerDetails.lastName,
                        tel: customerDetails.phoneNumber,
                        country: 'HK',
                        province: 'Hong Kong',
                        city: 'Hong Kong',
                        address: customerDetails.address,
                    },
                ],
                language: 'zh-CN',
                orderId: generate_orderId,
                custId: CUSTOMER_CODE,
                extraInfoList: [
                    {
                        attrName: customerDetails.attrName,
                        attrVal: customerDetails.netCode,
                    },
                ]
            };

            console.log("sf data:", innerRequest);
            const msgDataStr = JSON.stringify(innerRequest);
            const timestamp = Date.now().toString();
            const requestID = generateUUID();

            // const msgDigest = generateMsgDigest({
            //     msgData: msgDataStr,
            //     timestamp: timestamp,
            //     checkword: SANDBOX_CHECK_CODE
            // });

            const accessToken = await getAccessToken();

            const postData = querystring.stringify({
                partnerID: CUSTOMER_CODE,
                requestID: requestID,
                serviceCode: 'EXP_RECE_CREATE_ORDER',
                timestamp: timestamp,
                accessToken: accessToken,
                msgData: msgDataStr,
            });

            // const config = {
            //     url: 'https://sfapi-sbox.sf-express.com/std/service',
            // }; // for test
            const config = {
                url: 'https://sfapi.sf-express.com/std/service',
            }; // for prod

            const parsedUrl = new URL(config.url);

            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            console.log("sf response data:", postData);

            // d) Call SF Express (promise-wrapped https.request)
            const sfResponse = await new Promise((resolve, reject) => {
                const req = https.request(options, res => {
                    let raw = '';
                    res.on('data', chunk => (raw += chunk));
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(raw);
                            resolve({ status: res.statusCode, body: parsed });
                        } catch (e) {
                            reject(new Error('SF Express returned invalid JSON'));
                        }
                    });
                });

                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            console.log("sf Response:", sfResponse);

            // e) Handle SF Express result
            if (sfResponse.status < 200 || sfResponse.status >= 300) {
                throw new Error(`SF API error ${sfResponse.status}: ${JSON.stringify(sfResponse.body)}`);
            }

            const apiResultData = JSON.parse(sfResponse.body.apiResultData);
            const msgData = apiResultData.msgData;

            console.log(msgData)

            const trackingNumber = msgData?.waybillNoInfoList?.[0]?.waybillNo;

            // Connect to primary database for writes
            await connectToMongoDB();
            const OrderModel = mongoose.model('Order');

            //FOR MULTIPLE ORDER
            if (customerDetails.tempIdList) {
                let orderDoc;
                for (let i = 0; i < customerDetails.tempIdList.length; i++) {
                    // Use read connection to find order
                    orderDoc = await OrderRead.findOne({ tempId: customerDetails.tempIdList[i] });

                    if (orderDoc) {
                        // Update in primary database
                        await OrderModel.updateOne(
                            { tempId: customerDetails.tempIdList[i] },
                            {
                                $set: {
                                    sfWayBillNumber: trackingNumber,
                                }
                            }
                        );

                    }
                }
            } else { // FOR SINGLE ORDER
                // Use read connection to find order
                let orderDoc = await OrderRead.findOne({ tempId: customerDetails.tempId });

                if (orderDoc) {
                    // Update in primary database
                    await OrderModel.updateOne(
                        { tempId: customerDetails.tempId },
                        {
                            $set: {
                                sfWayBillNumber: trackingNumber,
                            }
                        }
                    );

                }
            }


            // g) Success response
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    success: true,
                    message: 'Test order created and saved',
                    tempIdList: customerDetails.tempIdList,
                    trackingNumber,
                }, null, 2),
            };
        }
        if (sfPrintCloudWayBill) {
            const customerDetails = JSON.parse(event.body || '{}');

            // Basic validation
            if (!customerDetails.waybillNo) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'Missing waybillNo' }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                };
            }

            // ── NEW 2.0 msgData (official format) ─────────────────────────────────────
            const msgData = {
                templateCode: "fm_150_standard_YCSKUUQ3",   // ← keep your template
                version: "2.0",
                fileType: "pdf",
                sync: true,                                 // true = sync, false = async
                documents: [
                    {
                        masterWaybillNo: customerDetails.waybillNo,
                        // add more fields here if you need them:
                        // remark, waybillNoCheckType, waybillNoCheckValue, customData, etc.
                    }
                ]
                // extJson: { mergePdf: true, ... }   // optional
            };

            console.log("SF Cloud Print 2.0 request (msgData):", msgData);

            const msgDataStr = JSON.stringify(msgData);
            const timestamp = Date.now().toString();
            const requestID = generateUUID();

            const accessToken = await getAccessToken();

            // Form data (application/x-www-form-urlencoded)
            const postData = querystring.stringify({
                partnerID: CUSTOMER_CODE,
                requestID: requestID,
                serviceCode: 'COM_RECE_CLOUD_PRINT_WAYBILLS',
                timestamp: timestamp,
                accessToken: accessToken,      // OAuth2 (recommended)
                // msgDigest: ...              // only if you use digital signature instead
                msgData: msgDataStr,
            });

            const config = {
                url: 'https://bspgw.sf-express.com/std/service',   // production
                // url: 'https://sfapi-sbox.sf-express.com/std/service', // sandbox
            };

            const parsedUrl = new URL(config.url);

            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData),
                },
            };

            console.log("SF Cloud Print post data:", postData);

            // HTTPS request
            const sfResponse = await new Promise((resolve, reject) => {
                const req = https.request(options, res => {
                    let raw = '';
                    res.on('data', chunk => { raw += chunk; });
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(raw);
                            resolve({ status: res.statusCode, body: parsed });
                        } catch (e) {
                            reject(new Error('SF returned invalid JSON'));
                        }
                    });
                });

                req.on('error', reject);
                req.write(postData);
                req.end();
            });

            console.log("SF Cloud Print response:", sfResponse);

            if (sfResponse.status < 200 || sfResponse.status >= 300) {
                throw new Error(`HTTP error ${sfResponse.status}: ${JSON.stringify(sfResponse.body)}`);
            }

            if (sfResponse.body.apiResultCode !== 'A1000') {
                throw new Error(`SF outer failure: ${sfResponse.body.apiErrorMsg || 'Unknown'}`);
            }

            // Parse inner business result
            let apiResultData;
            try {
                apiResultData = JSON.parse(sfResponse.body.apiResultData || '{}');
            } catch (e) {
                throw new Error('Failed to parse apiResultData: ' + e.message);
            }

            if (apiResultData.success === false) {
                throw new Error(`SF business error: ${apiResultData.errorMessage || 'Unknown error'}`);
            }

            // ── Extract download info (official sync response) ───────────────────────
            const files = apiResultData.obj?.files || [];
            if (files.length === 0) {
                throw new Error('No print file returned');
            }

            const file = files[0];   // single document → one file (or sort by seqNo if needed)

            // Option 1: return download URL + token
            // return {
            //     statusCode: 200,
            //     headers: {
            //         "Content-Type": "application/json",
            //         "Access-Control-Allow-Origin": "*",
            //     },
            //     body: JSON.stringify({
            //         success: true,
            //         message: 'Cloud waybill label generated successfully',
            //         waybillNo: customerDetails.waybillNo,
            //         downloadInfo: {
            //             url: file.url,           // GET this URL
            //             token: file.token,       // put in header: X-Auth-token
            //             waybillNo: file.waybillNo,
            //             seqNo: file.seqNo,
            //             pageCount: file.pageCount,
            //         }
            //     }, null, 2),
            // };

            // Option 2: actual pdf
            const pdfBuffer = await downloadPdf(file.url, file.token);

            await sendwayBillEmail("notification@ptag.com.hk",
                 `PTag Waybill PDF - ${customerDetails.waybillNo}`, customerDetails.waybillNo, pdfBuffer);

            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    success: true,
                    waybillNo: customerDetails.waybillNo,
                }, null, 2),
            };
        }
        if (GetToken) {
            const response = await axios.post(
                // "http://hksfaddsit.sf-express.com/api/address_api/login", //uat
                "http://hksfadd.sf-express.com/api/address_api/login",
                {},
                {
                    headers: {
                        // "api-key": "N01GIGDU63TXRTIM0SE8O9QH2IA7J", // uat
                        "api-key": "CJ2GU9NQ39GA9XFLBUTZJC0G650AT", //production key
                        "Content-Type": "application/json"
                    }
                }
            );

            bearer_token = response.data.data;

            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    bearer_token: bearer_token,
                }, null, 2),
            };
        }
        if (GetArea) {
            const data = JSON.parse(event.body || '{}');

            const response = await axios.get(
                "http://hksfaddsit.sf-express.com/api/address_api/area",
                {
                    headers: {
                        "Content-Type": "application/json",
                        'Authorization': `Bearer ${data.token}`
                    }
                }
            );
            const area_list = response.data.data;
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    area_list
                }, null, 2),
            };
        }
        if (GetNetCode) {
            const data = JSON.parse(event.body || '{}');

            const response = await axios.get(
                `http://hksfaddsit.sf-express.com/api/address_api/netCode?typeId=${data.typeId}&areaId=${data.areaId}`,
                {
                    headers: {
                        "Content-Type": "application/json",
                        'Authorization': `Bearer ${data.token}`
                    }
                }
            );
            const netCode = response.data.data;
            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    netCode
                }, null, 2),
            };
        }

        if (GetPickupLocation) {
            const data = JSON.parse(event.body || '{}');
            const { token, netCode, lang } = data;

            const addressPromises = netCode.map(async (item) => {
                const response = await axios.get(
                    `http://hksfaddsit.sf-express.com/api/address_api/address?lang=${lang}&netCode=${item}`,
                    {
                        headers: {
                            "Content-Type": "application/json",
                            'Authorization': `Bearer ${token}`
                        },
                    }
                );

                return response.data.data;
            });

            const addresses = await Promise.all(addressPromises)

            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    addresses
                }, null, 2),
            };
        }
    } catch (err) {
        console.error('Lambda error:', err);
        return {
            statusCode: err.statusCode || 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: err.message || 'Internal Server Error',
            }),
        };
    }
};