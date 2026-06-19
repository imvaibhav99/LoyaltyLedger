import mongoose from 'mongoose';
import {userRoles} from "../config/constants.js"
import { type } from 'node:os';
import { timeStamp } from 'node:console';

 const userSchema= new mongoose.Schema({

    //ref enables .populate() to get the data of the tenant collection
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        
    },
    name:{
        type: String,
        required: true,
        trim: true
    },
    email:{
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    passwordHash: {
        type: String,
        required: true,
        select: false
    },
    role: {
        type: String,
        enum: Object.values(userRoles),
        default: userRoles.MERCHANT_OWNER
    },
},
    {
            timeStamp: true,
    },

);

userSchema.index({tenantId: 1, email: 1}, {unique: true})

userSchema.methods.setPassword= async function(password){
    this.passwordHash= await bcrypt.hash(password, 12)
};

userSchema.methods.verifyPassword= async function(password){
    return bctrypt.compare(password, this.passwordHash)
}

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

export const User= mongoose.model('User', userSchema)