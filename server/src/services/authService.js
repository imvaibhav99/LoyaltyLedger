import mongoose from 'mongoose';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import RefreshToken from '../models/RefreshToken.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../utils/token.js';
import { ApiError } from '../utils/ApiError.js';
import { USER_ROLES } from '../config/constants.js';
import EmailService from './emailService.js';

const refreshExpiresAt = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const issueTokens = async (user, session = null) => {
  const accessPayload  = { userId: user._id, tenantId: user.tenantId, role: user.role };
  const refreshPayload = { userId: user._id };

  const accessToken  = signAccessToken(accessPayload);
  const refreshToken = signRefreshToken(refreshPayload);
  const tokenHash    = hashToken(refreshToken);

  const record = { userId: user._id, tokenHash, expiresAt: refreshExpiresAt() };

  if (session) {
    await RefreshToken.create([record], { session });
  } else {
    await RefreshToken.create(record);
  }

  return { accessToken, refreshToken };
};

class AuthService {

  static login = async ({ email, password }) => {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) throw new ApiError(401, 'Invalid credentials');

    const valid = await user.verifyPassword(password);
    if (!valid) throw new ApiError(401, 'Invalid credentials');

    if (user.status !== 'active') throw new ApiError(403, 'Account is deactivated');

    const tokens = await issueTokens(user);
    return { user, ...tokens };
  };

  static signup = async ({ businessName, ownerName, email, password, plan }) => {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw new ApiError(409, 'An account with this email already exists');

    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const slug = businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const existingTenant = await Tenant.findOne({ slug }).session(session);
        if (existingTenant) throw new ApiError(409, 'Business name already taken');

        const [tenant] = await Tenant.create(
          [{ businessName, slug, plan: plan || 'starter', billingEmail: email.toLowerCase() }],
          { session }
        );

        const user = new User({
          tenantId: tenant._id,
          name: ownerName,
          email: email.toLowerCase(),
          role: USER_ROLES.MERCHANT_OWNER,
        });
        await user.setPassword(password);
        await user.save({ session });

        const tokens = await issueTokens(user, session);
        result = { user, tenant, ...tokens };
      });

      // fire-and-forget after commit — mail failure must never fail a signup
      EmailService.sendWelcome({
        email: result.user.email,
        name: result.user.name,
        businessName: result.tenant.businessName,
      }).catch(() => {});

      return result;
    } finally {
      await session.endSession();
    }
  };

  static refresh = async (rawRefreshToken) => {
    if (!rawRefreshToken) throw new ApiError(401, 'Refresh token required');

    let payload;
    try {
      payload = verifyRefreshToken(rawRefreshToken);
    } catch {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    const tokenHash = hashToken(rawRefreshToken);
    const stored    = await RefreshToken.findOne({ tokenHash });

    if (!stored) {
      throw new ApiError(401, 'Refresh token not recognised — please log in again');
    }

    const user = await User.findById(payload.userId);
    if (!user) throw new ApiError(401, 'User no longer exists');

    await RefreshToken.deleteOne({ _id: stored._id });

    return issueTokens(user);
  };

  static logout = async (rawRefreshToken) => {
    if (!rawRefreshToken) return;
    const tokenHash = hashToken(rawRefreshToken);
    await RefreshToken.deleteOne({ tokenHash });
  };

  static logoutAll = async (userId) => {
    await RefreshToken.deleteMany({ userId });
  };

}

export default AuthService;
