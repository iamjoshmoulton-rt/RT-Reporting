import logging
import secrets
import hmac
import hashlib
from uuid import UUID
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Request

logger = logging.getLogger(__name__)
from fastapi.responses import RedirectResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import get_app_db
from app.auth.models import User, Role, Permission, ApiKey, user_roles
from app.auth.schemas import (
    TokenResponse, TokenRefreshRequest, LoginRequest,
    UserCreate, UserUpdate, UserResponse,
    RoleCreate, RoleUpdate, RoleResponse,
    PermissionCreate, UserPermissions, PermissionResponse,
)
from app.auth.utils import (
    hash_password, verify_password, decode_token, make_token_response,
)
from app.auth.google_sso import validate_domain
from app.auth.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Google OAuth endpoints (no session dependency)
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _sign_state(state: str, secret: str) -> str:
    """HMAC-sign a state string for CSRF protection."""
    return hmac.new(secret.encode(), state.encode(), hashlib.sha256).hexdigest()[:32]


# --- Google SSO (cookie-based state, no session middleware needed) ---

@router.get("/google/login")
async def google_login(request: Request):
    settings = get_settings()

    # Generate CSRF state + HMAC signature
    state = secrets.token_urlsafe(32)
    sig = _sign_state(state, settings.jwt_secret_key)

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }

    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    response = RedirectResponse(url=auth_url)
    response.set_cookie(
        key="oauth_state",
        value=f"{state}.{sig}",
        max_age=600,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_app_db)):
    settings = get_settings()

    # --- Verify CSRF state ---
    state_param = request.query_params.get("state", "")
    cookie_val = request.cookies.get("oauth_state", "")

    if not cookie_val or "." not in cookie_val:
        logger.error(
            f"OAuth state cookie missing. Cookies present: {list(request.cookies.keys())}"
        )
        raise HTTPException(
            status_code=400,
            detail="OAuth session expired — please try logging in again.",
        )

    cookie_state, cookie_sig = cookie_val.rsplit(".", 1)
    expected_sig = _sign_state(cookie_state, settings.jwt_secret_key)

    if state_param != cookie_state or cookie_sig != expected_sig:
        logger.error(f"OAuth state mismatch: url_state={state_param[:8]}…, cookie_state={cookie_state[:8]}…")
        raise HTTPException(status_code=400, detail="Invalid OAuth state — please try again.")

    # --- Exchange authorization code for tokens ---
    code = request.query_params.get("code")
    if not code:
        error = request.query_params.get("error", "unknown")
        raise HTTPException(status_code=400, detail=f"Google auth denied: {error}")

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        })
        if token_resp.status_code != 200:
            logger.error(f"Google token exchange failed ({token_resp.status_code}): {token_resp.text}")
            raise HTTPException(status_code=500, detail="Failed to authenticate with Google")
        google_tokens = token_resp.json()

    # --- Fetch user info ---
    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {google_tokens['access_token']}"},
        )
        if info_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to get user info from Google")
        userinfo = info_resp.json()

    email = userinfo.get("email", "")
    if not validate_domain(email):
        raise HTTPException(
            status_code=403,
            detail=f"Only @{settings.allowed_domain} emails are allowed",
        )

    # --- Find or create user ---
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        viewer_result = await db.execute(select(Role).where(Role.name == "Viewer"))
        viewer_role = viewer_result.scalar_one_or_none()

        user = User(
            email=email,
            full_name=userinfo.get("name", email.split("@")[0]),
            picture_url=userinfo.get("picture"),
            auth_provider="google",
        )
        if viewer_role:
            user.roles.append(viewer_role)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    tokens = make_token_response(str(user.id))
    frontend_url = settings.frontend_url.split(",")[0].strip()

    redirect = RedirectResponse(
        url=f"{frontend_url}/auth/callback?access_token={tokens['access_token']}&refresh_token={tokens['refresh_token']}"
    )
    redirect.delete_cookie("oauth_state")
    return redirect


# --- Password Login (fallback) ---

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_app_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return make_token_response(str(user.id))


# --- Token Refresh ---

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: TokenRefreshRequest, db: AsyncSession = Depends(get_app_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return make_token_response(str(user.id))


# --- Current User ---

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/permissions", response_model=UserPermissions)
async def get_my_permissions(user: User = Depends(get_current_user)):
    perms = []
    seen = set()
    for role in user.roles:
        for perm in role.permissions:
            key = (perm.resource, perm.action)
            if key not in seen:
                seen.add(key)
                perms.append(perm)
    return UserPermissions(permissions=perms, is_superadmin=user.is_superadmin)


# --- User Management (Admin) ---

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_app_db),
    _admin: User = Depends(require_admin()),
):
    result = await db.execute(select(User).options(selectinload(User.roles)))
    return result.scalars().all()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_app_db),
    _admin: User = Depends(require_admin()),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User already exists")

    user = User(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password) if body.password else None,
        auth_provider="local" if body.password else "google",
    )

    if body.role_ids:
        result = await db.execute(select(Role).where(Role.id.in_(body.role_ids)))
        user.roles = list(result.scalars().all())

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_app_db),
    _admin: User = Depends(require_admin()),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.role_ids is not None:
        result = await db.execute(select(Role).where(Role.id.in_(body.role_ids)))
        user.roles = list(result.scalars().all())

    await db.commit()
    await db.refresh(user)
    return user


# --- Role Management (Admin) ---

@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(
    db: AsyncSession = Depends(get_app_db),
    _admin: User = Depends(require_admin()),
):
    result = await db.execute(select(Role).options(selectinload(Role.permissions)))
    return result.scalars().all()


@router.post("/roles", response_model=RoleResponse, status_code=201)
async def create_role(
    body: RoleCreate,
    db: AsyncSession = Depends(get_app_db),
    _admin: User = Depends(require_admin()),
):
    role = Role(name=body.name, description=body.description)
    for perm in body.permissions:
        role.permissions.append(Permission(resource=perm.resource, action=perm.action))
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: UUID,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_app_db),
    _admin: User = Depends(require_admin()),
):
    result = await db.execute(
        select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description
    if body.permissions is not None:
        await db.execute(delete(Permission).where(Permission.role_id == role_id))
        role.permissions = [
            Permission(resource=p.resource, action=p.action) for p in body.permissions
        ]

    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: UUID,
    db: AsyncSession = Depends(get_app_db),
    _admin: User = Depends(require_admin()),
):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    await db.delete(role)
    await db.commit()
