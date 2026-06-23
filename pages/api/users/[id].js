import { extractUserFromRequest, handleError } from '../../../lib/utils/api-helpers.js';
import { ApiResponse } from '../../../lib/utils/response.js';
import { withMethodHandlers, corsHandler } from '../../../lib/withLogging.js';
import { UserService } from '../../../lib/services/index.js';
import { enforceResourceOwnership } from '../../../lib/middleware/authorization.js';
import { validate } from '../../../lib/validators/index.js';

async function handleGet(req, res) {
  await corsHandler(req, res, () => {});

  try {
    extractUserFromRequest(req);
    const { id: userId } = req.query;
    const userIdInt = parseInt(userId);

    if (isNaN(userIdInt) || userIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid user ID');
    }

    // 🔐 AUTHORIZATION CHECK: User can only access their own profile
    const requestingUserId = req.user?.id;
    enforceResourceOwnership(requestingUserId, userIdInt);

    const profile = await UserService.getProfile(userIdInt);

    // 404 Check: User doesn't exist
    if (!profile) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    return res.status(200).json(ApiResponse.success(profile));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handlePut(req, res) {
  await corsHandler(req, res, () => {});

  try {
    extractUserFromRequest(req);
    const { id: userId } = req.query;
    const userIdInt = parseInt(userId);

    if (isNaN(userIdInt) || userIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid user ID');
    }

    // 🔐 AUTHORIZATION CHECK: User can only modify their own profile
    const requestingUserId = req.user?.id;
    enforceResourceOwnership(requestingUserId, userIdInt);

    // Verify user exists
    const existingUser = await UserService.getProfile(userIdInt);
    if (!existingUser) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Validate request payload
    const updateData = validate.profileUpdate(req.body);

    // Update profile
    const updatedProfile = await UserService.updateProfile(userIdInt, updateData);

    return res.status(200).json(ApiResponse.success(updatedProfile, 'Profile updated successfully'));
  } catch (error) {
    return handleError(error, res);
  }
}

async function handleDelete(req, res) {
  await corsHandler(req, res, () => {});

  try {
    extractUserFromRequest(req);
    const { id: userId } = req.query;
    const userIdInt = parseInt(userId);

    if (isNaN(userIdInt) || userIdInt <= 0) {
      throw new Error('VALIDATION_ERROR: Invalid user ID');
    }

    // 🔐 AUTHORIZATION CHECK: User can only delete their own account
    const requestingUserId = req.user?.id;
    enforceResourceOwnership(requestingUserId, userIdInt);

    // Verify user exists
    const existingUser = await UserService.getProfile(userIdInt);
    if (!existingUser) {
      return res.status(404).json(ApiResponse.error('User not found', 404));
    }

    // Validate deletion request
    const validData = validate.userDeletion(req.body);

    // Delete account (SOFT DELETE - marks deletedAt, doesn't cascade)
    await UserService.deleteAccount(userIdInt);

    return res.status(200).json(ApiResponse.success(null, 'Account deleted successfully'));
  } catch (error) {
    return handleError(error, res);
  }
}

export default withMethodHandlers({
  GET: handleGet,
  PUT: handlePut,
  DELETE: handleDelete,
});

