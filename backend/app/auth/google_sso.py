from authlib.integrations.starlette_client import OAuth
from app.config import get_settings

oauth = OAuth()

GOOGLE_CONF_URL = "https://accounts.google.com/.well-known/openid-configuration"


def configure_google_oauth():
    settings = get_settings()
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url=GOOGLE_CONF_URL,
        client_kwargs={"scope": "openid email profile"},
    )


def validate_domain(email: str) -> bool:
    settings = get_settings()
    domain = email.split("@")[-1].lower()
    return domain == settings.allowed_domain.lower()
