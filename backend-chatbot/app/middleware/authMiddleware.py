from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from ..core.config import get_settings
from ..core.logger import setup_logger

logger = setup_logger(__name__)
security = HTTPBearer()
settings = get_settings()

async def verify_token(credentials: HTTPAuthorizationCredentials) -> dict:
    """Verify JWT token and return payload."""
    try:
        token = credentials.credentials
        
        # Debug logging
        logger.debug(f"Token header: {jwt.get_unverified_header(token)}")
        logger.debug(f"Using SUPABASE_URL: {settings.SUPABASE_URL}")
        
        # Decode without verification first for debugging
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        logger.debug(f"Unverified payload: {unverified_payload}")
        
        # Now try to verify
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )
        
        # Verify issuer
        if not payload["iss"].startswith(settings.SUPABASE_URL):
            logger.warning(f"Invalid issuer. Expected: {settings.SUPABASE_URL}, Got: {payload['iss']}")
            raise jwt.InvalidTokenError("Invalid issuer")
            
        # Verify role
        if payload.get("role") != "authenticated":
            logger.warning(f"Invalid role. Expected: authenticated, Got: {payload.get('role')}")
            raise jwt.InvalidTokenError("Invalid role")
            
        return payload
        
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise HTTPException(
            status_code=401,
            detail="Token has expired"
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        raise HTTPException(
            status_code=401,
            detail="Authentication failed"
        )

async def auth_middleware(request: Request):
    """Middleware to verify authentication token.

    NOTE: Auth verification is intentionally bypassed for local/learning use.
    The token (if any) is decoded WITHOUT signature verification so the user
    id/email is still available downstream, but no signature/issuer/expiry
    checks are enforced. Do NOT use this in production.
    """
    dummy_user = {
        "sub": "local-dev-user",
        "email": "local@dev",
        "role": "authenticated",
    }
    auth = request.headers.get("Authorization")
    if not auth:
        request.state.user = dummy_user
        return dummy_user

    try:
        scheme, token = auth.split()
        payload = jwt.decode(token, options={"verify_signature": False})
        request.state.user = payload
        return payload
    except Exception as e:
        logger.warning(f"Auth bypass: could not decode token ({e}); using dummy user")
        request.state.user = dummy_user
        return dummy_user