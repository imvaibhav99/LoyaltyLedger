import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USER_ROLES, BCRYPT_ROUNDS } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null, // null for PLATFORM_ADMIN
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned in queries by default
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.MERCHANT_OWNER,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null, // set only for MERCHANT_MANAGER / MERCHANT_STAFF
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    empId: {
      type: String, // auto-generated for staff ("EMP-XXXXXXXX"), null otherwise
    },
  },
  { timestamps: true }
);

// same email can exist across tenants, but not within one tenant
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1 });

userSchema.methods.setPassword = async function (plaintext) {
  this.passwordHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
};

userSchema.methods.verifyPassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

const User = mongoose.model('User', userSchema);
export default User;
