from django.urls import path
from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='register'),
    path('me/purchases/', views.my_purchases, name='my_purchases'),
    path('me/', views.current_user, name='current_user'),
    path('search/', views.UserList.as_view(), name='user_search'),
    path('<str:username>/', views.UserDetail.as_view(), name='user_profile'),
    path('<str:username>/algorithms/', views.user_algorithms, name='user_algorithms'),
]
