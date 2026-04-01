const mongoose = require("mongoose");
const PetSchema = require("./models/pet");

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
    if (conn == null) {
        conn = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log("MongoDB primary connected to database: petpetclub");
        mongoose.model("Pet", PetSchema);
    }
    return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
    return await connectToMongoDB();
};

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

exports.handler = async (event, context) => {
    // Set callbackWaitsForEmptyEventLoop to false to reuse MongoDB connection
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        // Get connection for reads
        const readConn = await getReadConnection();

        const tagId = event.pathParameters?.tagId;


        if (!tagId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Tag ID is required" }),
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*", // Enable CORS if needed
                },
            };
        }

        // Get the Pet model from the appropriate connection
        const Pet = readConn.model("Pet");

        // Find the pet by tagId
        const pet = await Pet.findOne({ tagId: tagId });

        if (!pet) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Pet not found" }),
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            };
        }

        // Construct the response form
        const form = {
            userId: pet.userId,
            name: pet.name,
            breedimage: pet.breedimage,
            animal: pet.animal,
            birthday: pet.birthday,
            weight: pet.weight,
            sex: pet.sex,
            sterilization: pet.sterilization,
            breed: pet.breed,
            features: pet.features,
            info: pet.info,
            status: pet.status,
            owner: pet.owner,
            ngoId: pet.ngoId,
            ownerContact1: pet.ownerContact1,
            ownerContact2: pet.ownerContact2,
            contact1Show: pet.contact1Show,
            contact2Show: pet.contact2Show,
            tagId: pet.tagId,
            isRegistered: pet.isRegistered,
            receivedDate: pet.receivedDate,
            ngoPetId: pet.ngoPetId,
            createdAt: pet.createdAt,
            updatedAt: pet.updatedAt,
        };

        if (!form) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: "Pet basic info not found" }),
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
                message: "Pet basic info retrieved successfully",
                form: form,
                id: pet._id,
            }),
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        };

    } catch (error) {
        console.error("Error fetching pet basic info:", error);
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