from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Algorithm, AlgorithmPricePoint


@receiver(post_save, sender=Algorithm)
def snapshot_paid_algorithm_price(sender, instance, **kwargs):
    """Добавляет точку на график цены при создании/изменении цены платного алгоритма."""
    if not instance.is_paid or instance.price < 101:
        return
    latest = (
        AlgorithmPricePoint.objects.filter(algorithm=instance)
        .order_by('-recorded_at')
        .first()
    )
    if latest is None or latest.price != instance.price:
        AlgorithmPricePoint.objects.create(algorithm=instance, price=instance.price)
