from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.database import get_app_db
from app.auth.models import User, ApiKey
from app.auth.utils import decode_token, verify_password

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_app_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    token = credentials.credentials

    # Try JWT first
    payload = decode_token(token)
    if payload and payload.get("type") == "access":
        user_id = payload.get("sub")
        if user_id:
            result = await db.execute(select(User).where(User.id == UUID(user_id)))
            user = result.scalar_one_or_none()
            if user and user.is_active:
                return user

    # Try API key
    result = await db.execute(select(ApiKey).where(ApiKey.is_active == True))
    api_keys = result.scalars().all()
    for api_key in api_keys:
        if verify_password(token, api_key.key_hash):
            result = await db.execute(select(User).where(User.id == api_key.user_id))
            user = result.scalar_one_or_none()
            if user and user.is_active:
                return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )


def require_permission(resource: str, action: str = "view"):
    """Dependency factory that checks if the current user has a specific permission."""

    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.is_superadmin:
            return user

        for role in user.roles:
            for perm in role.permissions:
                if perm.resource == resource and perm.action == action:
                    return user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: {resource}:{action}",
        )

    return checker


def require_admin():
    """Dependency that requires the user to be a superadmin or have settings.* manage permission."""

    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.is_superadmin:
            return user

        for role in user.roles:
            for perm in role.permissions:
                if perm.resource.startswith("settings.") and perm.action == "manage":
                    return user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return checker
