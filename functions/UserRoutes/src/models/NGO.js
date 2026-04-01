const mongoose = require("mongoose");

const NGOSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
    },
    website: {
      type: String,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: {
        type: String,
        default: "Taiwan",
      },
    },
    registrationNumber: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    logo: {
      type: String,
      default: "",
    },
    socialMedia: {
      facebook: String,
      instagram: String,
      twitter: String,
      youtube: String,
    },
    establishedDate: {
      type: Date,
    },
    categories: [
      {
        type: String,
        enum: [
          "animal_rescue",
          "wildlife",
          "pet_adoption",
          "veterinary",
          "education",
          "rehabilitation",
          "shelter",
          "other",
        ],
      },
    ],
    petPlacementOptions: [
      {
        type: Object,
        name: {
          type: String
        },
        positions: [
          {
            type: String
          }
        ],
        default: []
      }
    ],
    stats: {
      totalAnimalsHelped: {
        type: Number,
        default: 0,
      },
      totalVolunteers: {
        type: Number,
        default: 0,
      },
      totalDonations: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// 索引
NGOSchema.index({ name: 1 });
NGOSchema.index({ email: 1 });
NGOSchema.index({ isActive: 1, isVerified: 1 });
NGOSchema.index({ categories: 1 });

// 虛擬欄位 - 取得NGO的使用者數量
NGOSchema.virtual("userCount", {
  ref: "NgoUserAccess",
  localField: "_id",
  foreignField: "ngoId",
  count: true,
  match: { isActive: true },
});

// 實例方法 - 檢查NGO是否可以操作
NGOSchema.methods.canOperate = function () {
  return this.isActive && this.isVerified;
};

// 實例方法 - 更新統計資料
NGOSchema.methods.updateStats = function (
  animalCount = 0,
  volunteerCount = 0,
  donationAmount = 0
) {
  if (animalCount) this.stats.totalAnimalsHelped += animalCount;
  if (volunteerCount) this.stats.totalVolunteers += volunteerCount;
  if (donationAmount) this.stats.totalDonations += donationAmount;
  return this.save();
};

// 靜態方法 - 取得活躍且已驗證的NGO
NGOSchema.statics.getActiveNGOs = function (limit = 20, skip = 0) {
  return this.find({
    isActive: true,
    isVerified: true,
  })
    .select("name description logo categories stats")
    .limit(limit)
    .skip(skip)
    .sort({ createdAt: -1 });
};

// 靜態方法 - 根據類別搜尋NGO
NGOSchema.statics.findByCategory = function (category) {
  return this.find({
    categories: category,
    isActive: true,
    isVerified: true,
  });
};

module.exports = NGOSchema;
