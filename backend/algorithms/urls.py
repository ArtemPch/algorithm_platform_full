from django.urls import path
from . import views

urlpatterns = [
    path('', views.AlgorithmList.as_view(), name='algorithm_list'),
    path('<int:pk>/purchase/', views.purchase_algorithm, name='algorithm_purchase'),
    path('<int:pk>/price-history/', views.algorithm_price_history, name='algorithm_price_history'),
    path('<int:pk>/', views.AlgorithmDetail.as_view(), name='algorithm_detail'),
    path('moderation/', views.moderation_list, name='moderation_list'),
    path('moderation/<int:algorithm_id>/', views.moderate_algorithm, name='moderate_algorithm'),
]
