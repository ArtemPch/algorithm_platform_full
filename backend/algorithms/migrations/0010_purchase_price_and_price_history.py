import django.db.models.deletion
from django.db import migrations, models


def backfill_price_data(apps, schema_editor):
    Algorithm = apps.get_model('algorithms', 'Algorithm')
    AlgorithmPricePoint = apps.get_model('algorithms', 'AlgorithmPricePoint')
    AlgorithmPurchase = apps.get_model('algorithms', 'AlgorithmPurchase')

    rows = []
    for algo in Algorithm.objects.filter(is_paid=True).exclude(price__lt=101):
        if not AlgorithmPricePoint.objects.filter(algorithm_id=algo.pk).exists():
            rows.append(AlgorithmPricePoint(algorithm_id=algo.pk, price=algo.price))
    if rows:
        AlgorithmPricePoint.objects.bulk_create(rows)

    for purchase in AlgorithmPurchase.objects.all().iterator():
        algo = purchase.algorithm
        if purchase.purchase_price == 0 and algo:
            purchase.purchase_price = int(algo.price or 0)
            purchase.save(update_fields=['purchase_price'])


class Migration(migrations.Migration):

    dependencies = [
        ('algorithms', '0009_algorithmpurchase'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlgorithmPricePoint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('price', models.PositiveIntegerField(verbose_name='Цена, ₽')),
                ('recorded_at', models.DateTimeField(auto_now_add=True, verbose_name='Зафиксировано')),
                (
                    'algorithm',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='price_points',
                        to='algorithms.algorithm',
                        verbose_name='Алгоритм',
                    ),
                ),
            ],
            options={
                'verbose_name': 'Точка цены',
                'verbose_name_plural': 'История цен',
                'ordering': ['recorded_at'],
            },
        ),
        migrations.AddIndex(
            model_name='algorithmpricepoint',
            index=models.Index(fields=['algorithm', 'recorded_at'], name='algorithms__algorit_6a1b8c_idx'),
        ),
        migrations.AddField(
            model_name='algorithmpurchase',
            name='purchase_price',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Фиксируется при оплате (заглушка).',
                verbose_name='Цена на момент покупки, ₽',
            ),
        ),
        migrations.RunPython(backfill_price_data, migrations.RunPython.noop),
    ]
