from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user with unique email for signup validation."""

    email = models.EmailField("email address", unique=True, blank=False)

    def __str__(self):
        return self.username
