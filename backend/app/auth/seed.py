import logging

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.models import Role, Permission, User
from app.auth.permissions import DEFAULT_ROLES
from app.auth.utils import hash_password
from app.config import get_settings

logger = logging.getLogger(__name__)


async def seed_roles(db: AsyncSession):
    """Create or sync default roles and permissions."""
    for role_name, config in DEFAULT_ROLES.items():
        result = await db.execute(select(Role).where(Role.name == role_name))
        existing = result.scalar_one_or_none()

        if existing:
            if not existing.is_system:
                continue  # Don't touch custom roles

            # Sync permissions for system roles
            expected = {(r, a) for r, a in config["permissions"]}
            current = {(p.resource, p.action) for p in existing.permissions}

            to_add = expected - current
            to_remove = current - expected

            if to_remove:
                for resource, action in to_remove:
                    await db.execute(
                        delete(Permission).where(
                            Permission.role_id == existing.id,
                            Permission.resource == resource,
                            Permission.action == action,
                        )
                    )
                logger.info(f"Role '{role_name}': removed {len(to_remove)} stale permissions")

            if to_add:
                for resource, action in to_add:
                    db.add(Permission(role_id=existing.id, resource=resource, action=action))
                logger.info(f"Role '{role_name}': added {len(to_add)} new permissions")

            continue

        # Create new role
        role = Role(
            name=role_name,
            description=config["description"],
            is_system=True,
        )
        for resource, action in config["permissions"]:
            role.permissions.append(Permission(resource=resource, action=action))
        db.add(role)
        logger.info(f"Role '{role_name}': created with {len(config['permissions'])} permissions")

    await db.commit()


async def seed_superadmin(db: AsyncSession):
    """Ensure all configured superadmin emails exist and are flagged as superadmin."""
    settings = get_settings()
    emails = [e.strip() for e in settings.superadmin_emails.split(",") if e.strip()]

    admin_role_result = await db.execute(select(Role).where(Role.name == "Admin"))
    admin_role = admin_role_result.scalar_one_or_none()

    for email in emails:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            if not user.is_superadmin:
                user.is_superadmin = True
                logger.info(f"Promoted existing user to superadmin: {email}")
        else:
            user = User(
                email=email,
                full_name=email.split("@")[0].replace(".", " ").title(),
                is_superadmin=True,
                auth_provider="password",
                hashed_password=hash_password("admin123"),
            )
            if admin_role:
                user.roles.append(admin_role)
            db.add(user)
            logger.info(f"Superadmin created: {email}")

    await db.commit()
