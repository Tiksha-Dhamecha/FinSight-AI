from decimal import Decimal

from rest_framework import serializers

from .models import Transaction

ALLOWED_TYPES = ("Revenue", "Expense", "Transfer")

# Map bank/CSV labels (Credit/Debit, etc.) to stored types
TYPE_SYNONYMS = {
    "revenue": "Revenue",
    "income": "Revenue",
    "credit": "Revenue",
    "cr": "Revenue",
    "expense": "Expense",
    "cost": "Expense",
    "debit": "Expense",
    "dr": "Expense",
    "transfer": "Transfer",
}


def normalize_transaction_type(value: str) -> str:
    v = (value or "").strip()
    if not v:
        raise serializers.ValidationError("Transaction type is required.")
    key = v.lower()
    if key in TYPE_SYNONYMS:
        return TYPE_SYNONYMS[key]
    for allowed in ALLOWED_TYPES:
        if key == allowed.lower():
            return allowed
    raise serializers.ValidationError(
        f"Type must be one of: {', '.join(ALLOWED_TYPES)}, or Credit/Debit (or common synonyms)."
    )


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = (
            "id",
            "date",
            "transaction_type",
            "entity_name",
            "amount",
            "notes",
            "status",
            "category",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def validate_transaction_type(self, value):
        return normalize_transaction_type(value)

    def validate_amount(self, value):
        if value is None:
            raise serializers.ValidationError("Amount is required.")
        d = Decimal(str(value))
        if d == 0:
            raise serializers.ValidationError("Amount cannot be zero.")
        return d

    def validate_entity_name(self, value):
        s = (value or "").strip()
        if not s:
            raise serializers.ValidationError("Entity name is required.")
        return s

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        validated_data["user"] = user
        return super().create(validated_data)
