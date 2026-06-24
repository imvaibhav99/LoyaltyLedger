import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/authService.js';

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  res.status(200).json({ success: true, data: { user, accessToken, refreshToken } });
});

export const signup = asyncHandler(async (req, res) => {
  const { user, tenant, accessToken, refreshToken } = await authService.signup(req.body);
  res.status(201).json({ success: true, data: { user, tenant, accessToken, refreshToken } });
});

export const refresh = asyncHandler(async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.status(200).json({ success: true, data: tokens });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.userId);
  res.status(200).json({ success: true, message: 'Logged out from all devices' });
});

export const me = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
});
