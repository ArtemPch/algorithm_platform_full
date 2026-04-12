from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from algorithms.models import Algorithm, AlgorithmPurchase
from algorithms.serializers import AlgorithmSerializer, AlgorithmPurchaseSerializer
from .serializers import UserSerializer, UserProfileUpdateSerializer, RegisterSerializer

User = get_user_model()

class UserList(generics.ListAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        username = self.request.query_params.get('username')
        if username:
            queryset = queryset.filter(username__icontains=username)
        return queryset

class UserDetail(generics.RetrieveAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'username'

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
def current_user(request):
    """
    GET: данные текущего пользователя.
    PUT/PATCH: обновление профиля (email, имя, фамилия, логин).
    """
    if request.method == 'GET':
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    partial = request.method == 'PATCH'
    serializer = UserProfileUpdateSerializer(
        request.user,
        data=request.data,
        partial=partial,
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    request.user.refresh_from_db()
    return Response(UserSerializer(request.user).data)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def my_purchases(request):
    """Список купленных алгоритмов текущего пользователя (с кодом)."""
    qs = (
        AlgorithmPurchase.objects.filter(user=request.user)
        .select_related('algorithm')
        .order_by('-purchased_at')
    )
    serializer = AlgorithmPurchaseSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def user_algorithms(request, username):
    """
    Возвращает алгоритмы указанного пользователя.
    Если запрашивает сам пользователь или staff — показываются все,
    иначе — только одобренные.
    """
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return Response({'detail': 'Пользователь не найден.'}, status=status.HTTP_404_NOT_FOUND)

    algorithms = Algorithm.objects.filter(author_name=username).order_by('-created_at')

    if request.user.is_authenticated and (request.user.username == username or request.user.is_staff):
        pass
    else:
        algorithms = algorithms.filter(status=Algorithm.STATUS_APPROVED)

    serializer = AlgorithmSerializer(algorithms, many=True, context={'request': request})
    return Response(serializer.data)
