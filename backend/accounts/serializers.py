import re

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import User


def _validate_email_format(value: str) -> str:
    value = value.strip()
    if not value:
        raise serializers.ValidationError("Email is required.")
    # Simple, practical format check (Django's EmailField also validates on save)
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(pattern, value):
        raise serializers.ValidationError("Enter a valid email address.")
    return value.lower()


class UserPublicSerializer(serializers.ModelSerializer):
    """Safe user payload for JSON responses (no password)."""

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "date_joined")
        read_only_fields = fields


class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("username", "email", "password", "password_confirm")

    def validate_email(self, value):
        value = _validate_email_format(value)
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_username(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Username is required.")
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    """Login with email + password (security key). Resolves user by email, then Django auth."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        raw_email = (attrs.get("email") or "").strip()
        password = attrs.get("password")

        if not raw_email:
            raise serializers.ValidationError({"email": "Email is required."})
        if not password:
            raise serializers.ValidationError({"password": "Security key is required."})

        email = _validate_email_format(raw_email)

        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            raise serializers.ValidationError(
                "Invalid email or security key.",
                code="invalid_credentials",
            )

        authenticated = authenticate(
            request=self.context.get("request"),
            username=user.username,
            password=password,
        )
        if authenticated is None:
            raise serializers.ValidationError(
                "Invalid email or security key.",
                code="invalid_credentials",
            )
        if not authenticated.is_active:
            raise serializers.ValidationError("This account is disabled.", code="inactive")

        attrs["user"] = authenticated
        return attrs
