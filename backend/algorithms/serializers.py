from rest_framework import serializers
from .models import Algorithm, AlgorithmPurchase

class AlgorithmSerializer(serializers.ModelSerializer):
    # В запросе может приходить из фронта (копия логина), источник истины при create — request.user
    author_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    tags_list = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_moderate = serializers.SerializerMethodField()
    code_visible = serializers.SerializerMethodField()

    class Meta:
        model = Algorithm
        fields = [
            'id', 'name', 'tegs', 'description', 'code', 'author_name',
            'status', 'status_display', 'moderated_by', 'moderated_at',
            'rejection_reason', 'created_at', 'updated_at', 'tags_list',
            'can_edit', 'can_moderate', 'code_visible',
            'is_paid', 'price', 'language', 'compiler',
        ]
        read_only_fields = [
            'id', 'moderated_by', 'moderated_at',
            'created_at', 'updated_at', 'status_display', 'tags_list',
            'can_edit', 'can_moderate', 'code_visible',
        ]

    def validate(self, attrs):
        is_paid = attrs.get('is_paid')
        if is_paid is None and self.instance is not None:
            is_paid = self.instance.is_paid
        is_paid = bool(is_paid)

        price = attrs.get('price')
        if price is None and self.instance is not None:
            price = self.instance.price
        price = int(price or 0)

        if is_paid:
            if price < 101:
                raise serializers.ValidationError({
                    'price': 'Минимальная цена — 101 ₽ (комиссия сервиса 100 ₽).',
                })
        else:
            attrs['price'] = 0
            attrs['is_paid'] = False

        return attrs

    def get_tags_list(self, obj):
        return obj.get_tags_list()

    def get_can_edit(self, obj):
        request = self.context.get('request')
        if request:
            return obj.can_edit(request.user)
        return False

    def get_can_moderate(self, obj):
        request = self.context.get('request')
        if request:
            return obj.can_moderate(request.user)
        return False

    def get_code_visible(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        return obj.can_view_code(user)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not instance.can_view_code(user):
            data['code'] = ''
        return data

    def create(self, validated_data):
        """
        Автор всегда из JWT (request.user), не из тела запроса — защита от подмены.
        Тело может дублировать username для совместимости/логов.
        """
        request = self.context.get('request')
        validated_data.pop('author_name', None)
        if request and request.user and request.user.is_authenticated:
            validated_data['author_name'] = request.user.username
        else:
            validated_data['author_name'] = 'anonymous'
        validated_data.setdefault('status', Algorithm.STATUS_PENDING)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        """
        При обновлении — если алгоритм был одобрен/отклонён — сбрасываем модерацию.
        Автора через API менять нельзя.
        """
        validated_data.pop('author_name', None)
        if instance.status in [Algorithm.STATUS_APPROVED, Algorithm.STATUS_REJECTED]:
            instance.reset_moderation()
        return super().update(instance, validated_data)


class AlgorithmPurchaseSerializer(serializers.ModelSerializer):
    algorithm = AlgorithmSerializer(read_only=True)

    class Meta:
        model = AlgorithmPurchase
        fields = ['id', 'purchased_at', 'purchase_price', 'algorithm']
        read_only_fields = ['id', 'purchased_at', 'purchase_price', 'algorithm']
