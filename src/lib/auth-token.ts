import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/security-config";

const TOKEN_EXPIRY = "7d";
const TOKEN_ISSUER = "ticketing-system";
const TOKEN_AUDIENCE = "ticketing-web";

export interface SessionTokenPayload {
  userId: number;
  sessionId: string;
}

function parseSessionToken(payload: JWTPayload): SessionTokenPayload | null {
  const userId = Number(payload.sub);
  const sessionId = payload.sid;

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    typeof sessionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId
    )
  ) {
    return null;
  }

  return { userId, sessionId };
}

export async function signToken(session: SessionTokenPayload): Promise<string> {
  return new SignJWT({ sid: session.sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(session.userId))
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyToken(
  token: string
): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
    return parseSessionToken(payload);
  } catch {
    return null;
  }
}
