import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { userDB } from "./db";

export type UserTier = "free" | "student_pro" | "premium";

export interface UserProfile {
  id: string;
  email: string;
  tier: UserTier;
  dailyUsage: number;
  monthlyUsage: number;
  lastResetDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileRequest {
  email: string;
  tier?: UserTier;
}

export interface UpdateProfileRequest {
  tier?: UserTier;
}

export interface UsageStats {
  dailyUsage: number;
  monthlyUsage: number;
  dailyLimit: number;
  monthlyLimit: number;
  tier: UserTier;
}

// Creates a new user profile
export const createProfile = api<CreateProfileRequest, UserProfile>(
  { expose: true, method: "POST", path: "/profile" },
  async (req) => {
    const auth = getAuthData();
    if (!auth) {
      throw APIError.unauthenticated("authentication required");
    }

    const existingProfile = await userDB.queryRow`
      SELECT * FROM profiles WHERE id = ${auth.userID}
    `;

    if (existingProfile) {
      throw APIError.alreadyExists("profile already exists");
    }

    await userDB.exec`
      INSERT INTO profiles (id, email, tier)
      VALUES (${auth.userID}, ${req.email}, ${req.tier || 'free'})
    `;

    const profile = await userDB.queryRow<UserProfile>`
      SELECT 
        id,
        email,
        tier,
        daily_usage as "dailyUsage",
        monthly_usage as "monthlyUsage",
        last_reset_date as "lastResetDate",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM profiles 
      WHERE id = ${auth.userID}
    `;

    if (!profile) {
      throw APIError.internal("failed to create profile");
    }

    return profile;
  }
);

// Gets the current user's profile
export const getProfile = api<void, UserProfile>(
  { expose: true, method: "GET", path: "/profile", auth: true },
  async () => {
    const auth = getAuthData()!;

    const profile = await userDB.queryRow<UserProfile>`
      SELECT 
        id,
        email,
        tier,
        daily_usage as "dailyUsage",
        monthly_usage as "monthlyUsage",
        last_reset_date as "lastResetDate",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM profiles 
      WHERE id = ${auth.userID}
    `;

    if (!profile) {
      throw APIError.notFound("profile not found");
    }

    return profile;
  }
);

// Updates the current user's profile
export const updateProfile = api<UpdateProfileRequest, UserProfile>(
  { expose: true, method: "PUT", path: "/profile", auth: true },
  async (req) => {
    const auth = getAuthData()!;

    await userDB.exec`
      UPDATE profiles 
      SET 
        tier = COALESCE(${req.tier}, tier),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${auth.userID}
    `;

    const profile = await userDB.queryRow<UserProfile>`
      SELECT 
        id,
        email,
        tier,
        daily_usage as "dailyUsage",
        monthly_usage as "monthlyUsage",
        last_reset_date as "lastResetDate",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM profiles 
      WHERE id = ${auth.userID}
    `;

    if (!profile) {
      throw APIError.notFound("profile not found");
    }

    return profile;
  }
);

// Gets usage statistics for the current user
export const getUsageStats = api<void, UsageStats>(
  { expose: true, method: "GET", path: "/profile/usage", auth: true },
  async () => {
    const auth = getAuthData()!;

    const profile = await userDB.queryRow<{
      tier: UserTier;
      dailyUsage: number;
      monthlyUsage: number;
      lastResetDate: string;
    }>`
      SELECT 
        tier,
        daily_usage as "dailyUsage",
        monthly_usage as "monthlyUsage",
        last_reset_date as "lastResetDate"
      FROM profiles 
      WHERE id = ${auth.userID}
    `;

    if (!profile) {
      throw APIError.notFound("profile not found");
    }

    // Reset daily usage if it's a new day
    const today = new Date().toISOString().split('T')[0];
    if (profile.lastResetDate !== today) {
      await userDB.exec`
        UPDATE profiles 
        SET 
          daily_usage = 0,
          last_reset_date = ${today}
        WHERE id = ${auth.userID}
      `;
      profile.dailyUsage = 0;
    }

    const limits = getTierLimits(profile.tier);

    return {
      dailyUsage: profile.dailyUsage,
      monthlyUsage: profile.monthlyUsage,
      dailyLimit: limits.daily,
      monthlyLimit: limits.monthly,
      tier: profile.tier,
    };
  }
);

function getTierLimits(tier: UserTier): { daily: number; monthly: number } {
  switch (tier) {
    case "free":
      return { daily: 10, monthly: 300 };
    case "student_pro":
      return { daily: 200, monthly: 6000 };
    case "premium":
      return { daily: 1000, monthly: 30000 };
    default:
      return { daily: 10, monthly: 300 };
  }
}
