from django.contrib import admin

from .models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("date", "transaction_type", "entity_name", "amount", "status", "user")
    list_filter = ("transaction_type", "status")
    search_fields = ("entity_name", "notes")
    ordering = ("-date", "-created_at")
