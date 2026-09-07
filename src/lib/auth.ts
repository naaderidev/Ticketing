import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

const COOKIE_NAME = "auth-token";
const TOKEN_EXPIRY = "7d";
const REFRESH_THRESHOLD = 2 * 24 * 60 * 60; // 2 days before expiry

export interface AuthUser {
  id: number;
  mobile: string;
  role: "USER" | "ADMIN";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ id: user.id, mobile: user.mobile, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(
  token: string
): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.id as number,
      mobile: payload.mobile as string,
      role: payload.role as "USER" | "ADMIN",
    };
  } catch {
    return null;
  }
}

export async function refreshTokenIfNeeded(
  token: string
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    const now = Math.floor(Date.now() / 1000);
    const exp = payload.exp as number;
    
    if (exp - now < REFRESH_THRESHOLD) {
      const user: AuthUser = {
        id: payload.id as number,
        mobile: payload.mobile as string,
        role: payload.role as "USER" | "ADMIN",
      };
      return signToken(user);
    }
    
    return null;
  } catch {
    return null;
  }
}

export async function setAuthCookie(user: AuthUser): Promise<void> {
  const token = await signToken(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
}

export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const headerStore = await headers();
  const userId = headerStore.get("x-user-id");
  const userRole = headerStore.get("x-user-role");

  if (userId && userRole) {
    return {
      id: parseInt(userId),
      mobile: "",
      role: userRole as "USER" | "ADMIN",
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
