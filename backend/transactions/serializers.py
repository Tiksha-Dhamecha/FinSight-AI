from rest_framework import serializers
from .models import Transaction
from django.contrib.auth import get_user_model

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = '__all__'
        read_only_fields = ['user', 'created_at']

    def create(self, validated_data):
        user = self.context['request'].user
        if not user.is_authenticated:
            User = get_user_model()
            user, _ = User.objects.get_or_create(username='demo_user', defaults={'email': 'demo@example.com'})
        validated_data['user'] = user
        return super().create(validated_data)
