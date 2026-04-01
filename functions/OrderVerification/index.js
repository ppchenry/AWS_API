import mongoose from "mongoose";
import orderVerificationSchema from "./models/OrderVerification.js";
import orderSchema from "./models/Order.js";
import { parse } from "lambda-multipart-parser";


// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

function parseDDMMYYYY(dateString) {
    if (!dateString) return null;

    // If it's already an ISO string, use it directly
    if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(dateString);
    }

    // Parse DD/MM/YYYY format
    const [day, month, year] = dateString.split("/");
    if (
        day &&
        month &&
        year &&
        day.length <= 2 &&
        month.length <= 2 &&
        year.length === 4
    ) {
        return new Date(year, month - 1, day);
    }

    // Fallback to original parsing
    return new Date(dateString);
}

async function postData(url = "", data = {}, headers) {
    // Default options are marked with *
    const response = await fetch(url, {
        method: "POST", // *GET, POST, PUT, DELETE, etc.
        headers: headers,
        body: JSON.stringify(data), // body data type must match "Content-Type" header
    });
    return response.json(); // parses JSON response into native JavaScript objects
}

const connectToMongoDB = async () => {
    if (conn == null) {
        conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("MongoDB primary connected to database: petpetclub");
        mongoose.model("OrderVerification", orderVerificationSchema, "orderVerification");
        mongoose.model("Order", orderSchema, "order");
    }
    return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
    return await connectToMongoDB();
};

export const handler = async (event, context) => {
    // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        // Get connection for reads
        const readConn = await getReadConnection();

        const isSupplierPath = event.resource?.includes("/orderVerification/supplier") || event.path?.includes("/orderVerification/supplier");
        const isWhatsAppOrderLink = event.resource?.includes("/orderVerification/whatsapp-order-link") || event.path?.includes("/orderVerification/whatsapp-order-link");
        const isOrderInfo = event.resource?.includes("/orderVerification/ordersInfo") || event.path?.includes("/orderVerification/ordersInfo");
        const isGetAllOrders = event.resource?.includes("/orderVerification/getAllOrders") || event.path?.includes("/orderVerification/getAllOrders");

        if (isSupplierPath) {
            let orderId = event.pathParameters?.orderId;

            if (!orderId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "orderId is required" }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*", // Enable CORS if needed
                    },
                };
            }

            // Use read connection for reads
            let OrderVerificationRead = readConn.model("OrderVerification");
            // Connect to primary for writes
            await connectToMongoDB();
            let OrderVerification = mongoose.model("OrderVerification");

            const httpMethod = event.httpMethod;
            switch (httpMethod) {
                case "GET": {
                    // Use read connection for finding OrderVerification
                    let orderVerify = await OrderVerificationRead.findOne({ orderId: orderId });
                    if (orderVerify == null) {
                        orderVerify = await OrderVerificationRead.findOne({ contact: orderId });
                    }
                    if (orderVerify == null) {
                        orderVerify = await OrderVerificationRead.findOne({ tagId: orderId });
                    }
                    console.log("ALL:", orderVerify);

                    if (!orderVerify) {
                        return {
                            statusCode: 404,
                            body: JSON.stringify({ error: "Order Verification not found" }),
                            headers: {
                                "Content-Type": "application/json",
                                "Access-Control-Allow-Origin": "*",
                            },
                        };
                    }

                    // Construct the response form
                    let form = {
                        tagId: orderVerify.tagId,
                        staffVerification: orderVerify.staffVerification,
                        contact: orderVerify.contact,
                        verifyDate: orderVerify.verifyDate,
                        tagCreationDate: orderVerify.tagCreationDate,
                        petName: orderVerify.petName,
                        shortUrl: orderVerify.shortUrl,
                        masterEmail: orderVerify.masterEmail,
                        qrUrl: orderVerify.qrUrl,
                        petUrl: orderVerify.petUrl,
                        orderId: orderVerify.orderId,
                        location: orderVerify.location,
                        petHuman: orderVerify.petHuman,
                        createdAt: orderVerify.createdAt,
                        updatedAt: orderVerify.updatedAt,
                        pendingStatus: orderVerify.pendingStatus,
                        option: orderVerify.option,
                        optionSize: orderVerify.optionSize,
                        optionColor: orderVerify.optionColor,
                    };

                    if (!form) {
                        return {
                            statusCode: 404,
                            body: JSON.stringify({ error: "Order Verification info not found, orderVerify:", orderVerify }),
                            headers: {
                                "Content-Type": "application/json",
                                "Access-Control-Allow-Origin": "*",
                            },
                        };
                    }

                    // Return the successful response
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: "Order Verification info retrieved successfully",
                            form: form,
                            id: orderVerify._id,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    };
                }
                case "PUT": {
                    const UpdatedTagInfo = await parse(event);
                    console.log("body", UpdatedTagInfo);
                    // Prepare update objects
                    const setFields = {};

                    // Fields to be updated with $set
                    if (UpdatedTagInfo.contact) setFields.contact = UpdatedTagInfo.contact;
                    if (UpdatedTagInfo.petName) setFields.petName = UpdatedTagInfo.petName;
                    if (UpdatedTagInfo.shortUrl) setFields.shortUrl = UpdatedTagInfo.shortUrl;
                    if (UpdatedTagInfo.masterEmail) setFields.masterEmail = UpdatedTagInfo.masterEmail;
                    if (UpdatedTagInfo.location) setFields.location = UpdatedTagInfo.location;
                    if (UpdatedTagInfo.petHuman) setFields.petHuman = UpdatedTagInfo.petHuman;
                    if (UpdatedTagInfo.pendingStatus) setFields.pendingStatus = UpdatedTagInfo.pendingStatus;
                    if (UpdatedTagInfo.updatedAt) setFields.updatedAt = parseDDMMYYYY(UpdatedTagInfo.updatedAt);
                    if (UpdatedTagInfo.qrUrl) setFields.qrUrl = UpdatedTagInfo.qrUrl;
                    if (UpdatedTagInfo.petUrl) setFields.petUrl = UpdatedTagInfo.petUrl;

                    if (UpdatedTagInfo.petContact) {
                        let Order = mongoose.model("Order");
                        await Order.updateOne(
                            { tempId: UpdatedTagInfo.orderId },
                            { $set: { petContact: UpdatedTagInfo.petContact } }
                        );

                    }

                    const updateOperation = {};
                    if (Object.keys(setFields).length > 0) updateOperation.$set = setFields;

                    // Perform the update operation in primary database
                    let orderVerify2 = await OrderVerification.updateOne({ orderId: orderId }, updateOperation);
                    if (orderVerify2.matchedCount === 0) {
                        orderVerify2 = await OrderVerification.updateOne({ contact: orderId }, updateOperation);
                    }
                    if (orderVerify2.matchedCount === 0) {
                        orderVerify2 = await OrderVerification.updateOne({ tagId: orderId }, updateOperation);
                    }


                    if (!orderVerify2) {
                        return {
                            statusCode: 404,
                            body: JSON.stringify({ error: "Order Verification not found for update" }),
                            headers: {
                                "Content-Type": "application/json",
                                "Access-Control-Allow-Origin": "*",
                            },
                        };
                    }

                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: "Tag info updated successfully",
                            orderVerify2: orderVerify2,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    };
                }
                default:
                    return {
                        statusCode: 405,
                        body: JSON.stringify({ error: "Method Not Allowed" }),
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    };

            }
        }
        else if (isOrderInfo) {
            let tempId = event.pathParameters?.tempId;

            // Use read connection for finding Order
            let OrderRead = readConn.model("Order");
            let orderVerify = await OrderRead.findOne({ tempId: tempId });

            // Construct the response form
            let form = {
                petContact: orderVerify.petContact,
            };

            if (!form) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: "Order info not found, orderVerify:", orderVerify }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                };
            }

            // Return the successful response
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "Order Verification info retrieved successfully",
                    form: form,
                    id: orderVerify._id,
                }),
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            };
        }
        else if (isWhatsAppOrderLink) {
            let _id = event.pathParameters?._id;

            if (!_id) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "_id is required" }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*", // Enable CORS if needed
                    },
                };
            }

            // Use read connection for finding OrderVerification
            let OrderVerificationRead = readConn.model("OrderVerification");
            let orderVerify = await OrderVerificationRead.findOne({ _id: _id });

            // Construct the response form
            let form = {
                tagId: orderVerify.tagId,
                staffVerification: orderVerify.staffVerification,
                contact: orderVerify.contact,
                verifyDate: orderVerify.verifyDate,
                tagCreationDate: orderVerify.tagCreationDate,
                petName: orderVerify.petName,
                shortUrl: orderVerify.shortUrl,
                masterEmail: orderVerify.masterEmail,
                qrUrl: orderVerify.qrUrl,
                petUrl: orderVerify.petUrl,
                orderId: orderVerify.orderId,
                location: orderVerify.location,
                petHuman: orderVerify.petHuman,
                pendingStatus: orderVerify.pendingStatus,
                option: orderVerify.option,
                price: orderVerify.price,
                type: orderVerify.type,
                optionSize: orderVerify.optionSize,
                optionColor: orderVerify.optionColor,
                createdAt: orderVerify.createdAt,
                updatedAt: orderVerify.updatedAt,
            };

            if (!form) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: "Order Verification info not found, orderVerify:", orderVerify }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                };
            }

            // Return the successful response
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: "Order Verification info retrieved successfully",
                    form: form,
                    id: orderVerify._id,
                }),
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            };
        }
        else if (isGetAllOrders) {
            // Use read connection for reads
            const AllOrdersRead = readConn.model("OrderVerification");

            const allOrders = await AllOrdersRead.find({
                cancelled: { $exists: true }   // ← alternative: any document that has the field
            }).lean();

            if (!allOrders || allOrders.length === 0) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: "No Latest PTag orders found" }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                };
            }

            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                body: JSON.stringify({
                    message: "Latest PTag orders retrieved successfully",
                    allOrders,
                }),
            };
        }
        else {
            const tagId = event.pathParameters?.tagId;
            if (!tagId) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: "tagId is required" }),
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*", // Enable CORS if needed
                    },
                };
            }

            // Use read connection for reads
            let OrderVerificationRead = readConn.model("OrderVerification");
            // Connect to primary for writes
            await connectToMongoDB();
            let OrderVerification = mongoose.model("OrderVerification");

            let orderVerify = await OrderVerificationRead.findOne({ tagId: tagId });

            const httpMethod = event.httpMethod;
            switch (httpMethod) {
                case "GET": {
                    // Construct the response form
                    let form = {
                        tagId: orderVerify.tagId,
                        staffVerification: orderVerify.staffVerification,
                        contact: orderVerify.contact,
                        verifyDate: orderVerify.verifyDate,
                        tagCreationDate: orderVerify.tagCreationDate,
                        petName: orderVerify.petName,
                        shortUrl: orderVerify.shortUrl,
                        masterEmail: orderVerify.masterEmail,
                        qrUrl: orderVerify.qrUrl,
                        petUrl: orderVerify.petUrl,
                        orderId: orderVerify.orderId,
                        location: orderVerify.location,
                        petHuman: orderVerify.petHuman,
                        createdAt: orderVerify.createdAt,
                        updatedAt: orderVerify.updatedAt,
                        pendingStatus: orderVerify.pendingStatus,
                        option: orderVerify.option,
                    };

                    if (!form) {
                        return {
                            statusCode: 404,
                            body: JSON.stringify({ error: "Order Verification info not found" }),
                            headers: {
                                "Content-Type": "application/json",
                                "Access-Control-Allow-Origin": "*",
                            },
                        };
                    }

                    // Use read connection for reads
                    let OrderRead = readConn.model("Order");

                    const OrderTable = await OrderRead.findOne({ tempId: orderVerify.orderId });

                    // Return the successful response
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: "Order Verification info retrieved successfully",
                            form: form,
                            id: orderVerify._id,
                            sf: OrderTable.sfWayBillNumber
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    };
                }
                case "PUT": {
                    const UpdatedTagInfo = JSON.parse(event.body || '{}');
                    // Prepare update objects
                    const setFields = {};

                    // Fields to be updated with $set
                    if (UpdatedTagInfo.staffVerification) setFields.staffVerification = UpdatedTagInfo.staffVerification;
                    if (UpdatedTagInfo.contact) setFields.contact = UpdatedTagInfo.contact;
                    if (UpdatedTagInfo.verifyDate) setFields.verifyDate = parseDDMMYYYY(UpdatedTagInfo.verifyDate);
                    if (UpdatedTagInfo.petName) setFields.petName = UpdatedTagInfo.petName;
                    if (UpdatedTagInfo.shortUrl) setFields.shortUrl = UpdatedTagInfo.shortUrl;
                    if (UpdatedTagInfo.masterEmail) setFields.masterEmail = UpdatedTagInfo.masterEmail;
                    if (UpdatedTagInfo.orderId) setFields.orderId = UpdatedTagInfo.orderId;
                    if (UpdatedTagInfo.location) setFields.location = UpdatedTagInfo.location;
                    if (UpdatedTagInfo.petHuman) setFields.petHuman = UpdatedTagInfo.petHuman;
                    if (UpdatedTagInfo.createdAt) setFields.createdAt = parseDDMMYYYY(UpdatedTagInfo.createdAt);

                    // Check for duplicate orderId (using read connection)
                    const CurrentOrderId = orderVerify.orderId;
                    if (UpdatedTagInfo.orderId !== undefined && UpdatedTagInfo.orderId !== CurrentOrderId) {
                        const orderId = UpdatedTagInfo.orderId;
                        const oldTagId = await OrderVerificationRead.findOne({ orderId });
                        if (oldTagId) {
                            return {
                                statusCode: 400,
                                body: JSON.stringify({ error: "Duplicated Tag info with OrderId" }),
                                headers: {
                                    "Content-Type": "application/json",
                                    "Access-Control-Allow-Origin": "*",
                                },
                            };
                        }
                    }
                    setFields.orderId = UpdatedTagInfo.orderId;

                    const updateOperation = {};
                    if (Object.keys(setFields).length > 0) updateOperation.$set = setFields;

                    // Perform the update operation in primary database
                    await OrderVerification.updateOne({ tagId: tagId }, updateOperation);

                    // ────────────────────────────────────────────────
                    // WHATSAPP MESSAGE
                    // ────────────────────────────────────────────────
                    let OrderRead = readConn.model("Order");
                    let OrderVerificationRead2 = readConn.model("OrderVerification");

                    const OrderVerificationTable = await OrderVerificationRead2.findOne({ tagId: tagId });
                    const OrderTable = await OrderRead.findOne({ tempId: OrderVerificationTable.orderId });

                    // Date calcultation
                    let estStart, estEnd;

                    if (OrderVerificationTable.verifyDate) {
                        const verifyDt = new Date(OrderVerificationTable.verifyDate);

                        // Example: +2 days start, +4 days end (adjust to your real SLA)
                        estStart = new Date(verifyDt);
                        estStart.setDate(verifyDt.getDate() + 2);

                        estEnd = new Date(verifyDt);
                        estEnd.setDate(verifyDt.getDate() + 4);
                    } else {
                        // Fallback if no verifyDate yet
                        estStart = new Date();
                        estStart.setDate(estStart.getDate() + 3);
                        estEnd = new Date();
                        estEnd.setDate(estEnd.getDate() + 5);
                    }

                    let deliveryText;
                    const lang = OrderTable.language; // fallback to english
                    console.log("LANG", lang);

                    if (lang === 'chn') {
                        const startMonth = estStart.getMonth() + 1;
                        const startDay = estStart.getDate();
                        const endDay = estEnd.getDate();

                        if (estStart.getMonth() !== estEnd.getMonth()) {
                            const endMonth = estEnd.getMonth() + 1;
                            deliveryText = `${startMonth} 月 ${startDay} 日至 ${endMonth} 月 ${endDay} 日`;
                        } else {
                            deliveryText = `${startMonth} 月 ${startDay} 日至 ${endDay} 日`;
                        }
                    } else {
                        // English: smart range
                        const startMonthStr = estStart.toLocaleDateString('en-US', { month: 'short' });
                        const startDay = estStart.getDate();
                        const endMonthStr = estEnd.toLocaleDateString('en-US', { month: 'short' });
                        const endDay = estEnd.getDate();

                        if (estStart.getFullYear() === estEnd.getFullYear() &&
                            estStart.getMonth() === estEnd.getMonth()) {
                            deliveryText = `${startMonthStr} ${startDay} - ${endDay}`;
                        } else {
                            deliveryText = `${startMonthStr} ${startDay} - ${endMonthStr} ${endDay}`;
                        }
                    }

                    const headers = {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        Authorization: process.env.WHATSAPP_BEARER_TOKEN
                    };

                    const whatsappNumber = `+852${OrderTable.phoneNumber}`;

                    let languageCode;
                    let templateName;

                    if (lang === 'chn') {
                        templateName = 'ptag_track_chn';
                        languageCode = 'zh_CN';
                    } else {
                        templateName = 'ptag_track_eng';
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
                                // Body parameters ({{1}}, {{2}}, {{3}}, {{4}})
                                {
                                    type: "body",
                                    parameters: [
                                        { type: "text", text: OrderTable.lastName },
                                        { type: "text", text: OrderTable.tempId },
                                        { type: "text", text: OrderTable.sfWayBillNumber },
                                        { type: "text", text: deliveryText },
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
                                            text: OrderTable.sfWayBillNumber,
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



                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            message: "Tag info updated successfully",
                            id: orderVerify._id,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    };
                }
                default:
                    return {
                        statusCode: 405,
                        body: JSON.stringify({ error: "Method Not Allowed" }),
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    };
            }
        }
    } catch (error) {
        console.error("Error fetching order Verification data:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" }),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        };
    }
};

