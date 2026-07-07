import { asyncHandler } from '../utils/asyncHandler.js';
import AuthService from '../services/authService.js';
class AuthController {

 static login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await AuthService.login(req.body);
  res.status(200).json({ success: true, data: { user, accessToken, refreshToken } });
});

 static signup = asyncHandler(async (req, res) => {
  const { user, tenant, accessToken, refreshToken } = await AuthService.signup(req.body);
  res.status(201).json({ success: true, data: { user, tenant, accessToken, refreshToken } });
});

 static refresh = asyncHandler(async (req, res) => {
  const tokens = await AuthService.refresh(req.body.refreshToken);
  res.status(200).json({ success: true, data: tokens });
});

 static logout = asyncHandler(async (req, res) => {
  await AuthService.logout(req.body.refreshToken);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

 static logoutAll = asyncHandler(async (req, res) => {
  await AuthService.logoutAll(req.user.userId);
  res.status(200).json({ success: true, message: 'Logged out from all devices' });
});

 static me = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
});

}

export default AuthController;
