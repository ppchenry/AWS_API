const mongoose = require("mongoose");

const NgoUserAccessSchema = new mongoose.Schema(
  {
    ngoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    roleInNgo: {
      type: String,
      required: true,
      enum: ["admin", "staff", "helper", "foster"],
      index: true,
    },
    assignedPetIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pet",
      },
    ],
    menuConfig: {
      type: Object,
      default: {},
      // Example structure:
      // {
      //   canViewPetList: true,
      //   canEditPetDetails: false,
      //   canAccessFosterLog: true,
      //   canManageAdoptions: false,
      //   canViewReports: true
      // }
    },
    fosterDetails: {
      startDate: {
        type: Date,
        required: function () {
          return this.roleInNgo === "foster";
        },
      },
      endDate: {
        type: Date,
        default: null,
      },
      status: {
        type: String,
        enum: ["active", "pending_approval", "completed", "cancelled"],
        required: function () {
          return this.roleInNgo === "foster";
        },
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for better performance
NgoUserAccessSchema.index({ userId: 1, ngoId: 1 });
NgoUserAccessSchema.index({ userId: 1, isActive: 1 });
NgoUserAccessSchema.index({ ngoId: 1, roleInNgo: 1, isActive: 1 });
NgoUserAccessSchema.index({ assignedPetIds: 1 });
NgoUserAccessSchema.index({ "fosterDetails.status": 1, userId: 1 });

// Virtual for populating user details
NgoUserAccessSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for populating NGO details
NgoUserAccessSchema.virtual("ngo", {
  ref: "NGO",
  localField: "ngoId",
  foreignField: "_id",
  justOne: true,
});

// Virtual for populating assigned pets
NgoUserAccessSchema.virtual("assignedPets", {
  ref: "Pet",
  localField: "assignedPetIds",
  foreignField: "_id",
});

// Instance methods
NgoUserAccessSchema.methods.hasPermission = function (permission) {
  return this.menuConfig && this.menuConfig[permission] === true;
};

NgoUserAccessSchema.methods.canAccessPet = function (petId) {
  // Admin can access all pets in their NGO
  if (this.roleInNgo === "admin") {
    return true;
  }

  // Other roles can only access assigned pets
  return this.assignedPetIds.some((id) => id.toString() === petId.toString());
};

NgoUserAccessSchema.methods.isFosterActive = function () {
  if (this.roleInNgo !== "foster") return false;

  return (
    this.fosterDetails &&
    this.fosterDetails.status === "active" &&
    this.isActive
  );
};

// Static methods
NgoUserAccessSchema.statics.findUserContexts = function (
  userId,
  isActiveOnly = true
) {
  const query = { userId };
  if (isActiveOnly) {
    query.isActive = true;
  }

  return this.find(query)
    .populate("ngo", "name description")
    .populate("assignedPets", "name animal breed");
};

NgoUserAccessSchema.statics.findNgoUsers = function (
  ngoId,
  role = null,
  isActiveOnly = true
) {
  const query = { ngoId };
  if (role) query.roleInNgo = role;
  if (isActiveOnly) query.isActive = true;

  return this.find(query)
    .populate("user", "lastName email")
    .sort({ roleInNgo: 1, createdAt: -1 });
};

NgoUserAccessSchema.statics.findByUserAndNgo = function (userId, ngoId) {
  return this.findOne({
    userId,
    ngoId,
    isActive: true,
  })
    .populate("ngo", "name")
    .populate("assignedPets", "name animal");
};

// Pre-save middleware
NgoUserAccessSchema.pre("save", function (next) {
  // Set default menuConfig based on role
  if (!this.menuConfig || Object.keys(this.menuConfig).length === 0) {
    this.menuConfig = this.getDefaultMenuConfig();
  }

  // Validate foster details
  if (this.roleInNgo === "foster") {
    if (!this.fosterDetails || !this.fosterDetails.startDate) {
      return next(
        new Error("Foster role requires fosterDetails with startDate")
      );
    }
  }

  next();
});

// Helper method for default menu configurations
NgoUserAccessSchema.methods.getDefaultMenuConfig = function () {
  const configs = {
    admin: {
      canViewPetList: true,
      canEditPetDetails: true,
      canManageAdoptions: true,
      canAccessFosterLog: true,
      canViewReports: true,
      canManageUsers: true,
      canManageNgoSettings: true,
    },
    staff: {
      canViewPetList: true,
      canEditPetDetails: true,
      canManageAdoptions: true,
      canAccessFosterLog: true,
      canViewReports: false,
      canManageUsers: false,
      canManageNgoSettings: false,
    },
    helper: {
      canViewPetList: true,
      canEditPetDetails: false,
      canManageAdoptions: false,
      canAccessFosterLog: true,
      canViewReports: false,
      canManageUsers: false,
      canManageNgoSettings: false,
    },
    foster: {
      canViewPetList: false,
      canEditPetDetails: false,
      canManageAdoptions: false,
      canAccessFosterLog: true,
      canViewReports: false,
      canManageUsers: false,
      canManageNgoSettings: false,
    },
  };

  return configs[this.roleInNgo] || {};
};

module.exports = NgoUserAccessSchema;
