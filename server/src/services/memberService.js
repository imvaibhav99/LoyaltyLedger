import mongoose from 'mongoose';
import Member from '../models/Member.js';
import Wallet from '../models/Wallet.js';
import Tier from '../models/Tier.js';
import UserTier from '../models/UserTier.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';
import { generateId } from '../utils/generateId.js';
import { calculateExpiry } from '../utils/calculateExpiry.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class MemberService {

  static createMember = async ({ tenantId, actorId, ...fields }) => {
    const duplicate = await Member.findOne({ tenantId, phone: fields.phone });
    if (duplicate) throw new ApiError(409, 'A member with this phone number already exists');

    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const [member] = await Member.create(
          [{ tenantId, memberId: generateId('MBR'), ...fields }],
          { session }
        );

        const [wallet] = await Wallet.create(
          [{ tenantId, memberId: member._id }],
          { session }
        );

        const defaultTier = await Tier.findOne({ tenantId, isDefault: true }).session(session);
        if (defaultTier) {
          await UserTier.create(
            [{
              tenantId,
              memberId: member._id,
              tierId: defaultTier._id,
              ...(defaultTier.durationType && {
                tierExpiryDate: calculateExpiry(defaultTier.durationType, defaultTier.duration),
              }),
            }],
            { session }
          );
        }

        await AuditLog.create(
          [{
            tenantId,
            actorId,
            action: 'MEMBER_CREATED',
            resource: 'Member',
            resourceId: member._id,
            after: { name: member.name, phone: member.phone },
          }],
          { session }
        );

        result = { member, wallet };
      });
      return result;
    } finally {
      await session.endSession();
    }
  };

  static getMember = async ({ tenantId, memberId }) => {
    const member = await Member.findOne({ _id: memberId, tenantId });
    if (!member) throw new ApiError(404, 'Member not found');

    const [wallet, userTier] = await Promise.all([
      Wallet.findOne({ tenantId, memberId: member._id }),
      UserTier.findOne({ tenantId, memberId: member._id }).populate('tierId'),
    ]);

    return {
      member,
      balance: wallet?.balance ?? 0,
      tier: userTier?.tierId ?? null,
      tierExpiryDate: userTier?.tierExpiryDate ?? null,
    };
  };

  static listMembers = async ({ tenantId, search, status, cursor, limit = 20 }) => {
    const query = { tenantId };
    if (status) query.status = status;
    if (cursor) query._id = { $gt: cursor };
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ name: rx }, { phone: rx }];
    }

    const members = await Member.find(query).sort({ _id: 1 }).limit(Number(limit) + 1);
    const nextCursor = members.length > limit ? members.pop()._id : null;
    return { data: members, nextCursor };
  };

  static updateMember = async ({ tenantId, memberId, actorId, updates }) => {
    const member = await Member.findOneAndUpdate(
      { _id: memberId, tenantId },
      updates,
      { new: true, runValidators: true }
    );
    if (!member) throw new ApiError(404, 'Member not found');

    await AuditLog.create({
      tenantId,
      actorId,
      action: 'MEMBER_UPDATED',
      resource: 'Member',
      resourceId: member._id,
      after: updates,
    });

    return { member };
  };

}

export default MemberService;
