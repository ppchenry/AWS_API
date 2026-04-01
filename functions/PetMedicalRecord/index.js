const mongoose = require("mongoose");
const PetSchema = require("./models/pet");
const MedicalRecordsSchema = require("./models/medical_records");
const MedicationRecordsSchema = require("./models/medication_records");
const DewormRecordsSchema = require("./models/deworm_records");
const BloodTestRecordsSchema = require("./models/bloodTest_records");

const fs = require("fs");
const path = require("path");

// MongoDB connection (cached to optimize Lambda cold starts)
let conn = null;

const connectToMongoDB = async () => {
  if (conn == null) {
    conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB primary connected to database: petpetclub");
    // Register the Pet schema
    mongoose.model("Pet", PetSchema);
    mongoose.model("Medical_Records", MedicalRecordsSchema);
    mongoose.model("Medication_Records", MedicationRecordsSchema);
    mongoose.model("Deworm_Records", DewormRecordsSchema);
    mongoose.model("blood_tests", BloodTestRecordsSchema);
  }
  return conn;
};

/**
 * Get the MongoDB connection for reads
 */
const getReadConnection = async () => {
  return await connectToMongoDB();
};

// Load translations from JSON files
const loadTranslations = (lang = "en") => {
  const supportedLangs = ["en", "zh"];
  const fallbackLang = "en";

  const filePath = path.join(
    __dirname,
    "locales",
    `${supportedLangs.includes(lang) ? lang : fallbackLang}.json`
  );
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
};

// Get translation for a given key
const getTranslation = (translations, key) => {
  return (
    key.split(".").reduce((obj, part) => {
      return obj && obj[part] !== undefined ? obj[part] : null;
    }, translations) || key
  );
};

// Validation helper functions
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return mongoose.isValidObjectId(id);
};

const isValidDateFormat = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return false;

  // Check ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  if (dateString.includes("T") || dateString.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/)) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  // Check DD/MM/YYYY format
  if (dateString.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [day, month, year] = dateString.split("/");
    if (day && month && year && day.length <= 2 && month.length <= 2 && year.length === 4) {
      const date = new Date(year, month - 1, day);
      return date instanceof Date && !isNaN(date.getTime());
    }
  }

  return false;
};

// Helper function to create error response
const createErrorResponse = (statusCode, error, translations, headers = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...headers
  };

  const errorMessage = translations ? getTranslation(translations, error) : error;

  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify({
      success: false,
      error: errorMessage,
    })
  };
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

    // Load translations early for error handling
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);

    const petID = event.pathParameters?.petID;
    const Pets = readConn.model("Pet");
    console.log("petID:", petID);

    if (!petID) {
      return createErrorResponse(400, "missingPetId", t);
    }

    // Validate petID format
    if (!isValidObjectId(petID)) {
      return createErrorResponse(400, "invalidPetIdFormat", t);
    }

    const isMedicalRecordPath = event.resource?.includes("/medical-record") || event.path?.includes("/medical-record");
    const isMedicationRecordPath = event.resource?.includes("/medication-record") || event.path?.includes("/medication-record");
    const isDewormRecordPath = event.resource?.includes("/deworm-record") || event.path?.includes("/deworm-record");
    const isBloodTestPath = event.resource?.includes("/blood-test-record") || event.path?.includes("/blood-test-record");

    if (isMedicalRecordPath) {
      const MedicalRecords = readConn.model("Medical_Records");
      const petMedicalRecords = await MedicalRecords.find({ petId: petID });
      console.log("petMedicalRecords: ", petMedicalRecords);

      const httpMethod = event.httpMethod;
      switch (httpMethod) {
        case "GET":
          // Construct the response form
          const form = {
            medical: petMedicalRecords ? petMedicalRecords.map((record) => ({
              medicalDate: record.medicalDate,
              medicalPlace: record.medicalPlace,
              medicalDoctor: record.medicalDoctor,
              medicalResult: record.medicalResult,
              medicalSolution: record.medicalSolution,
              petId: record.petId,
              _id: record._id,
            })) : [],
          };

          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicalRecord.getSuccess"),
              form: form,
              petId: petID,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "POST":
          // Parse JSON body with error handling
          let NewMedicalRecord;
          try {
            NewMedicalRecord = JSON.parse(event.body || '{}');
          } catch (parseError) {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          // Validate date format if provided
          if (NewMedicalRecord.medicalDate && !isValidDateFormat(NewMedicalRecord.medicalDate)) {
            return createErrorResponse(400, "medicalRecord.invalidDateFormat", t);
          }

          const newMedicalRecord = await MedicalRecords.create({
            medicalDate: NewMedicalRecord.medicalDate ? parseDDMMYYYY(NewMedicalRecord.medicalDate) : null,
            medicalPlace: NewMedicalRecord.medicalPlace,
            medicalDoctor: NewMedicalRecord.medicalDoctor,
            medicalResult: NewMedicalRecord.medicalResult,
            medicalSolution: NewMedicalRecord.medicalSolution,
            petId: petID
          });

          await Pets.findByIdAndUpdate({_id: petID}, {
            $inc: { medicalRecordsCount: 1 },
          });


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicalRecord.postSuccess"),
              form: NewMedicalRecord,
              petId: petID,
              medicalRecordId: newMedicalRecord._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "PUT":
          const medicalIDtoUpdate = event.pathParameters?.medicalID;

          if (!medicalIDtoUpdate) {
            return createErrorResponse(400, "medicalRecord.putMissingMedicalId", t);
          }

          // Validate medicalID format
          if (!isValidObjectId(medicalIDtoUpdate)) {
            return createErrorResponse(400, "medicalRecord.invalidMedicalIdFormat", t);
          }

          // Check if medical record exists
          const medicalExists = await MedicalRecords.findOne({ _id: medicalIDtoUpdate });
          console.log("MEDICAL EXISTS TO UPDATE: ", medicalExists);
          if (!medicalExists) {
            return createErrorResponse(404, "medicalRecord.medicalRecordNotFound", t);
          }

          // Parse JSON body with error handling
          let updatedMedicalRecord;
          try {
            updatedMedicalRecord = JSON.parse(event.body || '{}');
          } catch (parseError) {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          // Validate date format if provided
          if (updatedMedicalRecord.medicalDate && !isValidDateFormat(updatedMedicalRecord.medicalDate)) {
            return createErrorResponse(400, "medicalRecord.invalidDateFormat", t);
          }

          // Prepare update object for specific medical fields
          const updateFields = {};
          if (updatedMedicalRecord.medicalDate) updateFields["medicalDate"] = parseDDMMYYYY(updatedMedicalRecord.medicalDate);
          if (updatedMedicalRecord.medicalPlace) updateFields["medicalPlace"] = updatedMedicalRecord.medicalPlace;
          if (updatedMedicalRecord.medicalDoctor) updateFields["medicalDoctor"] = updatedMedicalRecord.medicalDoctor;
          if (updatedMedicalRecord.medicalResult) updateFields["medicalResult"] = updatedMedicalRecord.medicalResult;
          if (updatedMedicalRecord.medicalSolution) updateFields["medicalSolution"] = updatedMedicalRecord.medicalSolution;

          // Update the specific medical record in primary database
          const result = await MedicalRecords.updateOne(
            { _id: medicalIDtoUpdate },
            { $set: updateFields }
          );


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicalRecord.putSuccess"),
              petId: petID,
              medicalRecordId: medicalIDtoUpdate,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "DELETE":
          const medicalIDtoDelete = event.pathParameters?.medicalID;
          if (!medicalIDtoDelete) {
            return createErrorResponse(400, "medicalRecord.putMissingMedicalId", t);
          }

          // Validate medicalID format
          if (!isValidObjectId(medicalIDtoDelete)) {
            return createErrorResponse(400, "medicalRecord.invalidMedicalIdFormat", t);
          }

          // Check if medical record exists
          await MedicalRecords.deleteOne({ _id: medicalIDtoDelete });

          await Pets.findByIdAndUpdate({_id: petID}, {
            medicalRecordsCount: await MedicalRecords.countDocuments({ petId: petID }),
          });


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicalRecord.deleteSuccess"),
              id: petID,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        default:
          return createErrorResponse(405, "methodNotAllowed", t);
      }
    }

    if (isMedicationRecordPath) {
      const MedicationRecords = readConn.model("Medication_Records");
      const petMedicationRecords = await MedicationRecords.find({ petId: petID });
      const httpMethod = event.httpMethod;
      switch (httpMethod) {
        case "GET":
          // Construct the response form
          const form = {
            medication: petMedicationRecords ? petMedicationRecords.map((record) => ({
              _id: record._id,
              medicationDate: record.medicationDate,
              drugName: record.drugName,
              drugPurpose: record.drugPurpose,
              drugMethod: record.drugMethod,
              drugRemark: record.drugRemark,
              allergy: record.allergy,
              petId: record.petId
            })) : [],
          };

          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicationRecord.getSuccess"),
              form: form,
              petId: petID,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "POST":
          // Parse JSON body with error handling
          let NewMedicationRecord;
          try {
            NewMedicationRecord = JSON.parse(event.body || '{}');
          } catch (parseError) {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          // Validate date format if provided
          if (NewMedicationRecord.medicationDate && !isValidDateFormat(NewMedicationRecord.medicationDate)) {
            return createErrorResponse(400, "medicationRecord.invalidDateFormat", t);
          }

          // Construct the medical record
          const newMedicationRecord = await MedicationRecords.create({
            medicationDate: NewMedicationRecord.medicationDate ? parseDDMMYYYY(NewMedicationRecord.medicationDate) : null,
            drugName: NewMedicationRecord.drugName,
            drugPurpose: NewMedicationRecord.drugPurpose,
            drugMethod: NewMedicationRecord.drugMethod,
            drugRemark: NewMedicationRecord.drugRemark,
            allergy: NewMedicationRecord.allergy,
            petId: petID
          });

          await Pets.findByIdAndUpdate({_id: petID}, {
            $inc: { medicationRecordsCount: 1 },
          });



          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicationRecord.postSuccess"),
              form: newMedicationRecord,
              petId: petID,
              medicationRecordId: newMedicationRecord._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "PUT":
          const medicationIDtoUpdate = event.pathParameters?.medicationID;

          if (!medicationIDtoUpdate) {
            return createErrorResponse(400, "medicationRecord.putMissingMedicationId", t);
          }

          // Validate medicationID format
          if (!isValidObjectId(medicationIDtoUpdate)) {
            return createErrorResponse(400, "medicationRecord.invalidMedicationIdFormat", t);
          }

          // Check if medication record exists
          const medicationExists = await MedicationRecords.findOne({ _id: medicationIDtoUpdate });
          if (!medicationExists) {
            return createErrorResponse(404, "medicationRecord.medicationRecordNotFound", t);
          }

          // Parse JSON body with error handling
          let updatedMedicationRecord;
          try {
            updatedMedicationRecord = JSON.parse(event.body || '{}');
          } catch (parseError) {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          // Validate date format if provided
          if (updatedMedicationRecord.medicationDate && !isValidDateFormat(updatedMedicationRecord.medicationDate)) {
            return createErrorResponse(400, "medicationRecord.invalidDateFormat", t);
          }

          // Prepare update object for specific medical fields
          const updateFields2 = {};
          if (updatedMedicationRecord.medicationDate) updateFields2["medicationDate"] = parseDDMMYYYY(updatedMedicationRecord.medicationDate);
          if (updatedMedicationRecord.drugName) updateFields2["drugName"] = updatedMedicationRecord.drugName;
          if (updatedMedicationRecord.drugPurpose) updateFields2["drugPurpose"] = updatedMedicationRecord.drugPurpose;
          if (updatedMedicationRecord.drugMethod) updateFields2["drugMethod"] = updatedMedicationRecord.drugMethod;
          if (updatedMedicationRecord.drugRemark) updateFields2["drugRemark"] = updatedMedicationRecord.drugRemark;
          if (updatedMedicationRecord.allergy) updateFields2["allergy"] = true;
          else updateFields2["allergy"] = false;

          // Connect to primary database for writes


          // Update the specific medication record in primary database
          await MedicationRecords.updateOne(
            { _id: medicationIDtoUpdate },
            { $set: updateFields2 }
          );


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicationRecord.putSuccess"),
              petId: petID,
              medicationRecord: updateFields2,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "DELETE":
          const medicationIDtoDelete = event.pathParameters?.medicationID;
          if (!medicationIDtoDelete) {
            return createErrorResponse(400, "medicationRecord.putMissingMedicationId", t);
          }

          // Validate medicationID format
          if (!isValidObjectId(medicationIDtoDelete)) {
            return createErrorResponse(400, "medicationRecord.invalidMedicationIdFormat", t);
          }

          // Check if medication record exists
          const medicationToDeleteExists = await MedicationRecords.findOne({ _id: medicationIDtoDelete });
          if (!medicationToDeleteExists) {
            return createErrorResponse(404, "medicationRecord.medicationRecordNotFound", t);
          }

          // Connect to primary database for writes
          await MedicationRecords.deleteOne({ _id: medicationIDtoDelete });
          await Pets.findByIdAndUpdate({_id: petID}, {
            medicationRecordsCount: await MedicationRecords.countDocuments({ petId: petID }),
          });


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "medicationRecord.deleteSuccess"),
              id: petID,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        default:
          return createErrorResponse(405, "methodNotAllowed", t);
      }
    }
    if (isDewormRecordPath) {
      const DewormRecords = readConn.model("Deworm_Records");
      const petDewormRecords = await DewormRecords.find({ petId: petID });

      const httpMethod = event.httpMethod;
      switch (httpMethod) {
        case "GET":
          // Construct the response form
          const form = {
            deworm: petDewormRecords ? petDewormRecords.map((record) => ({
              date: record.date,
              vaccineBrand: record.vaccineBrand,
              vaccineType: record.vaccineType,
              typesOfInternalParasites: record.typesOfInternalParasites,
              typesOfExternalParasites: record.typesOfExternalParasites,
              frequency: record.frequency,
              nextDewormDate: record.nextDewormDate,
              notification: record.notification,
              _id: record._id,
            })) : [],
          };

          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "dewormRecord.getSuccess"),
              form: form,
              petId: petID,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "POST":
          // Parse JSON body with error handling
          let NewDewormRecord;
          try {
            NewDewormRecord = JSON.parse(event.body || '{}');
          } catch (parseError) {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          // Validate date formats if provided
          if (NewDewormRecord.date && !isValidDateFormat(NewDewormRecord.date)) {
            return createErrorResponse(400, "dewormRecord.invalidDateFormat", t);
          }
          if (NewDewormRecord.nextDewormDate && !isValidDateFormat(NewDewormRecord.nextDewormDate)) {
            return createErrorResponse(400, "dewormRecord.invalidDateFormat", t);
          }


          // Construct the medical record
          const newDewormRecord = await DewormRecords.create({
            date: NewDewormRecord.date ? parseDDMMYYYY(NewDewormRecord.date) : null,
            vaccineBrand: NewDewormRecord.vaccineBrand,
            vaccineType: NewDewormRecord.vaccineType,
            typesOfInternalParasites: NewDewormRecord.typesOfInternalParasites,
            typesOfExternalParasites: NewDewormRecord.typesOfExternalParasites,
            frequency: NewDewormRecord.frequency,
            nextDewormDate: NewDewormRecord.nextDewormDate ? parseDDMMYYYY(NewDewormRecord.nextDewormDate) : null,
            notification: NewDewormRecord.notification,
            petId: petID
          });

          await Pets.findByIdAndUpdate({_id: petID}, {
            $inc: { dewormRecordsCount: 1 },
            $max: { latestDewormDate: NewDewormRecord.date }
          });


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "dewormRecord.postSuccess"),
              form: NewDewormRecord,
              petId: petID,
              dewormRecordId: newDewormRecord._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "PUT":
          const dewormIDtoUpdate = event.pathParameters?.dewormID;

          if (!dewormIDtoUpdate) {
            return createErrorResponse(400, "dewormRecord.putMissingDewormId", t);
          }

          // Validate dewormID format
          if (!isValidObjectId(dewormIDtoUpdate)) {
            return createErrorResponse(400, "dewormRecord.invalidDewormIdFormat", t);
          }

          // Check if deworm record exists
          const dewormExists = await DewormRecords.findOne({ _id: dewormIDtoUpdate });
          if (!dewormExists) {
            return createErrorResponse(404, "dewormRecord.dewormRecordNotFound", t);
          }

          // Parse JSON body with error handling
          let updatedDewormRecord;
          try {
            updatedDewormRecord = JSON.parse(event.body || '{}');
          } catch (parseError) {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          // Validate date formats if provided
          if (updatedDewormRecord.date && !isValidDateFormat(updatedDewormRecord.date)) {
            return createErrorResponse(400, "dewormRecord.invalidDateFormat", t);
          }
          if (updatedDewormRecord.nextDewormDate && !isValidDateFormat(updatedDewormRecord.nextDewormDate)) {
            return createErrorResponse(400, "dewormRecord.invalidDateFormat", t);
          }

          // Prepare update object for specific medical fields
          const updateFields3 = {};
          if (updatedDewormRecord.date) updateFields3["date"] = parseDDMMYYYY(updatedDewormRecord.date);
          if (updatedDewormRecord.vaccineBrand) updateFields3["vaccineBrand"] = updatedDewormRecord.vaccineBrand;
          if (updatedDewormRecord.vaccineType) updateFields3["vaccineType"] = updatedDewormRecord.vaccineType;
          if (updatedDewormRecord.typesOfInternalParasites) updateFields3["typesOfInternalParasites"] = updatedDewormRecord.typesOfInternalParasites;
          if (updatedDewormRecord.typesOfExternalParasites) updateFields3["typesOfExternalParasites"] = updatedDewormRecord.typesOfExternalParasites;
          if (updatedDewormRecord.frequency) updateFields3["frequency"] = updatedDewormRecord.frequency;
          if (updatedDewormRecord.nextDewormDate) updateFields3["nextDewormDate"] = parseDDMMYYYY(updatedDewormRecord.nextDewormDate);
          if (updatedDewormRecord.notification) updateFields3["notification"] = updatedDewormRecord.notification;



          // Update the specific deworm record in primary database
          const result = await DewormRecords.updateOne(
            { _id: dewormIDtoUpdate },
            { $set: updateFields3 }
          );

          const latestDewormRecords = await DewormRecords
          .find({ petId: petID })
          .sort({ date: -1 })
          .limit(1);

          await Pets.findByIdAndUpdate({_id: petID}, {
            latestDewormDate: latestDewormRecords[0]?.date || null
          });


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "dewormRecord.putSuccess"),
              petId: petID,
              dewormRecordId: dewormIDtoUpdate,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        case "DELETE":
          const dewormIDtoDelete = event.pathParameters?.dewormID;
          if (!dewormIDtoDelete) {
            return createErrorResponse(400, "dewormRecord.putMissingDewormId", t);
          }

          // Validate dewormID format
          if (!isValidObjectId(dewormIDtoDelete)) {
            return createErrorResponse(400, "dewormRecord.invalidDewormIdFormat", t);
          }

          // Check if deworm record exists
          const dewormToDeleteExists = await DewormRecords.findOne({ _id: dewormIDtoDelete });
          if (!dewormToDeleteExists) {
            return createErrorResponse(404, "dewormRecord.dewormRecordNotFound", t);
          }

          // Connect to primary database for writes


          // Delete the specific deworm record from primary database
          await DewormRecords.deleteOne(
            { _id: dewormIDtoDelete }
          );

          const latest = await DewormRecords
          .find({ petId: petID })
          .sort({ date: -1 })
          .limit(1);

          await Pets.findByIdAndUpdate({_id: petID}, {
            dewormRecordsCount: await DewormRecords.countDocuments({ petId: petID }),
            latestDewormDate: latest[0]?.date || null
          });


          // Return the successful response
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "dewormRecord.deleteSuccess"),
              id: petID,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        default:
          return createErrorResponse(405, "methodNotAllowed", t);
      }
    }
    if (isBloodTestPath) {
      const BloodTest = readConn.model("blood_tests"); // consistent short name

      switch (event.httpMethod) {
        case "GET": {
          const records = await BloodTest.find({ petId: petID }).lean(); // lean() for plain objects
          console.log("petBloodTestRecords:", records);

          const form = {
            blood_test: records.map(record => ({
              bloodTestDate: record.bloodTestDate,
              heartworm: record.heartworm,
              lymeDisease: record.lymeDisease,
              ehrlichiosis: record.ehrlichiosis,
              anaplasmosis: record.anaplasmosis,
              babesiosis: record.babesiosis,
              petId: record.petId,
              _id: record._id,
            })),
          };

          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "bloodTest.getSuccess"),
              form,
              petId: petID,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        case "POST": {
          let input;
          try {
            input = JSON.parse(event.body || '{}');
          } catch {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          if (input.bloodTestDate && !isValidDateFormat(input.bloodTestDate)) {
            return createErrorResponse(400, "bloodTest.invalidDateFormat", t);
          }

          const newRecord = await BloodTest.create({
            bloodTestDate: input.bloodTestDate ? parseDDMMYYYY(input.bloodTestDate) : null,
            heartworm: input.heartworm,
            lymeDisease: input.lymeDisease,
            ehrlichiosis: input.ehrlichiosis,
            anaplasmosis: input.anaplasmosis,
            babesiosis: input.babesiosis,
            petId: petID,
          });


          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "bloodTest.postSuccess"),
              form: input,
              petId: petID,
              bloodTestRecordId: newRecord._id,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        case "PUT": {
          const bloodTestId = event.pathParameters?.bloodTestID;

          if (!bloodTestId) {
            return createErrorResponse(400, "bloodTest.putMissingBloodTestId", t);
          }
          if (!isValidObjectId(bloodTestId)) {
            return createErrorResponse(400, "bloodTest.invalidBloodTestIdFormat", t);
          }

          const exists = await BloodTest.findById(bloodTestId);
          if (!exists) {
            return createErrorResponse(404, "bloodTest.bloodTestRecordNotFound", t);
          }

          let input;
          try {
            input = JSON.parse(event.body || '{}');
          } catch {
            return createErrorResponse(400, "common.invalidJSON", t);
          }

          if (input.bloodTestDate && !isValidDateFormat(input.bloodTestDate)) {
            return createErrorResponse(400, "bloodTest.invalidDateFormat", t);
          }

          const updateFields = {};
          if (input.bloodTestDate) updateFields.bloodTestDate = parseDDMMYYYY(input.bloodTestDate);
          if (input.heartworm) updateFields.heartworm = input.heartworm;
          if (input.lymeDisease) updateFields.lymeDisease = input.lymeDisease;
          if (input.ehrlichiosis) updateFields.ehrlichiosis = input.ehrlichiosis;
          if (input.anaplasmosis) updateFields.anaplasmosis = input.anaplasmosis;
          if (input.babesiosis) updateFields.babesiosis = input.babesiosis;

          if (Object.keys(updateFields).length === 0) {
            return createErrorResponse(400, "bloodTest.noFieldsToUpdate", t);
          }

          await BloodTest.updateOne({ _id: bloodTestId }, { $set: updateFields });


          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "bloodTest.putSuccess"),
              petId: petID,
              bloodTestRecordId: bloodTestId,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        case "DELETE": {
          const bloodTestId = event.pathParameters?.bloodTestID; // consistent naming

          if (!bloodTestId) {
            return createErrorResponse(400, "bloodTest.missingId", t);
          }
          if (!isValidObjectId(bloodTestId)) {
            return createErrorResponse(400, "bloodTest.invalidIdFormat", t);
          }

          const deleted = await BloodTest.deleteOne({ _id: bloodTestId });

          if (deleted.deletedCount === 0) {
            return createErrorResponse(404, "bloodTest.recordNotFound", t);
          }


          return {
            statusCode: 200,
            body: JSON.stringify({
              message: getTranslation(t, "bloodTest.deleteSuccess"),
              petId: petID,
              bloodTestRecordId: bloodTestId,
            }),
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          };
        }

        default:
          return createErrorResponse(405, "methodNotAllowed", t);
      }
    }
  } catch (error) {
    console.error("Error somewhere:", error);
    const lang = event.cookies?.language || "zh";
    const t = loadTranslations(lang);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: "Internal Server Error"
      }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};