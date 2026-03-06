from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str | None = None
    role_ids: list[UUID] = []


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    role_ids: list[UUID] | None = None


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    picture_url: str | None
    is_active: bool
    is_superadmin: bool
    auth_provider: str
    created_at: datetime
    roles: list["RoleResponse"]

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: list["PermissionCreate"] = []


class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list["PermissionCreate"] | None = None


class RoleResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    is_system: bool
    permissions: list["PermissionResponse"] = []

    model_config = {"from_attributes": True}


class PermissionCreate(BaseModel):
    resource: str
    action: str


class PermissionResponse(BaseModel):
    id: UUID
    resource: str
    action: str

    model_config = {"from_attributes": True}


class UserPermissions(BaseModel):
    """Flat list of all permissions for the current user, sent at login."""
    permissions: list[PermissionResponse]
    is_superadmin: bool
