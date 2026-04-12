# Generated manually for AlgorithmPurchase model

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('algorithms', '0008_algorithm_compiler_algorithm_is_paid_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlgorithmPurchase',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('purchased_at', models.DateTimeField(auto_now_add=True, verbose_name='Дата покупки')),
                ('algorithm', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='purchases', to='algorithms.algorithm')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='algorithm_purchases', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Покупка алгоритма',
                'verbose_name_plural': 'Покупки алгоритмов',
                'ordering': ['-purchased_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='algorithmpurchase',
            constraint=models.UniqueConstraint(fields=('user', 'algorithm'), name='unique_user_algorithm_purchase'),
        ),
    ]
