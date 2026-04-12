# Generated manually for paid algorithms + language/compiler

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('algorithms', '0007_remove_algorithm_algorithms__status_9941b7_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='algorithm',
            name='compiler',
            field=models.CharField(default='g++', max_length=50, verbose_name='Компилятор'),
        ),
        migrations.AddField(
            model_name='algorithm',
            name='is_paid',
            field=models.BooleanField(default=False, verbose_name='Платный'),
        ),
        migrations.AddField(
            model_name='algorithm',
            name='language',
            field=models.CharField(default='C++', max_length=50, verbose_name='Язык'),
        ),
        migrations.AddField(
            model_name='algorithm',
            name='price',
            field=models.PositiveIntegerField(default=0, verbose_name='Цена, ₽'),
        ),
    ]
