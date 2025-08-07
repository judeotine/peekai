import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { user } from "~encore/clients";

const supabaseUrl = secret("SupabaseUrl");
const supabaseAnonKey = secret("SupabaseAnonKey");
const supabaseServiceKey = secret("SupabaseServiceKey");

export interface SignUpRequest {
  email: string;
  password: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
}

export interface GoogleAuthRequest {
  redirectUrl: string;
}

export interface GoogleAuthResponse {
  url: string;
}

// Sign up with email and password
export const signUp = api<SignUpRequest, AuthResponse>(
  { expose: true, method: "POST", path: "/auth/signup" },
  async (req) => {
    try {
      const response = await fetch(`${supabaseUrl()}/auth/v1/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseAnonKey(),
        },
        body: JSON.stringify({
          email: req.email,
          password: req.password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw APIError.invalidArgument(error.error_description || "Sign up failed");
      }

      const data = await response.json();
      
      // Create user profile
      await user.createProfile({
        email: req.email,
        tier: "free",
      });

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
      };
    } catch (error) {
      throw APIError.internal("failed to sign up", error);
    }
  }
);

// Sign in with email and password
export const signIn = api<SignInRequest, AuthResponse>(
  { expose: true, method: "POST", path: "/auth/signin" },
  async (req) => {
    try {
      const response = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseAnonKey(),
        },
        body: JSON.stringify({
          email: req.email,
          password: req.password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw APIError.unauthenticated(error.error_description || "Sign in failed");
      }

      const data = await response.json();

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        },
      };
    } catch (error) {
      throw APIError.internal("failed to sign in", error);
    }
  }
);

// Get Google OAuth URL
export const getGoogleAuthUrl = api<GoogleAuthRequest, GoogleAuthResponse>(
  { expose: true, method: "POST", path: "/auth/google" },
  async (req) => {
    try {
      const response = await fetch(`${supabaseUrl()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(req.redirectUrl)}`, {
        method: "GET",
        headers: {
          "apikey": supabaseAnonKey(),
        },
      });

      if (!response.ok) {
        throw new Error("Failed to get Google auth URL");
      }

      return {
        url: response.url,
      };
    } catch (error) {
      throw APIError.internal("failed to get Google auth URL", error);
    }
  }
);

// Refresh token
export const refreshToken = api<{ refresh_token: string }, AuthResponse>(
  { expose: true, method: "POST", path: "/auth/refresh" },
  async (req) => {
    try {
      const response = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseAnonKey(),
        },
        body: JSON.stringify({
          refresh_token: req.refresh_token,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw APIError.unauthenticated(error.error_description || "Token refresh failed");
      }

      const data = await response.json();

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
        session: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        },
      };
    } catch (error) {
      throw APIError.internal("failed to refresh token", error);
    }
  }
);

// Sign out
export const signOut = api<{ access_token: string }, void>(
  { expose: true, method: "POST", path: "/auth/signout" },
  async (req) => {
    try {
      await fetch(`${supabaseUrl()}/auth/v1/logout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${req.access_token}`,
          "apikey": supabaseAnonKey(),
        },
      });
    } catch (error) {
      // Ignore errors on sign out
    }
  }
);
