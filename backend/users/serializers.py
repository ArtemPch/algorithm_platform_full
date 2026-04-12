from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction

from algorithms.models import Algorithm

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'date_joined', 'is_staff']


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """Обновление профиля: осмысленный email, уникальность username/email."""
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=False, allow_blank=True, default='')
    last_name = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name']

    def validate_email(self, value):
        value = (value or '').strip()
        local, _, domain = value.partition('@')
        if not local or not domain or '.' not in domain:
            raise serializers.ValidationError('Укажите реалистичный адрес вида name@example.com.')
        user = self.instance
        if user and User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('Пользователь с таким email уже существует.')
        return value

    def validate_username(self, value):
        user = self.instance
        if user and User.objects.filter(username=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('Это имя пользователя уже занято.')
        return value

    def update(self, instance, validated_data):
        old_username = instance.username
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            new_username = instance.username
            if old_username != new_username:
                Algorithm.objects.filter(author_name=old_username).update(author_name=new_username)
        return instance


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2']

    def validate_email(self, value):
        value = (value or '').strip()
        local, _, domain = value.partition('@')
        if not local or not domain or '.' not in domain:
            raise serializers.ValidationError('Укажите реалистичный адрес вида name@example.com.')
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Пользователь с таким email уже существует.')
        return value

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password2'):
            raise serializers.ValidationError({"password": "Пароли не совпадают."})
        if User.objects.filter(username=attrs.get('username')).exists():
            raise serializers.ValidationError({"username": "Пользователь с таким именем уже существует."})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2', None)
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        return user
