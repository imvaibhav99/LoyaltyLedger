import mongoose from 'mongoose';

const passwordResetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

passwordResetSchema.index({ email: 1 });

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
export default PasswordReset;
