from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Algorithm, AlgorithmPurchase, AlgorithmPricePoint
from .serializers import AlgorithmSerializer

class IsModerator(permissions.BasePermission):
    """
    Разрешение: только модераторы (staff или в группе 'Модераторы').
    """
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.groups.filter(name='Модераторы').exists()))

class AlgorithmList(generics.ListCreateAPIView):
    """
    GET: список алгоритмов (фильтрация: q)
    POST: создание алгоритма (автор берётся из request.user)
    """
    serializer_class = AlgorithmSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Algorithm.objects.all()
        query = self.request.query_params.get('q')
        user = self.request.user

        if not user.is_authenticated:
            queryset = queryset.filter(status=Algorithm.STATUS_APPROVED)
        else:
            if not (user.is_staff or user.groups.filter(name='Модераторы').exists()):
                queryset = queryset.filter(
                    Q(status=Algorithm.STATUS_APPROVED) | Q(author_name=user.username)
                )

        if query:
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(tegs__icontains=query) |
                Q(description__icontains=query) |
                Q(author_name__icontains=query)
            )

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(status=Algorithm.STATUS_PENDING)

class AlgorithmDetail(generics.RetrieveUpdateDestroyAPIView):
    """
    Просмотр / редактирование / удаление алгоритма.
    Правило: только автор может редактировать/удалять; модераторы имеют отдельные endpoints для модерации.
    """
    queryset = Algorithm.objects.all()
    serializer_class = AlgorithmSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Algorithm.objects.all()
        user = self.request.user

        if not user.is_authenticated:
            queryset = queryset.filter(status=Algorithm.STATUS_APPROVED)
        else:
            if not (user.is_staff or user.groups.filter(name='Модераторы').exists()):
                queryset = queryset.filter(Q(status=Algorithm.STATUS_APPROVED) | Q(author_name=user.username))
        return queryset

    def update(self, request, *args, **kwargs):
        algorithm = self.get_object()
        if not algorithm.can_edit(request.user):
            return Response({'detail': 'У вас нет прав для редактирования этого алгоритма.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        algorithm = self.get_object()
        if not algorithm.can_edit(request.user):
            return Response({'detail': 'У вас нет прав для удаления этого алгоритма.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def purchase_algorithm(request, pk):
    """
    Заглушка оплаты: при успешном запросе фиксируем покупку и возвращаем алгоритм с кодом.
    """
    algorithm = get_object_or_404(Algorithm, pk=pk)
    if not algorithm.can_view(request.user):
        return Response({'detail': 'Алгоритм недоступен.'}, status=status.HTTP_404_NOT_FOUND)
    if algorithm.status != Algorithm.STATUS_APPROVED:
        return Response({'detail': 'Можно купить только одобренный алгоритм.'}, status=status.HTTP_400_BAD_REQUEST)
    if not algorithm.is_paid:
        return Response({'detail': 'Этот алгоритм бесплатный, покупка не требуется.'}, status=status.HTTP_400_BAD_REQUEST)
    if algorithm.author_name == request.user.username:
        return Response({'detail': 'Нельзя купить собственный алгоритм.'}, status=status.HTTP_400_BAD_REQUEST)

    price = int(algorithm.price or 0)
    purchase, created = AlgorithmPurchase.objects.get_or_create(
        user=request.user,
        algorithm=algorithm,
        defaults={'purchase_price': price},
    )
    if not created and purchase.purchase_price == 0 and price:
        purchase.purchase_price = price
        purchase.save(update_fields=['purchase_price'])

    serializer = AlgorithmSerializer(algorithm, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def algorithm_price_history(request, pk):
    """
    История цены платного алгоритма (для графика). Доступ как у карточки алгоритма.
    """
    algorithm = get_object_or_404(Algorithm, pk=pk)
    if not algorithm.can_view(request.user):
        return Response({'detail': 'Алгоритм не найден.'}, status=status.HTTP_404_NOT_FOUND)
    if not algorithm.is_paid:
        return Response([])
    points = AlgorithmPricePoint.objects.filter(algorithm=algorithm).order_by('recorded_at')
    return Response(
        [{'recorded_at': p.recorded_at.isoformat(), 'price': p.price} for p in points]
    )


@api_view(['GET'])
@permission_classes([IsModerator])
def moderation_list(request):
    """
    Список алгоритмов на модерации — доступен только модераторам.
    """
    pending_algorithms = Algorithm.objects.filter(status=Algorithm.STATUS_PENDING).order_by('created_at')
    serializer = AlgorithmSerializer(pending_algorithms, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsModerator])
def moderate_algorithm(request, algorithm_id):
    """
    Endpoint для модерации: установить approved/rejected + указать причину.
    """
    try:
        algorithm = Algorithm.objects.get(id=algorithm_id, status=Algorithm.STATUS_PENDING)
    except Algorithm.DoesNotExist:
        return Response({'detail': 'Алгоритм не найден или уже прошел модерацию.'}, status=status.HTTP_404_NOT_FOUND)

    status_action = request.data.get('status')
    rejection_reason = request.data.get('rejection_reason', '')

    if status_action not in [Algorithm.STATUS_APPROVED, Algorithm.STATUS_REJECTED]:
        return Response({'detail': 'Неверный статус. Допустимые значения: "approved", "rejected".'}, status=status.HTTP_400_BAD_REQUEST)

    algorithm.status = status_action
    algorithm.rejection_reason = rejection_reason if status_action == Algorithm.STATUS_REJECTED else ''
    algorithm.moderated_by = request.user
    algorithm.moderated_at = timezone.now()
    algorithm.save()

    serializer = AlgorithmSerializer(algorithm, context={'request': request})
    return Response(serializer.data)
