from django.db import models
from django.db.utils import OperationalError
from django.contrib.auth import get_user_model

User = get_user_model()

class Algorithm(models.Model):
    """
    Модель алгоритма.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'На модерации'),
        (STATUS_APPROVED, 'Одобрен'),
        (STATUS_REJECTED, 'Отклонен'),
    ]

    name = models.CharField(max_length=200, verbose_name='Название')
    tegs = models.TextField(default='', verbose_name='Теги')
    description = models.TextField(verbose_name='Описание')
    code = models.TextField(default='', verbose_name='Код алгоритма')
    author_name = models.CharField(max_length=150, verbose_name='Автор')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='Статус')

    moderated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='moderated_algorithms',
        verbose_name='Модератор'
    )
    moderated_at = models.DateTimeField(null=True, blank=True, verbose_name='Дата модерации')
    rejection_reason = models.TextField(blank=True, verbose_name='Причина отклонения')

    is_paid = models.BooleanField(default=False, verbose_name='Платный')
    price = models.PositiveIntegerField(default=0, verbose_name='Цена, ₽')
    language = models.CharField(max_length=50, default='C++', verbose_name='Язык')
    compiler = models.CharField(max_length=50, default='g++', verbose_name='Компилятор')

    created_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='Дата обновления')

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Алгоритм'
        verbose_name_plural = 'Алгоритмы'
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['author_name']),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_status_display()})"

    # --- Разрешения/помощники ---
    def can_edit(self, user) -> bool:
        """
        Автор может редактировать свой алгоритм.
        """
        return user.is_authenticated and user.username == self.author_name

    def can_moderate(self, user) -> bool:
        """
        Модератор — staff или пользователь в группе "Модераторы".
        """
        if not user.is_authenticated:
            return False
        return user.is_staff or user.groups.filter(name='Модераторы').exists()

    def can_view(self, user) -> bool:
        """
        Логика видимости:
        - одобренные видны всем
        - автор видит свои
        - модераторы видят всё
        """
        if self.status == self.STATUS_APPROVED:
            return True
        if user.is_authenticated and user.username == self.author_name:
            return True
        if self.can_moderate(user):
            return True
        return False

    def can_view_code(self, user) -> bool:
        """
        Код бесплатного алгоритма виден всем, кто видит карточку.
        Платный — только автору, модератору или после покупки.
        """
        if not self.is_paid:
            return True
        if not user or not user.is_authenticated:
            return False
        if user.username == self.author_name:
            return True
        if self.can_moderate(user):
            return True
        try:
            return AlgorithmPurchase.objects.filter(user=user, algorithm=self).exists()
        except OperationalError:
            # Таблица покупок ещё не создана (не выполнен migrate) — не считаем покупку, код платного скрыт.
            return False

    def reset_moderation(self) -> None:
        """
        Сбрасываем модерацию (при повторной отправке/редактировании).
        """
        if self.status in [self.STATUS_APPROVED, self.STATUS_REJECTED]:
            self.status = self.STATUS_PENDING
            self.rejection_reason = ''
            self.moderated_by = None
            self.moderated_at = None

    # ---- Утилиты/свойства ----
    @property
    def is_pending(self) -> bool:
        return self.status == self.STATUS_PENDING

    @property
    def is_approved(self) -> bool:
        return self.status == self.STATUS_APPROVED

    @property
    def is_rejected(self) -> bool:
        return self.status == self.STATUS_REJECTED

    def get_status_display_with_icon(self) -> str:
        icons = {
            self.STATUS_PENDING: '⏳',
            self.STATUS_APPROVED: '✅',
            self.STATUS_REJECTED: '❌'
        }
        return f"{icons.get(self.status, '')} {self.get_status_display()}"

    def get_tags_list(self):
        """
        Разбивает поле tegs через запятую в список (удаляет пустые и пробелы).
        """
        if not self.tegs:
            return []
        return [t.strip() for t in self.tegs.split(',') if t.strip()]


class AlgorithmPurchase(models.Model):
    """Факт покупки платного алгоритма (заглушка оплаты — запись создаётся сразу)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='algorithm_purchases')
    algorithm = models.ForeignKey(Algorithm, on_delete=models.CASCADE, related_name='purchases')
    purchased_at = models.DateTimeField(auto_now_add=True, verbose_name='Дата покупки')
    purchase_price = models.PositiveIntegerField(
        default=0,
        verbose_name='Цена на момент покупки, ₽',
        help_text='Фиксируется при оплате (заглушка).',
    )

    class Meta:
        verbose_name = 'Покупка алгоритма'
        verbose_name_plural = 'Покупки алгоритмов'
        constraints = [
            models.UniqueConstraint(fields=['user', 'algorithm'], name='unique_user_algorithm_purchase'),
        ]
        ordering = ['-purchased_at']

    def __str__(self) -> str:
        return f'{self.user.username} → {self.algorithm.name}'


class AlgorithmPricePoint(models.Model):
    """Точка истории цены платного алгоритма (для мониторинга на карточке)."""

    algorithm = models.ForeignKey(
        Algorithm,
        on_delete=models.CASCADE,
        related_name='price_points',
        verbose_name='Алгоритм',
    )
    price = models.PositiveIntegerField(verbose_name='Цена, ₽')
    recorded_at = models.DateTimeField(auto_now_add=True, verbose_name='Зафиксировано')

    class Meta:
        ordering = ['recorded_at']
        verbose_name = 'Точка цены'
        verbose_name_plural = 'История цен'
        indexes = [
            models.Index(fields=['algorithm', 'recorded_at']),
        ]

    def __str__(self) -> str:
        return f'{self.algorithm_id}: {self.price} ₽ @ {self.recorded_at}'
