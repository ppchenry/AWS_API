const { z } = require("zod");

// User profile schema (userId is sourced from JWT, not request body)
const userProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  gender: z.string().optional(),
  deleted: z.boolean().optional(),
});

// NGO profile schema
const ngoProfileSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  registrationNumber: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
    })
    .partial()
    .optional(),
  petPlacementOptions: z.array(z.string()).optional(),
});

// NGO counters schema
const ngoCountersSchema = z.object({
  ngoPrefix: z.string().optional(),
  seq: z.number().optional(),
});

// NGO user access profile schema
const ngoUserAccessProfileSchema = z.object({
  roleInNgo: z.string().optional(),
  menuConfig: z
    .object({
      canViewPetList: z.boolean().optional(),
      canEditPetDetails: z.boolean().optional(),
      canManageAdoptions: z.boolean().optional(),
      canAccessFosterLog: z.boolean().optional(),
      canViewReports: z.boolean().optional(),
      canManageUsers: z.boolean().optional(),
      canManageNgoSettings: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

// Main editNgo body schema
const editNgoBodySchema = z.object({
  userProfile: userProfileSchema.optional(),
  ngoProfile: ngoProfileSchema.optional(),
  ngoCounters: ngoCountersSchema.optional(),
  ngoUserAccessProfile: ngoUserAccessProfileSchema.optional(),
});

module.exports = {
  editNgoBodySchema,
};
