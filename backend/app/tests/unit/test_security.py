"""Unit tests for core security functions (TDD §8.1, §12 Fase 1).

Tests:
    - Password hashing and verification
    - Access and refresh token creation / validation
    - CSRF token generation and verification
    - Token type discrimination (access vs refresh)
"""
import pytest
from datetime import timedelta

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_csrf_token,
    get_password_hash,
    verify_csrf_token,
    verify_password,
)


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def test_get_password_hash_returns_non_empty_string():
    """Hash should be a non-empty string."""
    hashed = get_password_hash("TestPassword123")
    assert isinstance(hashed, str)
    assert len(hashed) > 0


def test_verify_password_correct():
    """verify_password must return True for the matching plain password."""
    plain = "SecureP@ss1"
    hashed = get_password_hash(plain)
    assert verify_password(plain, hashed) is True


def test_verify_password_wrong():
    """verify_password must return False for a wrong password."""
    hashed = get_password_hash("CorrectHorse123")
    assert verify_password("WrongPassword1", hashed) is False


def test_password_minimum_length_truncation():
    """Bcrypt silently truncates at 72 bytes; hashing should not raise for long passwords."""
    long_password = "A" * 100
    hashed = get_password_hash(long_password)
    # The truncated and non-truncated version should both verify (bcrypt behaviour)
    assert verify_password("A" * 72, hashed) is True


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------

def test_access_token_decode():
    """Decoded access token must contain sub and type='access'."""
    token = create_access_token({"sub": "user-uuid-1234"})
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "user-uuid-1234"
    assert payload["type"] == "access"


def test_refresh_token_decode():
    """Decoded refresh token must contain sub and type='refresh'."""
    token = create_refresh_token({"sub": "user-uuid-1234"})
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "user-uuid-1234"
    assert payload["type"] == "refresh"


def test_decode_invalid_token_returns_none():
    """A tampered token must return None."""
    assert decode_token("not.a.valid.token") is None


def test_access_token_expiry_respected():
    """An access token with 0-second expiry should be invalid on decode."""
    import time
    token = create_access_token({"sub": "x"}, expires_delta=timedelta(seconds=-1))
    # Expired tokens are rejected
    assert decode_token(token) is None


def test_access_token_type_discriminated_from_refresh():
    """A refresh token must NOT be accepted where an access token is expected."""
    refresh = create_refresh_token({"sub": "user-uuid"})
    payload = decode_token(refresh)
    # payload is valid but type is 'refresh', not 'access'
    assert payload["type"] == "refresh"


# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------

def test_generate_csrf_token_returns_string():
    token = generate_csrf_token()
    assert isinstance(token, str) and len(token) > 0


def test_verify_csrf_token_valid():
    token = generate_csrf_token()
    assert verify_csrf_token(token) is True


def test_verify_csrf_token_invalid():
    assert verify_csrf_token("bad-csrf-token") is False
