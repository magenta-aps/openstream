from django.contrib.auth.models import User
from django.db import models


class KeycloakSession(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    access_token = models.TextField()
    refresh_token = models.TextField()
    id_token = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
